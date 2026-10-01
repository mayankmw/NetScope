import { Loader2 } from 'lucide-react';
import { useImperativeHandle, useRef } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { useCytoscape } from '@/hooks/useCytoscape';
import { useTopologyGraph } from '@/hooks/useTopologyGraph';
import { cn } from '@/lib/utils';
import { TopologyControls } from './TopologyControls';

function describe(model) {
  const gateway = model.nodes[0];
  if (!gateway) return 'Empty network graph';
  const devices = model.nodes.length - 1;
  return (
    `Logical topology of ${model.network?.cidr}: gateway ${gateway.ipAddress} and ` +
    `${devices} ${devices === 1 ? 'device' : 'devices'} on its subnet. ` +
    'The list view presents the same information as text.'
  );
}

/**
 * The interactive graph: one Cytoscape instance (pan, pinch/wheel zoom, drag nodes) kept in
 * step with the model. Tap a node to select it, double-tap to open its details, tap the
 * background to clear the selection.
 *
 * `ref` receives the viewport controls ({ zoomIn, zoomOut, fit, relayout, focus(ids) }).
 *
 * @param {{ model: import('@/utils/topology').TopologyModel, layout: 'radial' | 'tree',
 *           matches: Set<string> | null, selectedId: string | null,
 *           changedAt: Record<string, number>, onSelect: (id: string | null) => void,
 *           onOpen: (id: string) => void, ref?: React.Ref<object>, className?: string }} props
 */
export function TopologyGraph({
  model,
  layout,
  matches,
  selectedId,
  changedAt,
  onSelect,
  onOpen,
  ref,
  className,
}) {
  const containerRef = useRef(null);
  const { cy, theme, status } = useCytoscape(containerRef, {
    onTapNode: onSelect,
    onDoubleTapNode: onOpen,
    onTapBackground: () => onSelect(null),
  });
  const controls = useTopologyGraph(cy, { model, theme, layout, matches, selectedId, changedAt });
  useImperativeHandle(ref, () => controls, [controls]);

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Sized explicitly: Cytoscape sets the container's position itself. */}
      <div
        ref={containerRef}
        className="h-full w-full"
        role="img"
        aria-label={describe(model)}
        data-testid="topology-canvas"
      />
      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
            Loading graph…
          </span>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-background/80">
          <ErrorState
            title="The graph could not be loaded"
            error={{ message: 'Reload the page, or use the list view.' }}
          />
        </div>
      )}
      <TopologyControls controls={controls} disabled={status !== 'ready'} />
    </div>
  );
}
