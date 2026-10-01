import { EventTypes } from '@netscope/shared/events';
import { create } from 'zustand';
import * as scanService from '@/services/scanService';
import { mergeFirstPage, scanFiltersKey, toScanQuery } from '@/utils/scans';

/**
 * The scan history list shown on the Scans page: one filtered list at a time (`filters`, `key`),
 * newest first, paginated with a cursor ("Load more").
 *
 * Kept current like the other stores ("snapshot + delta"): a scan starting, finishing, or failing
 * anywhere (discovery.* and portscan.* events) reloads the first page shortly after, and the
 * fresh page is merged on top of the pages already loaded. A burst of events becomes one reload.
 *
 * `close()` (page left) cancels requests and timers but keeps the data, so coming back shows the
 * list at once while it refreshes.
 */

export const SCAN_PAGE_SIZE = 25;
const REFRESH_DELAY_MS = 300;

const SCAN_EVENT_TYPES = {
  [EventTypes.DISCOVERY_STARTED]: 'discovery',
  [EventTypes.DISCOVERY_COMPLETED]: 'discovery',
  [EventTypes.DISCOVERY_FAILED]: 'discovery',
  [EventTypes.PORT_SCAN_STARTED]: 'port',
  [EventTypes.PORT_SCAN_COMPLETED]: 'port',
  [EventTypes.PORT_SCAN_FAILED]: 'port',
};

const initialState = {
  /** @type {string | null} identifies the filtered list below */
  key: null,
  /** @type {{ type: 'discovery' | 'port', status: string, deviceId: string | null } | null} */
  filters: null,
  /** @type {import('@/types/api').Scan[]} newest first */
  items: [],
  /** @type {string | null} */
  nextCursor: null,
  /** @type {'idle' | 'loading' | 'success' | 'error'} */
  status: 'idle',
  /** @type {import('@/services/apiClient').ApiError | null} */
  error: null,
  isRefreshing: false,
  isLoadingMore: false,
  /** @type {import('@/services/apiClient').ApiError | null} "Load more" failed */
  moreError: null,
};

/** Cancels every request of the current page visit; null while the page is not shown. */
let session = null;
let refreshTimer = null;

export const useScanHistoryStore = create((set, get) => {
  const isCurrent = (key, signal) => !signal.aborted && get().key === key;

  async function loadFirstPage(key, signal) {
    try {
      const page = await scanService.listScans({
        ...toScanQuery(get().filters),
        limit: SCAN_PAGE_SIZE,
        signal,
      });
      if (!isCurrent(key, signal)) return;
      set((state) => ({
        ...mergeFirstPage(state, page),
        status: 'success',
        error: null,
        isRefreshing: false,
      }));
    } catch (error) {
      if (!isCurrent(key, signal)) return;
      // A failed background refresh keeps the scans already shown.
      set((state) =>
        state.status === 'success'
          ? { error, isRefreshing: false }
          : { status: 'error', error, isRefreshing: false },
      );
    }
  }

  return {
    ...initialState,

    /** Shows the list for `filters`: loads it, or refreshes it if it is already loaded. */
    open(filters) {
      const key = scanFiltersKey(filters);
      const state = get();
      if (session && state.key === key && state.status === 'loading') return Promise.resolve();
      if (state.key === key && state.status === 'success') {
        session ??= new AbortController();
        return get().refresh();
      }

      session?.abort();
      clearTimeout(refreshTimer);
      session = new AbortController();
      set({ ...initialState, key, filters, status: 'loading' });
      return loadFirstPage(key, session.signal);
    },

    /** Reloads the first page in the background (or retries a failed load). */
    refresh() {
      const { key, filters, status } = get();
      if (!session || !key || status === 'loading') return Promise.resolve();
      if (status !== 'success') {
        set({ ...initialState, key, filters, status: 'loading' });
        return loadFirstPage(key, session.signal);
      }
      clearTimeout(refreshTimer);
      set({ isRefreshing: true });
      return loadFirstPage(key, session.signal);
    },

    /** Appends the next (older) page. */
    async loadMore() {
      const { key, filters, nextCursor, isLoadingMore } = get();
      if (!session || !nextCursor || isLoadingMore) return;

      const { signal } = session;
      set({ isLoadingMore: true, moreError: null });
      try {
        const page = await scanService.listScans({
          ...toScanQuery(filters),
          limit: SCAN_PAGE_SIZE,
          before: nextCursor,
          signal,
        });
        if (!isCurrent(key, signal)) return;
        set((state) => {
          const known = new Set(state.items.map((item) => item.id));
          return {
            items: [...state.items, ...page.items.filter((item) => !known.has(item.id))],
            nextCursor: page.nextCursor,
            isLoadingMore: false,
          };
        });
      } catch (error) {
        if (!isCurrent(key, signal)) return;
        set({ isLoadingMore: false, moreError: error });
      }
    },

    /** The page was left: cancel requests and timers, keep the data. */
    close() {
      session?.abort();
      session = null;
      clearTimeout(refreshTimer);
      set((state) => ({
        status: state.status === 'loading' ? 'idle' : state.status,
        isRefreshing: false,
        isLoadingMore: false,
      }));
    },

    /**
     * Applies one real-time event: a scan of the listed type started, finished, or failed, so the
     * first page is reloaded shortly after. Safe to call with any event.
     * @param {{ type: string, data: any }} event
     */
    applyEvent({ type, data }) {
      const { filters, status } = get();
      const scanType = SCAN_EVENT_TYPES[type];
      if (!session || !scanType || !filters || status !== 'success') return;
      if (scanType !== filters.type) return;
      if (filters.deviceId && data.deviceId !== filters.deviceId) return;

      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => get().refresh(), REFRESH_DELAY_MS);
    },
  };
});

/** Test helper: restore the initial state. */
export function resetScanHistoryStore() {
  session?.abort();
  session = null;
  clearTimeout(refreshTimer);
  useScanHistoryStore.setState(initialState);
}
