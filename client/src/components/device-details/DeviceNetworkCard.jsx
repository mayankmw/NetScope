import { DetailList, DetailRow } from '@/components/common/DetailList';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { RelativeTime } from '@/components/common/RelativeTime';
import { formatLatency } from '@/utils/format';
import { ouiPrefix } from '@/utils/mac';

function Muted({ children }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function role(device, network) {
  if (device.isGateway) return ['Gateway', `Routes traffic for ${network.cidr}`];
  if (device.isSelf) return ['This computer', 'NetScope runs on this device'];
  return ['Client', `Uses ${network.gatewayIpAddress} as its gateway`];
}

function ResponseTime({ device, presence }) {
  if (presence.lastLatencyMs !== null) {
    const average =
      presence.latencySamples > 1
        ? `Average ${formatLatency(presence.averageLatencyMs)} over the last ${presence.latencySamples} replies`
        : undefined;
    return (
      <DetailRow label="Response time" hint={average}>
        <span className="font-mono tabular-nums">{formatLatency(presence.lastLatencyMs)}</span>
        <Muted> ping, when last seen</Muted>
      </DetailRow>
    );
  }
  if (device.isSelf) {
    return (
      <DetailRow label="Response time">
        <Muted>Not measured for this computer</Muted>
      </DetailRow>
    );
  }
  return (
    <DetailRow
      label="Response time"
      hint={presence.timesSeen > 0 ? 'Found through the ARP table instead' : undefined}
    >
      <Muted>No ping reply when last seen</Muted>
    </DetailRow>
  );
}

/**
 * How the device is connected: its addresses now and before, its MAC details, its DNS name,
 * the interface it is reached through, and how fast it answers.
 *
 * @param {{ device: import('@/types/api').Device & { isGateway: boolean, isSelf: boolean },
 *           network: import('@/types/api').Network,
 *           presence: import('@/types/api').DevicePresence,
 *           ipHistory: import('@/types/api').DeviceDetails['ipHistory'],
 *           localInterface: import('@/types/api').LocalInterface | null,
 *           now: number, className?: string }} props
 */
export function DeviceNetworkCard({
  device,
  network,
  presence,
  ipHistory,
  localInterface,
  now,
  className,
}) {
  const [roleLabel, roleHint] = role(device, network);
  const previousIps = ipHistory.filter((entry) => entry.ipAddress !== device.ipAddress);

  return (
    <GlassPanel className={className}>
      <PanelHeader
        title="Network"
        description={
          <>
            {network.name ?? 'Local network'} · <span className="font-mono">{network.cidr}</span>
          </>
        }
      />
      <DetailList className="pb-2">
        <DetailRow label="Current IP" hint={`In ${network.cidr}`} copyValue={device.ipAddress}>
          <span className="font-mono tabular-nums">{device.ipAddress}</span>
        </DetailRow>

        <DetailRow label="Previous IPs">
          {previousIps.length === 0 ? (
            <Muted>None recorded</Muted>
          ) : (
            <ul className="space-y-1">
              {previousIps.map((entry) => (
                <li key={entry.ipAddress} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono tabular-nums">{entry.ipAddress}</span>
                  <span className="text-xs text-muted-foreground">
                    last used <RelativeTime value={entry.lastSeenAt} now={now} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DetailRow>

        <DetailRow
          label="MAC address"
          hint={
            device.macIsRandom
              ? 'Locally administered: randomized by the device for privacy'
              : `Manufacturer prefix (OUI) ${ouiPrefix(device.macAddress)}`
          }
        >
          <span className="font-mono">{device.macAddress}</span>
        </DetailRow>

        <DetailRow
          label="DNS name"
          hint={device.hostname ? 'From a reverse DNS lookup' : undefined}
        >
          {device.hostname ?? <Muted>None found</Muted>}
        </DetailRow>

        <DetailRow label="Role" hint={roleHint}>
          {roleLabel}
        </DetailRow>

        {localInterface ? (
          <DetailRow label="Interface" hint="This computer's network interface" stacked>
            <span className="font-mono">{localInterface.name}</span>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {localInterface.addresses.map((address) => (
                <li key={address.address} className="flex gap-2">
                  <span className="w-8 shrink-0">{address.family}</span>
                  <span className="min-w-0 font-mono break-all">
                    {address.cidr ?? address.address}
                  </span>
                </li>
              ))}
            </ul>
          </DetailRow>
        ) : (
          <DetailRow label="Seen through" hint="The interface NetScope used to reach this device">
            <span className="font-mono">{network.interfaceName}</span>
            <Muted> on this computer</Muted>
          </DetailRow>
        )}

        <ResponseTime device={device} presence={presence} />
      </DetailList>
    </GlassPanel>
  );
}
