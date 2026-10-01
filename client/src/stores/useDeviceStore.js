import { EventTypes } from '@netscope/shared/events';
import { create } from 'zustand';
import * as deviceService from '@/services/deviceService';
import { compareIp } from '@/utils/ip';
import { isRealtimeConnected } from './useConnectionStore';

/**
 * Device inventory and discovery state for the current network.
 *
 * Two inputs keep it current ("snapshot + delta"):
 * - REST snapshots (`fetchDevices`): first load, manual refresh, and after every reconnection,
 *   so events missed while disconnected can never leave the list wrong.
 * - Real-time events (`applyEvent`): applied in place, idempotently. An event older than the
 *   device data already held (by `updatedAt`) is ignored, so a late event cannot undo a newer
 *   snapshot. Events for a different network are ignored.
 *
 * Devices are normalized (`byId` + IP-ordered `ids`) so an event updates one entry.
 * Components never call services directly: they read state and call these actions.
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

/** Inserts `id` into an IP-ordered id list. */
function insertInIpOrder(ids, byId, id) {
  const ip = byId[id].ipAddress;
  const index = ids.findIndex((other) => compareIp(byId[other].ipAddress, ip) > 0);
  return index === -1 ? [...ids, id] : [...ids.slice(0, index), id, ...ids.slice(index)];
}

function isOlder(incoming, existing) {
  return (
    existing?.updatedAt &&
    incoming.updatedAt &&
    new Date(incoming.updatedAt) < new Date(existing.updatedAt)
  );
}

const initialDiscovery = {
  /** @type {'idle' | 'running' | 'success' | 'error'} */
  status: 'idle',
  /** @type {string | null} scan announced by discovery.started */
  scanId: null,
  /** True while this tab's own POST /discover request is in flight. */
  localPending: false,
  /** @type {{ code: string, message: string } | null} */
  error: null,
  /** @type {import('@/types/api').DiscoverySummary | null} */
  summary: null,
  /** @type {number | null} */
  finishedAt: null,
};

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
  discovery: initialDiscovery,
  /** deviceId → previous IP, for IP changes seen in this session. */
  recentIpChanges: {},
  /** deviceId → epoch ms of its last real-time change (drives the row highlight). */
  changedAt: {},
};

let listController = null;

const DEVICE_EVENTS = new Set([
  EventTypes.DEVICE_DISCOVERED,
  EventTypes.DEVICE_UPDATED,
  EventTypes.DEVICE_ONLINE,
  EventTypes.DEVICE_OFFLINE,
]);

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
   * Runs a discovery from this tab. When real-time events are flowing they update the list as
   * the scan completes; otherwise the full inventory is reloaded afterwards (the discovery
   * response omits devices that went offline). Rejects with the ApiError on failure.
   */
  async discoverNetwork() {
    if (get().discovery.status === 'running') return null;
    set((state) => ({
      discovery: { ...state.discovery, status: 'running', localPending: true, error: null },
    }));

    try {
      const result = await deviceService.discoverDevices();
      set((state) => ({
        discovery: {
          ...state.discovery,
          status: 'success',
          scanId: result.scan.id,
          localPending: false,
          error: null,
          summary: result.summary,
          finishedAt: Date.now(),
        },
        recentIpChanges: {
          ...state.recentIpChanges,
          ...Object.fromEntries(
            result.devices
              .filter((device) => device.previousIpAddress)
              .map((device) => [device.id, device.previousIpAddress]),
          ),
        },
      }));
      if (!isRealtimeConnected() || !get().network) await get().fetchDevices();
      return result;
    } catch (error) {
      set((state) => ({
        discovery: { ...state.discovery, status: 'error', localPending: false, error },
      }));
      throw error;
    }
  },

  /**
   * Applies one real-time event. Safe to call with the same event twice.
   * @param {{ type: string, data: any }} event
   */
  applyEvent(event) {
    const { type, data } = event;

    if (DEVICE_EVENTS.has(type)) {
      const { network } = get();
      // Before the first snapshot (or on another network) the next snapshot will include it.
      if (!network || data.networkId !== network.id) return;
      set((state) => {
        const existing = state.byId[data.device.id];
        if (isOlder(data.device, existing)) return state;
        const byId = { ...state.byId, [data.device.id]: data.device };
        const ids = existing
          ? existing.ipAddress === data.device.ipAddress
            ? state.ids
            : insertInIpOrder(
                state.ids.filter((id) => id !== data.device.id),
                byId,
                data.device.id,
              )
          : insertInIpOrder(state.ids, byId, data.device.id);
        const previousIp = type === EventTypes.DEVICE_UPDATED ? data.previous?.ipAddress : null;
        return {
          byId,
          ids,
          changedAt: { ...state.changedAt, [data.device.id]: Date.now() },
          recentIpChanges: previousIp
            ? { ...state.recentIpChanges, [data.device.id]: previousIp }
            : state.recentIpChanges,
        };
      });
      return;
    }

    switch (type) {
      case EventTypes.SYSTEM_CONNECTED: {
        const active = data.activeDiscovery;
        set((state) => {
          if (active) {
            return { discovery: { ...state.discovery, status: 'running', scanId: active.scanId } };
          }
          // The server knows of no running scan (e.g. it restarted): clear a stale indicator.
          if (state.discovery.status === 'running' && !state.discovery.localPending) {
            return { discovery: { ...state.discovery, status: 'idle' } };
          }
          return state;
        });
        return;
      }

      case EventTypes.DISCOVERY_STARTED:
        set((state) => ({
          discovery: { ...state.discovery, status: 'running', scanId: data.scanId, error: null },
        }));
        return;

      case EventTypes.DISCOVERY_COMPLETED: {
        const { network } = get();
        if (!network || data.networkId !== network.id) {
          // First scan ever, or this machine is on another network now: load that inventory.
          get().fetchDevices();
        } else {
          set((state) => {
            const byId = { ...state.byId };
            for (const id of data.seenDeviceIds ?? []) {
              if (byId[id])
                byId[id] = { ...byId[id], status: 'online', lastSeenAt: data.finishedAt };
            }
            return {
              byId,
              network: {
                ...state.network,
                lastScan: { id: data.scanId, finishedAt: data.finishedAt },
              },
            };
          });
        }
        set((state) => ({
          discovery: {
            ...state.discovery,
            status: 'success',
            scanId: data.scanId,
            error: null,
            summary: data.summary,
            finishedAt: Date.now(),
          },
        }));
        return;
      }

      case EventTypes.DISCOVERY_FAILED:
        set((state) => ({
          discovery: {
            ...state.discovery,
            status: 'error',
            scanId: data.scanId,
            error: data.error,
          },
        }));
        return;

      default:
      // Unknown or system events (pong, error) need no state change.
    }
  },
}));

/** Test helper: restore the initial state. */
export function resetDeviceStore() {
  listController?.abort();
  listController = null;
  useDeviceStore.setState(initialState);
}
