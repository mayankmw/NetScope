import { EventTypes } from '@netscope/shared/events';
import { create } from 'zustand';
import * as deviceService from '@/services/deviceService';

/**
 * Port scans: the one scan running anywhere (`active`, which also blocks discovery: the server
 * runs one scan at a time), and each viewed device's ports (`byDevice`).
 *
 * Kept current by REST and real-time events: `portscan.started` marks the scan as running at
 * once; `portscan.completed` / `portscan.failed` reload that device's ports from the API, which
 * is the authority on results. Scans started from this tab are remembered (`localScanIds`), so
 * only they are announced with a toast.
 */

const initialEntry = {
  /** @type {'idle' | 'loading' | 'success' | 'error'} */
  status: 'idle',
  /** @type {import('@/types/api').DevicePorts | null} */
  data: null,
  /** @type {import('@/services/apiClient').ApiError | null} loading failed */
  error: null,
  isStarting: false,
  /** @type {import('@/services/apiClient').ApiError | null} the server refused to start a scan */
  startError: null,
};

const initialState = {
  /** @type {{ scanId: string, deviceId: string, startedAt: string } | null} */
  active: null,
  /** @type {Record<string, typeof initialEntry>} */
  byDevice: {},
  /** @type {string[]} scans started from this tab */
  localScanIds: [],
};

const controllers = new Map();

export const usePortScanStore = create((set, get) => {
  const update = (deviceId, changes) =>
    set((state) => ({
      byDevice: {
        ...state.byDevice,
        [deviceId]: { ...initialEntry, ...state.byDevice[deviceId], ...changes },
      },
    }));

  return {
    ...initialState,

    /** Loads a device's ports. With data already shown, reloads quietly. */
    async loadPorts(deviceId) {
      controllers.get(deviceId)?.abort();
      const controller = new AbortController();
      controllers.set(deviceId, controller);
      const hasData = get().byDevice[deviceId]?.status === 'success';
      if (!hasData) update(deviceId, { status: 'loading', error: null });

      try {
        const data = await deviceService.getDevicePorts(deviceId, { signal: controller.signal });
        update(deviceId, { status: 'success', data, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        update(deviceId, hasData ? { error } : { status: 'error', error });
      } finally {
        if (controllers.get(deviceId) === controller) controllers.delete(deviceId);
      }
    },

    /**
     * Asks the server to scan a device. Resolves with the started scan; rejects with the
     * ApiError when the server refuses (it is also kept as `startError`).
     */
    async startScan(deviceId) {
      if (get().byDevice[deviceId]?.isStarting) return null;
      update(deviceId, { isStarting: true, startError: null });
      try {
        const { scan } = await deviceService.startPortScan(deviceId);
        set((state) => ({
          localScanIds: [...state.localScanIds.slice(-19), scan.id],
          active: state.active ?? { scanId: scan.id, deviceId, startedAt: scan.startedAt },
        }));
        const entry = get().byDevice[deviceId];
        update(deviceId, {
          isStarting: false,
          // Unless a newer status already arrived by event, show the scan as running.
          data:
            entry?.data && entry.data.scan?.id !== scan.id ? { ...entry.data, scan } : entry?.data,
        });
        return scan;
      } catch (error) {
        update(deviceId, { isStarting: false, startError: error });
        throw error;
      }
    },

    isLocalScan(scanId) {
      return get().localScanIds.includes(scanId);
    },

    /**
     * Applies one real-time event. Safe to call with any event.
     * @param {{ type: string, data: any }} event
     */
    applyEvent({ type, data }) {
      switch (type) {
        case EventTypes.SYSTEM_CONNECTED: {
          const running = data.activePortScan;
          set({
            active: running
              ? { scanId: running.scanId, deviceId: running.deviceId, startedAt: running.startedAt }
              : null,
          });
          // Scans that finished while disconnected: reload the devices that showed one running.
          for (const [deviceId, entry] of Object.entries(get().byDevice)) {
            if (entry.data?.scan?.status === 'running' && running?.deviceId !== deviceId) {
              get().loadPorts(deviceId);
            }
          }
          return;
        }
        case EventTypes.PORT_SCAN_STARTED: {
          set({
            active: { scanId: data.scanId, deviceId: data.deviceId, startedAt: data.startedAt },
          });
          const entry = get().byDevice[data.deviceId];
          if (entry?.data && entry.data.scan?.id !== data.scanId) {
            update(data.deviceId, {
              data: {
                ...entry.data,
                scan: {
                  id: data.scanId,
                  status: 'running',
                  triggeredBy: data.triggeredBy,
                  ipAddress: data.ipAddress,
                  startedAt: data.startedAt,
                  finishedAt: null,
                  durationMs: null,
                  error: null,
                  summary: null,
                },
              },
            });
          }
          return;
        }
        case EventTypes.PORT_SCAN_COMPLETED:
        case EventTypes.PORT_SCAN_FAILED:
          set((state) => ({
            active: state.active?.scanId === data.scanId ? null : state.active,
          }));
          if (get().byDevice[data.deviceId]) get().loadPorts(data.deviceId);
          return;
        default:
      }
    },
  };
});

/** Test helper: restore the initial state. */
export function resetPortScanStore() {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
  usePortScanStore.setState(initialState);
}
