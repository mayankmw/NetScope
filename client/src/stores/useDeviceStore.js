import { create } from 'zustand';
import * as deviceService from '@/services/deviceService';

/**
 * Device inventory and discovery state for the current network.
 *
 * - Devices are normalized (`byId` + ordered `ids`) so later live updates (WebSockets, Step 5)
 *   can replace a single device without rebuilding the list.
 * - `status` describes the first load. Once data is shown, refreshes keep it visible
 *   (`isRefreshing`) and a failed refresh sets `error` without discarding the data.
 * - Components never call services directly: they read state and call these actions.
 */

/** @param {import('@/types/api').Device[]} devices */
function normalize(devices) {
  const byId = {};
  const ids = [];
  for (const device of devices) {
    byId[device.id] = device;
    ids.push(device.id);
  }
  return { byId, ids };
}

const initialState = {
  /** @type {import('@/types/api').Network | null} */
  network: null,
  /** @type {Record<string, import('@/types/api').Device>} */
  byId: {},
  /** @type {string[]} */
  ids: [],
  /** @type {'idle' | 'loading' | 'success' | 'error'} */
  status: 'idle',
  isRefreshing: false,
  /** @type {import('@/services/apiClient').ApiError | null} */
  error: null,
  /** @type {number | null} epoch ms of the last successful load */
  loadedAt: null,
  discovery: {
    /** @type {'idle' | 'running' | 'success' | 'error'} */
    status: 'idle',
    /** @type {import('@/services/apiClient').ApiError | null} */
    error: null,
    /** @type {import('@/types/api').DiscoverySummary | null} */
    summary: null,
    /** @type {number | null} */
    finishedAt: null,
  },
  /** deviceId → previous IP, for IP changes seen by the latest discovery in this session. */
  recentIpChanges: {},
};

let listController = null;

export const useDeviceStore = create((set, get) => ({
  ...initialState,

  /** Loads (or reloads) the inventory. Concurrent calls cancel the older request. */
  async fetchDevices() {
    listController?.abort();
    const controller = new AbortController();
    listController = controller;

    const hasData = get().status === 'success';
    set({ status: hasData ? 'success' : 'loading', isRefreshing: hasData, error: null });

    try {
      const { network, devices } = await deviceService.listDevices({ signal: controller.signal });
      set({
        network,
        ...normalize(devices),
        status: 'success',
        isRefreshing: false,
        error: null,
        loadedAt: Date.now(),
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      set({ status: hasData ? 'success' : 'error', isRefreshing: false, error });
    } finally {
      if (listController === controller) listController = null;
    }
  },

  /**
   * Runs a discovery, then reloads the full inventory (the discovery response only contains
   * devices seen by this scan, not the ones that went offline). Rejects with the ApiError on
   * failure so the caller can report it.
   */
  async discoverNetwork() {
    if (get().discovery.status === 'running') return null;
    set((state) => ({ discovery: { ...state.discovery, status: 'running', error: null } }));

    try {
      const result = await deviceService.discoverDevices();
      set({
        discovery: {
          status: 'success',
          error: null,
          summary: result.summary,
          finishedAt: Date.now(),
        },
        recentIpChanges: Object.fromEntries(
          result.devices
            .filter((device) => device.previousIpAddress)
            .map((device) => [device.id, device.previousIpAddress]),
        ),
      });
      await get().fetchDevices();
      return result;
    } catch (error) {
      set((state) => ({ discovery: { ...state.discovery, status: 'error', error } }));
      throw error;
    }
  },
}));

/** Test helper: restore the initial state. */
export function resetDeviceStore() {
  listController?.abort();
  listController = null;
  useDeviceStore.setState(initialState);
}
