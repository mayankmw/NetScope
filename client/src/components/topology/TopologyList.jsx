import { StatusDot } from '@/components/common/StatusDot';
import { GlassPanel } from '@/components/common/GlassPanel';
import { DeviceLink } from '@/components/devices/DeviceLink';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS } from '@/utils/topology';
import { CategoryShape } from './CategoryShape';

function NodeItem({ node, matches, selectedId }) {
  const dimmed = matches && !matches.has(node.id);
  const content = (
    <>
      <StatusDot tone={node.status === 'online' ? 'online' : 'offline'} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          matches?.has(node.id) && 'font-semibold text-primary',
        )}
      >
        {node.name}
      </span>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{node.ipAddress}</span>
      <span className="sr-only">
        , {node.typeLabel}, {node.status}
        {node.isSelf ? ', this computer' : ''}
      </span>
    </>
  );
  const classes = cn(
    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
    dimmed && 'opacity-40',
    node.id === selectedId && 'bg-primary/10',
  );
  return (
    <li>
      {node.synthetic ? (
        <div className={classes}>{content}</div>
      ) : (
        <DeviceLink
          deviceId={node.id}
          className={cn(
            classes,
            'outline-none hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {content}
        </DeviceLink>
      )}
    </li>
  );
}

/**
 * The topology as nested lists: the same logical structure as the graph, readable by screen
 * readers and usable with the keyboard. Devices are grouped by category; each links to its page.
 *
 * @param {{ model: import('@/utils/topology').TopologyModel, matches: Set<string> | null,
 *           selectedId: string | null, className?: string }} props
 */
export function TopologyList({ model, matches, selectedId, className }) {
  const [gateway, ...devices] = model.nodes;
  const groups = Object.keys(CATEGORY_LABELS)
    .filter((category) => category !== 'gateway')
    .map((category) => ({
      category,
      nodes: devices.filter((node) => node.category === category),
    }))
    .filter((group) => group.nodes.length > 0);

  return (
    <GlassPanel className={cn('p-4', className)}>
      <ul aria-label="Logical topology">
        <li>
          <p className="mb-1 flex items-center gap-2 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <CategoryShape category="gateway" className="text-primary" />
            Gateway
          </p>
          <ul>
            <NodeItem node={gateway} matches={matches} selectedId={selectedId} />
          </ul>
          <ul
            className="mt-3 ml-4 space-y-4 border-l border-dashed border-border pl-4"
            aria-label={`Devices on ${model.network.cidr}`}
          >
            {groups.map(({ category, nodes }) => (
              <li key={category}>
                <p className="mb-1 flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                  <CategoryShape category={category} className="text-primary" />
                  {CATEGORY_LABELS[category]} ({nodes.length})
                </p>
                <ul>
                  {nodes.map((node) => (
                    <NodeItem key={node.id} node={node} matches={matches} selectedId={selectedId} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </li>
      </ul>
    </GlassPanel>
  );
}
