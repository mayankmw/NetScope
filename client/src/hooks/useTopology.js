import { useMemo, useState } from 'react';
import { useDeviceInventory } from '@/hooks/useDeviceInventory';
import { useNow } from '@/hooks/useNow';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { useUiStore } from '@/stores/useUiStore';
import { buildTopologyModel, searchTopology } from '@/utils/topology';

/**
 * Everything the topology page needs: the inventory (loaded if stale, kept live by WebSocket
 * events through the device store) turned into a topology model, plus search, selection, and
 * the remembered view preferences.
 *
 * The model is rebuilt only when the inventory or the offline filter changes; the graph then
 * applies the difference.
 */
export function useTopology() {
  const inventory = useDeviceInventory();
  const byId = useDeviceStore((state) => state.byId);
  const changedAt = useDeviceStore((state) => state.changedAt);
  const layout = useUiStore((state) => state.topologyLayout);
  const setLayout = useUiStore((state) => state.setTopologyLayout);
  const showOffline = useUiStore((state) => state.topologyShowOffline);
  const setShowOffline = useUiStore((state) => state.setTopologyShowOffline);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  // "New in the last 24 hours" changes slowly: a coarse clock is enough.
  const now = useNow(60_000);

  const { network, devices } = inventory;
  const model = useMemo(
    () => buildTopologyModel({ network, devices, showOffline, now }),
    [network, devices, showOffline, now],
  );
  const matches = useMemo(
    () => searchTopology(model.nodes, byId, query),
    [model.nodes, byId, query],
  );
  // A selected device that is filtered out (or gone) is no longer selected.
  const selectedNode = model.nodes.find((node) => node.id === selectedId) ?? null;

  return {
    ...inventory,
    model,
    changedAt,
    now,
    query,
    setQuery,
    matches,
    layout,
    setLayout,
    showOffline,
    setShowOffline,
    selectedNode,
    select: setSelectedId,
  };
}
