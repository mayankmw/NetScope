import { DetailList, DetailRow } from '@/components/common/DetailList';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { PrivateMacTag } from '@/components/devices/DeviceAttributes';
import { DeviceTypeLabel } from '@/components/devices/DeviceTypeLabel';

function Unknown({ children = 'Unknown' }) {
  return <span className="text-muted-foreground">{children}</span>;
}

/**
 * What the device is: its names, addresses, manufacturer, and type.
 * @param {{ device: import('@/types/api').Device, className?: string }} props
 */
export function DeviceIdentityCard({ device, className }) {
  return (
    <GlassPanel className={className}>
      <PanelHeader title="Identity" description="What this device is" />
      <DetailList className="pb-2">
        {device.displayName && <DetailRow label="Name">{device.displayName}</DetailRow>}
        <DetailRow
          label="Hostname"
          copyValue={device.hostname ?? undefined}
          hint={device.hostname ? undefined : 'No name was found for this address'}
        >
          {device.hostname ?? <Unknown>Not resolved</Unknown>}
        </DetailRow>
        <DetailRow label="IP address" copyValue={device.ipAddress}>
          <span className="font-mono tabular-nums">{device.ipAddress}</span>
        </DetailRow>
        <DetailRow label="MAC address" copyValue={device.macAddress}>
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono">{device.macAddress}</span>
            <PrivateMacTag device={device} />
          </span>
        </DetailRow>
        <DetailRow
          label="Vendor"
          hint={
            !device.vendor && device.macIsRandom
              ? 'A randomized MAC address does not identify its manufacturer'
              : undefined
          }
        >
          {device.vendor ?? <Unknown />}
        </DetailRow>
        <DetailRow label="Device type">
          <DeviceTypeLabel type={device.deviceType} />
        </DetailRow>
      </DetailList>
    </GlassPanel>
  );
}
