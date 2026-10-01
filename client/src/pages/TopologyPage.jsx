import { Radar } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { PageHeader } from '@/components/common/PageHeader';
import { DiscoverButton } from '@/components/devices/DiscoverButton';
import { TopologyGraph } from '@/components/topology/TopologyGraph';
import { TopologyLegend } from '@/components/topology/TopologyLegend';
import { TopologyList } from '@/components/topology/TopologyList';
import { TopologyNodePanel } from '@/components/topology/TopologyNodePanel';
import { TopologyToolbar } from '@/components/topology/TopologyToolbar';
import { Skeleton } from '@/components/ui/skeleton';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { useTopology } from '@/hooks/useTopology';
import { backState, deviceDetailsPath } from '@/utils/deviceLinks';

const GRAPH_HEIGHT = 'h-[62svh] min-h-[360px] lg:h-[min(72svh,820px)] lg:min-h-[480px]';

/**
 * The network as an interactive graph: the gateway and every discovered device, as a logical
 * topology (see utils/topology.js). Search, layouts, offline filter, a list view for keyboard and
 * screen-reader users, and live updates from the device store.
 */
export function TopologyPage() {
  const topology = useTopology();
  const { model, status, error, refresh, network, matches, selectedNode, select, now } = topology;
  const [view, setView] = useState('graph');
  const graphRef = useRef(null);
  const searchRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useKeyboardShortcut(
    '/',
    useCallback(() => searchRef.current?.focus(), []),
  );
  useKeyboardShortcut(
    'Escape',
    useCallback(() => select(null), [select]),
  );

  const openDevice = useCallback(
    (id) => {
      const node = model.nodes.find((candidate) => candidate.id === id);
      if (node && !node.synthetic) navigate(deviceDetailsPath(id), { state: backState(location) });
    },
    [model.nodes, navigate, location],
  );
  const focus = (ids) => graphRef.current?.focus(ids);
  const showMatches = () => {
    if (!matches || matches.size === 0) return;
    const ids = [...matches];
    if (ids.length === 1) select(ids[0]);
    focus(ids);
  };

  const isLoading = status === 'idle' || status === 'loading';
  const { counts } = model;

  let description = 'How the devices NetScope found relate to your gateway.';
  if (model.network) {
    description = (
      <>
        Logical view of <span className="font-mono text-foreground">{model.network.cidr}</span> ·{' '}
        {counts.devices} devices · {counts.online} online
        {counts.hidden > 0 && ` · ${counts.hidden} offline hidden`}
      </>
    );
  }

  let content;
  if (isLoading) {
    content = (
      <GlassPanel className={GRAPH_HEIGHT} aria-busy="true" aria-label="Loading topology">
        <div className="grid h-full place-items-center">
          <Skeleton className="size-24 rounded-full" />
        </div>
      </GlassPanel>
    );
  } else if (status === 'error') {
    content = (
      <GlassPanel>
        <ErrorState title="Could not load the network" error={error} onRetry={refresh} />
      </GlassPanel>
    );
  } else if (!network) {
    content = (
      <GlassPanel>
        <EmptyState
          icon={Radar}
          title="No network to show yet"
          description="Run a discovery to find the devices on your local network; they appear here around your gateway."
          action={<DiscoverButton />}
        />
      </GlassPanel>
    );
  } else {
    content = (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-3">
          <TopologyToolbar
            query={topology.query}
            onQueryChange={topology.setQuery}
            matchCount={matches?.size ?? 0}
            onShowMatches={showMatches}
            layout={topology.layout}
            onLayoutChange={topology.setLayout}
            showOffline={topology.showOffline}
            onShowOfflineChange={topology.setShowOffline}
            view={view}
            onViewChange={setView}
            searchRef={searchRef}
          />
          {view === 'graph' ? (
            <GlassPanel className="overflow-hidden">
              <TopologyGraph
                ref={graphRef}
                model={model}
                layout={topology.layout}
                matches={matches}
                selectedId={selectedNode?.id ?? null}
                changedAt={topology.changedAt}
                onSelect={select}
                onOpen={openDevice}
                className={GRAPH_HEIGHT}
              />
            </GlassPanel>
          ) : (
            <TopologyList model={model} matches={matches} selectedId={selectedNode?.id ?? null} />
          )}
        </div>
        <div className="space-y-4">
          {view === 'graph' && (
            <TopologyNodePanel
              node={selectedNode}
              network={model.network}
              now={now}
              onFocus={(id) => focus([id])}
            />
          )}
          <TopologyLegend />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Topology" description={description} />
      {content}
    </div>
  );
}
