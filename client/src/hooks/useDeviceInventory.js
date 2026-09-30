import { useEffect, useMemo } from 'react';
import { useDeviceStore } from '@/stores/useDeviceStore';

// Revisiting a page within this window reuses the loaded inventory instead of refetching.
const STALE_AFTER_MS = 30_000;

/**
 * The current network's devices, loaded on first use and refreshed when stale.
 * Returns the devices as an array in inventory order (by IP).
 */
export function useDeviceInventory() {
  const network = useDeviceStore((state) => state.network);
  const byId = useDeviceStore((state) => state.byId);
  const ids = useDeviceStore((state) => state.ids);
  const status = useDeviceStore((state) => state.status);
  const error = useDeviceStore((state) => state.error);
  const isRefreshing = useDeviceStore((state) => state.isRefreshing);
  const loadedAt = useDeviceStore((state) => state.loadedAt);
  const fetchDevices = useDeviceStore((state) => state.fetchDevices);

  useEffect(() => {
    const { status: current, loadedAt: last } = useDeviceStore.getState();
    const isStale = !last || Date.now() - last > STALE_AFTER_MS;
    if (current !== 'loading' && isStale) fetchDevices();
  }, [fetchDevices]);

  const devices = useMemo(() => ids.map((id) => byId[id]), [ids, byId]);

  return {
    network,
    devices,
    status,
    error,
    isRefreshing,
    loadedAt,
    refresh: fetchDevices,
  };
}
