import { EventTypes } from '@netscope/shared/events';
import { create } from 'zustand';
import * as alertService from '@/services/alertService';
import { alertFiltersKey, matchesAlertFilters, toAlertQuery, withStatus } from '@/utils/alerts';

/**
 * Alerts: the counts behind the navigation badge, the Alerts page list (one filtered list at a
 * time, cursor pages), and the alerts of the device shown on its details page.
 *
 * Kept current by real-time events: alert.created adds the alert to every loaded list it
 * belongs in, alert.updated replaces it where it is shown, alerts.updated (mark all read,
 * resolve all) changes the shown ones; every alert event carries the exact counts. Changing an
 * alert's state is optimistic: it shows at once and is undone if the server refuses.
 */

export const ALERT_PAGE_SIZE = 25;
export const DEVICE_ALERT_LIMIT = 5;

const ZERO_COUNTS = { unread: 0, read: 0, resolved: 0 };

const initialList = {
  /** @type {string | null} */
  key: null,
  /** @type {{ status: string, type: string, deviceId: string | null } | null} */
  filters: null,
  /** @type {import('@/types/api').Alert[]} newest first */
  items: [],
  /** @type {string | null} */
  nextCursor: null,
  /** @type {'idle' | 'loading' | 'success' | 'error'} */
  status: 'idle',
  /** @type {import('@/services/apiClient').ApiError | null} */
  error: null,
  isLoadingMore: false,
  /** @type {import('@/services/apiClient').ApiError | null} */
  moreError: null,
};

const initialDevice = {
  /** @type {string | null} */
  deviceId: null,
  /** @type {import('@/types/api').Alert[]} newest first, at most DEVICE_ALERT_LIMIT */
  items: [],
  /** @type {string | null} more alerts exist */
  nextCursor: null,
  /** @type {'idle' | 'loading' | 'success' | 'error'} */
  status: 'idle',
};

const initialState = {
  /** @type {import('@/types/api').AlertCounts} */
  counts: ZERO_COUNTS,
  /** @type {'idle' | 'loading' | 'success' | 'error'} */
  summaryStatus: 'idle',
  /** @type {{ returnAfterMs: number, cooldownMs: number } | null} */
  policy: null,
  list: initialList,
  device: initialDevice,
  /** alertId → true while its new state is being saved */
  pending: {},
  /** alertId → epoch ms when it arrived live (drives the highlight) */
  arrivedAt: {},
};

let listSession = null;
let deviceSession = null;
let summaryController = null;

/** Replaces an alert wherever it is shown. */
function replaceIn(items, alert) {
  return items.some((item) => item.id === alert.id)
    ? items.map((item) => (item.id === alert.id ? alert : item))
    : items;
}

export const useAlertStore = create((set, get) => {
  const updateShown = (update) =>
    set((state) => ({
      list: { ...state.list, items: state.list.items.map(update) },
      device: { ...state.device, items: state.device.items.map(update) },
    }));

  async function loadListPage(key, signal, before = null) {
    const page = await alertService.listAlerts({
      ...toAlertQuery(get().list.filters),
      limit: ALERT_PAGE_SIZE,
      before,
      signal,
    });
    return signal.aborted || get().list.key !== key ? null : page;
  }

  return {
    ...initialState,

    /** Loads the counts (and the rules' settings). Concurrent calls cancel the older one. */
    async loadSummary() {
      summaryController?.abort();
      const controller = new AbortController();
      summaryController = controller;
      if (get().summaryStatus !== 'success') set({ summaryStatus: 'loading' });
      try {
        const { counts, policy } = await alertService.getAlertSummary({
          signal: controller.signal,
        });
        set({ counts, policy, summaryStatus: 'success' });
      } catch {
        if (!controller.signal.aborted && get().summaryStatus !== 'success') {
          set({ summaryStatus: 'error' });
        }
      }
    },

    /** Shows the list for `filters`: loads its first page. */
    async openList(filters) {
      const key = alertFiltersKey(filters);
      listSession?.abort();
      listSession = new AbortController();
      const { signal } = listSession;
      const keep = get().list.key === key && get().list.status === 'success';
      set((state) => ({
        list: keep
          ? { ...state.list, error: null }
          : { ...initialList, key, filters, status: 'loading' },
      }));
      try {
        const page = await loadListPage(key, signal);
        if (!page) return;
        set((state) => ({
          list: { ...state.list, ...page, status: 'success', error: null, moreError: null },
        }));
      } catch (error) {
        if (signal.aborted || get().list.key !== key) return;
        set((state) => ({
          list:
            state.list.status === 'success'
              ? { ...state.list, error }
              : { ...state.list, status: 'error', error },
        }));
      }
    },

    /** Reloads the shown list (after a reconnection, or to retry). */
    refreshList() {
      const { filters } = get().list;
      if (!listSession || !filters) return Promise.resolve();
      return get().openList(filters);
    },

    /** Appends the next (older) page. */
    async loadMore() {
      const { key, nextCursor, isLoadingMore } = get().list;
      if (!listSession || !nextCursor || isLoadingMore) return;
      const { signal } = listSession;
      set((state) => ({ list: { ...state.list, isLoadingMore: true, moreError: null } }));
      try {
        const page = await loadListPage(key, signal, nextCursor);
        if (!page) return;
        set((state) => {
          const known = new Set(state.list.items.map((item) => item.id));
          return {
            list: {
              ...state.list,
              items: [...state.list.items, ...page.items.filter((item) => !known.has(item.id))],
              nextCursor: page.nextCursor,
              isLoadingMore: false,
            },
          };
        });
      } catch (error) {
        if (signal.aborted || get().list.key !== key) return;
        set((state) => ({ list: { ...state.list, isLoadingMore: false, moreError: error } }));
      }
    },

    /** The Alerts page was left. */
    closeList() {
      listSession?.abort();
      listSession = null;
      set((state) => ({
        list: {
          ...state.list,
          status: state.list.status === 'loading' ? 'idle' : state.list.status,
          isLoadingMore: false,
        },
      }));
    },

    /** Loads the newest alerts of the device shown on its details page. */
    async openDevice(deviceId) {
      deviceSession?.abort();
      deviceSession = new AbortController();
      const { signal } = deviceSession;
      if (get().device.deviceId !== deviceId) {
        set({ device: { ...initialDevice, deviceId, status: 'loading' } });
      }
      try {
        const page = await alertService.listAlerts({
          deviceId,
          limit: DEVICE_ALERT_LIMIT,
          signal,
        });
        if (signal.aborted || get().device.deviceId !== deviceId) return;
        set({ device: { deviceId, ...page, status: 'success' } });
      } catch {
        if (signal.aborted || get().device.deviceId !== deviceId) return;
        set((state) => ({
          device: {
            ...state.device,
            status: state.device.status === 'success' ? 'success' : 'error',
          },
        }));
      }
    },

    /** The device page was left. */
    closeDevice() {
      deviceSession?.abort();
      deviceSession = null;
    },

    /**
     * Moves one alert to `status`. Shown at once; undone (and rethrown) if the server refuses.
     * @param {import('@/types/api').Alert} alert
     * @param {'unread' | 'read' | 'resolved'} status
     */
    async setStatus(alert, status) {
      if (alert.status === status || get().pending[alert.id]) return;
      const move = (counts, from, to) => ({
        ...counts,
        [from]: counts[from] - 1,
        [to]: counts[to] + 1,
      });
      set((state) => ({
        pending: { ...state.pending, [alert.id]: true },
        counts: move(state.counts, alert.status, status),
      }));
      updateShown((item) => (item.id === alert.id ? withStatus(item, status) : item));
      try {
        const saved = await alertService.updateAlertStatus(alert.id, status);
        updateShown((item) => (item.id === saved.id ? saved : item));
      } catch (error) {
        updateShown((item) => (item.id === alert.id ? alert : item));
        set((state) => ({ counts: move(state.counts, status, alert.status) }));
        throw error;
      } finally {
        set((state) => {
          const pending = { ...state.pending };
          delete pending[alert.id];
          return { pending };
        });
      }
    },

    /** Marks every unread alert read. */
    async markAllRead() {
      const { counts } = await alertService.markAllAlertsRead();
      set({ counts });
      updateShown((item) => (item.status === 'unread' ? withStatus(item, 'read') : item));
    },

    /** Resolves every open alert. */
    async resolveAll() {
      const { counts } = await alertService.resolveAllAlerts();
      set({ counts });
      updateShown((item) => (item.status === 'resolved' ? item : withStatus(item, 'resolved')));
    },

    /**
     * Applies one real-time event. Safe to call with any event, and with the same event twice.
     * @param {{ type: string, data: any, timestamp?: string }} event
     */
    applyEvent({ type, data, timestamp }) {
      if (type === EventTypes.ALERT_CREATED) {
        const { alert } = data;
        set((state) => {
          const { list, device } = state;
          const inList =
            list.status === 'success' &&
            matchesAlertFilters(alert, list.filters) &&
            !list.items.some((item) => item.id === alert.id);
          const inDevice =
            device.status === 'success' &&
            alert.device?.id === device.deviceId &&
            !device.items.some((item) => item.id === alert.id);
          return {
            counts: data.counts ?? state.counts,
            list: inList ? { ...list, items: [alert, ...list.items] } : list,
            device: inDevice
              ? { ...device, items: [alert, ...device.items].slice(0, DEVICE_ALERT_LIMIT) }
              : device,
            arrivedAt: { ...state.arrivedAt, [alert.id]: Date.now() },
          };
        });
        return;
      }

      if (type === EventTypes.ALERT_UPDATED) {
        set((state) => ({
          counts: data.counts ?? state.counts,
          list: { ...state.list, items: replaceIn(state.list.items, data.alert) },
          device: { ...state.device, items: replaceIn(state.device.items, data.alert) },
        }));
        return;
      }

      if (type === EventTypes.ALERTS_UPDATED) {
        const ids = new Set(data.ids);
        set({ counts: data.counts });
        updateShown((item) => (ids.has(item.id) ? withStatus(item, data.status, timestamp) : item));
      }
    },
  };
});

/** Test helper: restore the initial state. */
export function resetAlertStore() {
  listSession?.abort();
  deviceSession?.abort();
  summaryController?.abort();
  listSession = null;
  deviceSession = null;
  summaryController = null;
  useAlertStore.setState(initialState);
}
