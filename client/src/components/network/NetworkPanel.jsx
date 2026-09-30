import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { RelativeTime } from '@/components/common/RelativeTime';
import { Tag } from '@/components/common/Tag';
import { useDeviceStore } from '@/stores/useDeviceStore';

function Field({ label, children }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

/** The current network: subnet, gateway, interface, and the latest scan. */
export function NetworkPanel({ network, onlineCount, totalCount, now }) {
  const summary = useDeviceStore((state) => state.discovery.summary);

  return (
    <GlassPanel>
      <PanelHeader
        title="Network"
        description={network.name ?? 'Current local network'}
        actions={
          <Tag tone="success">
            {onlineCount}/{totalCount} online
          </Tag>
        }
      />
      <dl className="grid gap-x-6 gap-y-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Subnet">
          <span className="font-mono text-primary">{network.cidr}</span>
        </Field>
        <Field label="Gateway">
          <span className="font-mono">{network.gatewayIpAddress}</span>
          <span className="block truncate font-mono text-xs font-normal text-muted-foreground">
            {network.gatewayMacAddress}
          </span>
        </Field>
        <Field label="Interface">
          <span className="font-mono">{network.interfaceName}</span>
        </Field>
        <Field label="Last scan">
          {network.lastScan ? (
            <RelativeTime value={network.lastScan.finishedAt} now={now} />
          ) : (
            <span className="text-muted-foreground">Never</span>
          )}
        </Field>
      </dl>
      {summary && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-5 py-3 text-xs">
          <span className="mr-1 text-muted-foreground">Latest discovery:</span>
          <Tag tone="primary">{summary.devicesFound} found</Tag>
          <Tag tone={summary.newDevices ? 'magenta' : 'muted'}>{summary.newDevices} new</Tag>
          <Tag tone={summary.ipChanges ? 'warning' : 'muted'}>{summary.ipChanges} IP changes</Tag>
          <Tag tone="muted">{summary.wentOffline} went offline</Tag>
        </div>
      )}
    </GlassPanel>
  );
}
