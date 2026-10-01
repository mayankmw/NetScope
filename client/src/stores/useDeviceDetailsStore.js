import { EventTypes } from '@netscope/shared/events';
import { create } from 'zustand';
import * as deviceService from '@/services/deviceService';

/**
 * The device shown on the details page: its details, its timeline (`events`), and its discovery
 * history (`observations`). One device at a time.
 *
 * Kept current like the inventory ("snapshot + delta"):
 * - REST: `open()` loads everything; `refresh()` reloads it in the background and adds new
 *   history entries on top of the pages already loaded ("Load more" pages are kept).
 * - Real-time events about this device update it at once (newer `updatedAt` only). Its history
 *   and presence changed too, so a refresh follows shortly; the burst of events one discovery
 *   produces becomes a single refresh.
 *
 * `close()` (page unmounted) cancels requests and timers but keeps the data, so returning to the
 * same device shows it immediately while it refreshes.
 */

export const HISTORY_PAGE_SIZE = 20;
const REFRESH_DELAY_MS = 400;

/** History name → service function name (resolved at call time, so tests can mock the module). */
const HISTORY_SOURCES = {
  events: 'listDeviceEvents',
  observations: 'listDeviceObservations',
};

const DEVICE_EVENTS = new Set([
  EventTypes.DEVICE_DISCOVERED,
  EventTypes.DEVICE_UPDATED,
  EventTypes.DEVICE_ONLINE,
  EventTypes.DEVICE_OFFLINE,
]);

const initialHistory = {
  /** @type {Array<{ id: string }>} newest first */
  items: [],
  /** @type {string | null} */
  nextCursor: null,
  /** @type {'idle' | 'loading' | 'success' | 'error'} */
  status: 'idle',
  /** @type {import('@/services/apiClient').ApiError | null} first page failed */
  error: null,
  isLoadingMore: false,
  /** @type {import('@/services/apiClient').ApiError | null} "Load more" failed */
  moreError: null,
};

const initialState = {
  /** @type {string | null} */
  deviceId: null,
  /** @type {'idle' | 'loading' | 'success' | 'not-found' | 'error'} */
  status: 'idle',
  /** @type {import('@/services/apiClient').ApiError | null} */
  error: null,
  /** @type {import('@/types/api').DeviceDetails | null} */
  details: null,
  isRefreshing: false,
  /** @type {number | null} epoch ms of the last real-time change (drives the highlight) */
  changedAt: null,
  events: initialHistory,
  observations: initialHistory,
};

/** Cancels every request of the current page visit; null while no page is open. */
let session = null;
let refreshTimer = null;

function isOlder(incoming, existing) {
  return (
    existing?.updatedAt &&
    incoming?.updatedAt &&
    new Date(incoming.updatedAt) < new Date(existing.updatedAt)
  );
}

/** A device that is not found, or whose id the server rejects, is "not found" to the user. */
function isNotFound(error) {
  return error?.status === 404 || error?.code === 'VALIDATION_ERROR';
}

/**
 * Puts a freshly loaded first page on top of the pages already loaded. When the two do not
 * overlap, more entries arrived than one page holds; the older pages are dropped rather than
 * shown with a gap.
 *
 * @param {{ items: Array<{ id: string }>, nextCursor: string | null }} current
 * @param {{ items: Array<{ id: string }>, nextCursor: string | null }} page
 */
export function mergeNewestPage(current, page) {
  const known = new Set(current.items.map((item) => item.id));
  if (!page.items.some((item) => known.has(item.id))) {
    return { items: page.items, nextCursor: page.nextCursor };
  }
  return {
    items: [...page.items.filter((item) => !known.has(item.id)), ...current.items],
    nextCursor: current.nextCursor,
  };
}

export const useDeviceDetailsStore = create((set, get) => {
  /** True while `deviceId` is still the device on screen and this visit was not closed. */
  const isCurrent = (deviceId, signal) => !signal.aborted && get().deviceId === deviceId;

  async function loadDetails(deviceId, signal) {
    try {
      const details = await deviceService.getDevice(deviceId, { signal });
      if (!isCurrent(deviceId, signal)) return;
      set((state) => ({
        status: 'success',
        error: null,
        isRefreshing: false,
        // A live update may have arrived while this request was in flight.
        details: isOlder(details.device, state.details?.device)
          ? { ...details, device: state.details.device }
          : details,
      }));
    } catch (error) {
      if (!isCurrent(deviceId, signal)) return;
      if (isNotFound(error)) {
        set({ status: 'not-found', error, details: null, isRefreshing: false });
      } else if (get().status === 'success') {
        set({ error, isRefreshing: false }); // keep showing the last data
      } else {
        set({ status: 'error', error, isRefreshing: false });
      }
    }
  }

  async function loadFirstPage(kind, deviceId, signal) {
    try {
      const page = await deviceService[HISTORY_SOURCES[kind]](deviceId, {
        limit: HISTORY_PAGE_SIZE,
        signal,
      });
      if (!isCurrent(deviceId, signal)) return;
      set((state) => ({
        [kind]: { ...state[kind], ...mergeNewestPage(state[kind], page), status: 'success' },
      }));
    } catch (error) {
      if (!isCurrent(deviceId, signal)) return;
      // A failed background refresh keeps the entries already shown.
      set((state) =>
        state[kind].status === 'success'
          ? state
          : { [kind]: { ...state[kind], status: 'error', error } },
      );
    }
  }

  function scheduleRefresh() {
    if (!session) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => get().refresh(), REFRESH_DELAY_MS);
  }

  return {
    ...initialState,

    /** Shows `deviceId`: loads it, or refreshes it if it is already loaded. */
    open(deviceId) {
      const state = get();
      if (session && state.deviceId === deviceId && state.status === 'loading') return;
      if (state.deviceId === deviceId && state.status === 'success') {
        session ??= new AbortController();
        return get().refresh();
      }

      session?.abort();
      clearTimeout(refreshTimer);
      session = new AbortController();
      const { signal } = session;
      set({
        ...initialState,
        deviceId,
        status: 'loading',
        events: { ...initialHistory, status: 'loading' },
        observations: { ...initialHistory, status: 'loading' },
      });
      return Promise.all([
        loadDetails(deviceId, signal),
        loadFirstPage('events', deviceId, signal),
        loadFirstPage('observations', deviceId, signal),
      ]).then(() => undefined);
    },

    /** Reloads the open device in the background (or retries a failed load). */
    refresh() {
      const { deviceId, status } = get();
      if (!session || !deviceId || status === 'loading') return Promise.resolve();
      if (status !== 'success') return get().open(deviceId);

      clearTimeout(refreshTimer);
      const { signal } = session;
      set({ isRefreshing: true, error: null });
      return Promise.all([
        loadDetails(deviceId, signal),
        loadFirstPage('events', deviceId, signal),
        loadFirstPage('observations', deviceId, signal),
      ]).then(() => undefined);
    },

    /** Retries a history whose first page failed. @param {'events' | 'observations'} kind */
    retryHistory(kind) {
      const { deviceId } = get();
      if (!session || !deviceId) return Promise.resolve();
      set((state) => ({ [kind]: { ...state[kind], status: 'loading', error: null } }));
      return loadFirstPage(kind, deviceId, session.signal);
    },

    /** Appends the next (older) page of a history. @param {'events' | 'observations'} kind */
    async loadMore(kind) {
      const { deviceId } = get();
      const history = get()[kind];
      if (!session || !history.nextCursor || history.isLoadingMore) return;

      const { signal } = session;
      set((state) => ({ [kind]: { ...state[kind], isLoadingMore: true, moreError: null } }));
      try {
        const page = await deviceService[HISTORY_SOURCES[kind]](deviceId, {
          limit: HISTORY_PAGE_SIZE,
          before: history.nextCursor,
          signal,
        });
        if (!isCurrent(deviceId, signal)) return;
        set((state) => {
          const known = new Set(state[kind].items.map((item) => item.id));
          return {
            [kind]: {
              ...state[kind],
              items: [...state[kind].items, ...page.items.filter((item) => !known.has(item.id))],
              nextCursor: page.nextCursor,
              isLoadingMore: false,
            },
          };
        });
      } catch (error) {
        if (!isCurrent(deviceId, signal)) return;
        set((state) => ({ [kind]: { ...state[kind], isLoadingMore: false, moreError: error } }));
      }
    },

    /** The page was left: cancel requests and timers, keep the data. */
    close() {
      session?.abort();
      session = null;
      clearTimeout(refreshTimer);
      const settle = (history) => ({
        ...history,
        status: history.status === 'loading' ? 'idle' : history.status,
        isLoadingMore: false,
      });
      set((state) => ({
        status: state.status === 'loading' ? 'idle' : state.status,
        isRefreshing: false,
        events: settle(state.events),
        observations: settle(state.observations),
      }));
    },

    /**
     * Applies one real-time event. Safe to call with any event, and with the same event twice.
     * @param {{ type: string, data: any }} event
     */
    applyEvent({ type, data }) {
      const { deviceId, details } = get();
      if (!deviceId || !details) return;

      if (DEVICE_EVENTS.has(type)) {
        if (data.device?.id !== deviceId) return;
        set((state) => {
          if (isOlder(data.device, state.details.device)) return state;
          return {
            details: { ...state.details, device: { ...state.details.device, ...data.device } },
            changedAt: Date.now(),
          };
        });
        scheduleRefresh();
        return;
      }

      if (type === EventTypes.DISCOVERY_COMPLETED && data.networkId === details.network.id) {
        const seen = data.seenDeviceIds?.includes(deviceId);
        set((state) => ({
          details: {
            ...state.details,
            device: seen
              ? { ...state.details.device, status: 'online', lastSeenAt: data.finishedAt }
              : state.details.device,
            network: {
              ...state.details.network,
              lastScan: { id: data.scanId, finishedAt: data.finishedAt },
            },
          },
        }));
        // Presence counts changed for every device of the network.
        scheduleRefresh();
      }
    },
  };
});

/** Test helper: restore the initial state. */
export function resetDeviceDetailsStore() {
  session?.abort();
  session = null;
  clearTimeout(refreshTimer);
  useDeviceDetailsStore.setState(initialState);
}
