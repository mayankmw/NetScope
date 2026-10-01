import { ArrowRight, Crosshair, MousePointerClick } from 'lucide-react';
import { CopyButton } from '@/components/common/CopyButton';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { RelativeTime } from '@/components/common/RelativeTime';
import { Tag } from '@/components/common/Tag';
import { DeviceLink } from '@/components/devices/DeviceLink';
import { DeviceStatusBadge } from '@/components/devices/DeviceStatusBadge';
import { DeviceTypeLabel } from '@/components/devices/DeviceTypeLabel';
import { Button } from '@/components/ui/button';
import { CategoryShape } from './CategoryShape';

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-2 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * The selected node: what it is, its state, how it relates to the gateway, and a way to its
 * device page.
 *
 * @param {{ node: import('@/utils/topology').TopologyNode | null,
 *           network: import('@/utils/topology').TopologyModel['network'],
 *           now: number, onFocus: (id: string) => void, className?: string }} props
 */
export function TopologyNodePanel({ node, network, now, onFocus, className }) {
  if (!node) {
    return (
      <GlassPanel className={className}>
        <div className="flex flex-col items-center gap-2 px-5 py-8 text-center text-sm text-muted-foreground">
          <MousePointerClick className="size-5 text-primary" aria-hidden="true" />
          <p>Select a device in the graph to see it here. Double-click opens its page.</p>
        </div>
      </GlassPanel>
    );
  }

  const relation = node.isGateway
    ? `Default gateway of ${network.cidr}: devices on the subnet reach other networks through it.`
    : `On ${network.cidr}; reaches other networks through the gateway ${network.gatewayIpAddress}.`;

  return (
    <GlassPanel className={className} aria-live="polite">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <CategoryShape category={node.category} className="text-primary" />
            <span className="min-w-0 break-words">{node.name}</span>
          </span>
        }
        actions={node.synthetic ? null : <DeviceStatusBadge status={node.status} />}
      />
      <div className="space-y-3 px-5 pb-5 text-sm">
        <div className="flex flex-wrap gap-1.5 empty:hidden">
          {node.isGateway && <Tag tone="primary">Gateway</Tag>}
          {node.isSelf && <Tag tone="success">This computer</Tag>}
          {node.isNew && <Tag tone="magenta">New</Tag>}
        </div>

        <dl className="divide-y divide-border/60 text-xs">
          <Row label="IP address">
            <span className="inline-flex items-center gap-1 font-mono text-sm">
              {node.ipAddress}
              <CopyButton value={node.ipAddress} label="Copy IP address" />
            </span>
          </Row>
          <Row label="Hostname">
            {node.hostname ?? <span className="text-muted-foreground">Not resolved</span>}
          </Row>
          <Row label="Type">
            <DeviceTypeLabel type={node.deviceType} />
          </Row>
          {node.vendor && <Row label="Vendor">{node.vendor}</Row>}
          <Row label="Last seen">
            {node.lastSeenAt ? (
              <RelativeTime value={node.lastSeenAt} now={now} />
            ) : (
              <span className="text-muted-foreground">Not recorded</span>
            )}
          </Row>
        </dl>

        <p className="text-xs text-muted-foreground">
          {relation}
          {node.synthetic && ' It is not in the inventory yet: run a discovery.'}
        </p>

        <div className="flex flex-wrap gap-2">
          {!node.synthetic && (
            <Button asChild size="sm">
              <DeviceLink deviceId={node.id}>
                Open device page
                <ArrowRight aria-hidden="true" />
              </DeviceLink>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onFocus(node.id)}>
            <Crosshair aria-hidden="true" />
            Center in graph
          </Button>
        </div>
      </div>
    </GlassPanel>
  );
}
