import { DetailList, DetailRow } from '@/components/common/DetailList';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { formatDateTime } from '@/utils/format';

function NotSet({ children = 'Not set' }) {
  return <span className="text-muted-foreground">{children}</span>;
}

/**
 * Record details: identifiers (for the API, logs, and support), the network the record belongs
 * to, user-managed fields, and when the record last changed.
 *
 * @param {{ device: import('@/types/api').Device & { updatedAt?: string },
 *           network: import('@/types/api').Network, className?: string }} props
 */
export function DeviceMetadata({ device, network, className }) {
  return (
    <GlassPanel className={className}>
      <PanelHeader title="Metadata" description="About this record" />
      <DetailList className="pb-2">
        <DetailRow label="Device ID" copyValue={device.id}>
          <span className="font-mono text-xs break-all">{device.id}</span>
        </DetailRow>
        <DetailRow
          label="Network"
          hint={<span className="font-mono break-all">{network.id}</span>}
          copyValue={network.id}
        >
          {network.name ?? <span className="font-mono">{network.cidr}</span>}
        </DetailRow>
        <DetailRow label="Display name">{device.displayName ?? <NotSet />}</DetailRow>
        <DetailRow label="Trusted">{device.isTrusted ? 'Yes' : <NotSet>No</NotSet>}</DetailRow>
        <DetailRow label="First recorded">{formatDateTime(device.firstSeenAt)}</DetailRow>
        {device.updatedAt && (
          <DetailRow label="Last changed">{formatDateTime(device.updatedAt)}</DetailRow>
        )}
      </DetailList>
    </GlassPanel>
  );
}
