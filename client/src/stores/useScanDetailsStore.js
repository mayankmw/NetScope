import { EventTypes } from '@netscope/shared/events';
import { create } from 'zustand';
import * as scanService from '@/services/scanService';

/**
 * The scan shown on the scan details page. One scan at a time.
 *
 * Kept current by real-time events: when the shown scan finishes or fails (it was still running),
 * or when a newer scan of the same network or device finishes (its "next" link changes), it is
 * reloaded shortly after. `close()` cancels requests and timers but keeps the data.
 */

const REFRESH_DELAY_MS = 300;

const END_EVENTS = new Set([
  EventTypes.DISCOVERY_COMPLETED,
  EventTypes.DISCOVERY_FAILED,
  EventTypes.PORT_SCAN_COMPLETED,
  EventTypes.PORT_SCAN_FAILED,
]);

const initialState = {
  /** @type {string | null} */
  scanId: null,
  /** @type {'idle' | 'loading' | 'success' | 'not-found' | 'error'} */
  status: 'idle',
  /** @type {import('@/types/api').ScanDetails | null} */
  data: null,
  /** @type {import('@/services/apiClient').ApiError | null} */
  error: null,
  isRefreshing: false,
};

let session = null;
let refreshTimer = null;

/** A scan that is not found, or whose id the server rejects, is "not found" to the user. */
function isNotFound(error) {
  return error?.status === 404 || error?.code === 'VALIDATION_ERROR';
}

/** Whether an event's scan is the shown scan, or a later one in the same history. */
function concerns(data, event) {
  const { scan, next } = data;
  if (event.data.scanId === scan.id) return true;
  if (next) return false;
  const isPort = event.type.startsWith('portscan.');
  if (isPort !== (scan.type === 'port')) return false;
  return isPort
    ? event.data.deviceId === scan.device?.id
    : event.data.networkId === scan.network?.id;
}

export const useScanDetailsStore = create((set, get) => {
  const isCurrent = (scanId, signal) => !signal.aborted && get().scanId === scanId;

  async function load(scanId, signal) {
    try {
      const data = await scanService.getScan(scanId, { signal });
      if (!isCurrent(scanId, signal)) return;
      set({ status: 'success', data, error: null, isRefreshing: false });
    } catch (error) {
      if (!isCurrent(scanId, signal)) return;
      if (isNotFound(error)) {
        set({ status: 'not-found', data: null, error, isRefreshing: false });
      } else if (get().status === 'success') {
        set({ error, isRefreshing: false }); // keep showing the last data
      } else {
        set({ status: 'error', error, isRefreshing: false });
      }
    }
  }

  return {
    ...initialState,

    /** Shows `scanId`: loads it, or refreshes it if it is already loaded. */
    open(scanId) {
      const state = get();
      if (session && state.scanId === scanId && state.status === 'loading') {
        return Promise.resolve();
      }
      if (state.scanId === scanId && state.status === 'success') {
        session ??= new AbortController();
        return get().refresh();
      }

      session?.abort();
      clearTimeout(refreshTimer);
      session = new AbortController();
      set({ ...initialState, scanId, status: 'loading' });
      return load(scanId, session.signal);
    },

    /** Reloads the shown scan in the background (or retries a failed load). */
    refresh() {
      const { scanId, status } = get();
      if (!session || !scanId || status === 'loading') return Promise.resolve();
      clearTimeout(refreshTimer);
      if (status !== 'success') {
        set({ status: 'loading', error: null });
      } else {
        set({ isRefreshing: true, error: null });
      }
      return load(scanId, session.signal);
    },

    /** The page was left: cancel requests and timers, keep the data. */
    close() {
      session?.abort();
      session = null;
      clearTimeout(refreshTimer);
      set((state) => ({
        status: state.status === 'loading' ? 'idle' : state.status,
        isRefreshing: false,
      }));
    },

    /**
     * Applies one real-time event. Safe to call with any event.
     * @param {{ type: string, data: any }} event
     */
    applyEvent(event) {
      const { data, status } = get();
      if (!session || status !== 'success' || !END_EVENTS.has(event.type)) return;
      if (!concerns(data, event)) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => get().refresh(), REFRESH_DELAY_MS);
    },
  };
});

/** Test helper: restore the initial state. */
export function resetScanDetailsStore() {
  session?.abort();
  session = null;
  clearTimeout(refreshTimer);
  useScanDetailsStore.setState(initialState);
}
