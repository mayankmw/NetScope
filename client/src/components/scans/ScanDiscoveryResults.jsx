import {
  ArrowRightLeft,
  CircleSlash,
  MonitorSmartphone,
  PencilLine,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { StatCard } from '@/components/common/StatCard';
import { Tag } from '@/components/common/Tag';
import { SelfTag } from '@/components/devices/DeviceAttributes';
import { DeviceLink } from '@/components/devices/DeviceLink';
import { DeviceTypeIcon } from '@/components/devices/DeviceTypeLabel';
import { cn } from '@/lib/utils';
import { describeDeviceEvent } from '@/utils/deviceActivity';
import { deviceTitle } from '@/utils/deviceFilters';
import { formatDuration, formatLatency } from '@/utils/format';

/** One device in a list: type icon, name (links to the device), an address line, and extras. */
function DeviceRow({ device, address, detail, children }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
      <DeviceTypeIcon type={device.deviceType} className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <DeviceLink
            deviceId={device.id}
            className="truncate font-medium underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {deviceTitle(device)}
          </DeviceLink>
          {device.isGateway && <Tag tone="primary">Gateway</Tag>}
          <SelfTag device={device} />
        </div>
        <p className="text-xs break-words text-muted-foreground">
          <span className="font-mono">{address}</span>
          {detail && <> · {detail}</>}
        </p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </li>
  );
}

function ChangeGroup({ icon: Icon, tone, title, entries, renderDetail }) {
  if (entries.length === 0) return null;
  return (
    <div>
      <h3 className={cn('flex items-center gap-2 px-5 pt-3 pb-1 text-xs font-medium', tone)}>
        <Icon className="size-3.5" aria-hidden="true" />
        {title} ({entries.length})
      </h3>
      <ul className="divide-y divide-border/60">
        {entries.map((entry) => (
          <DeviceRow
            key={entry.device.id}
            device={entry.device}
            address={entry.ipAddress ?? entry.lastIpAddress ?? entry.device.ipAddress}
            detail={renderDetail?.(entry)}
          />
        ))}
      </ul>
    </div>
  );
}

function describeChanges(changes) {
  return describeDeviceEvent({ type: 'updated', changes })
    .changes.map(({ label, from, to }) => `${label}: ${from ?? 'unknown'} → ${to ?? 'unknown'}`)
    .join(' · ');
}

/** The devices this scan saw appear, return, disappear, or change. */
function ScanChanges({ results }) {
  const isNew = results.found.filter((entry) => entry.isNew);
  const back = results.found.filter((entry) => entry.backOnline);
  const offline = results.missing.filter((entry) => entry.wentOffline);
  const changed = results.found.filter(
    (entry) => !entry.isNew && Object.keys(entry.changes).length > 0,
  );
  const nothing = isNew.length + back.length + offline.length + changed.length === 0;

  return (
    <GlassPanel as="section" aria-labelledby="scan-changes-title">
      <PanelHeader
        title={<span id="scan-changes-title">What changed</span>}
        description="Compared with what NetScope knew before this scan"
      />
      <div className="border-t border-border pb-2">
        {nothing ? (
          <p className="px-5 pt-3 text-sm text-muted-foreground">
            Nothing changed: the same devices, at the same addresses, as before this scan.
          </p>
        ) : (
          <>
            <ChangeGroup
              icon={Sparkles}
              tone="text-neon-magenta"
              title="New devices"
              entries={isNew}
            />
            <ChangeGroup icon={Wifi} tone="text-success" title="Back online" entries={back} />
            <ChangeGroup
              icon={WifiOff}
              tone="text-warning"
              title="Went offline"
              entries={offline}
            />
            <ChangeGroup
              icon={PencilLine}
              tone="text-primary"
              title="Details changed"
              entries={changed}
              renderDetail={(entry) => describeChanges(entry.changes)}
            />
          </>
        )}
      </div>
    </GlassPanel>
  );
}

function FoundDevices({ found }) {
  return (
    <GlassPanel as="section" aria-labelledby="scan-found-title">
      <PanelHeader
        title={<span id="scan-found-title">Devices found ({found.length})</span>}
        description="Where each device was, as this scan saw it"
      />
      {found.length === 0 ? (
        <EmptyState
          icon={CircleSlash}
          title="No devices found"
          description="Nothing on the network answered this scan."
          className="border-t border-border py-10"
        />
      ) : (
        <ul className="divide-y divide-border/60 border-t border-border" aria-label="Devices found">
          {found.map((entry) => (
            <DeviceRow
              key={entry.device.id}
              device={entry.device}
              address={entry.ipAddress}
              detail={[
                entry.device.vendor,
                entry.latencyMs !== null ? formatLatency(entry.latencyMs) : 'no ping reply',
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              {entry.isNew && (
                <Tag tone="magenta" icon={Sparkles}>
                  New
                </Tag>
              )}
              {entry.backOnline && (
                <Tag tone="success" icon={Wifi}>
                  Back online
                </Tag>
              )}
              {entry.changes.ipAddress && (
                <Tag tone="warning" icon={ArrowRightLeft} title={describeChanges(entry.changes)}>
                  New address
                </Tag>
              )}
            </DeviceRow>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}

function MissingDevices({ missing, startedAt }) {
  const scanStart = new Date(startedAt).getTime();
  return (
    <GlassPanel as="section" aria-labelledby="scan-missing-title">
      <PanelHeader
        title={<span id="scan-missing-title">Missing devices ({missing.length})</span>}
        description="Known devices this scan did not find"
      />
      {missing.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
          Every known device answered.
        </p>
      ) : (
        <ul
          className="divide-y divide-border/60 border-t border-border"
          aria-label="Missing devices"
        >
          {missing.map((entry) => (
            <DeviceRow
              key={entry.device.id}
              device={entry.device}
              address={entry.lastIpAddress ?? entry.device.ipAddress}
              detail={
                entry.lastSeenAt
                  ? `last seen ${formatDuration((scanStart - new Date(entry.lastSeenAt).getTime()) / 1000)} before`
                  : 'not seen by an earlier scan'
              }
            >
              {entry.wentOffline ? (
                <Tag tone="warning" icon={WifiOff}>
                  Went offline
                </Tag>
              ) : (
                <Tag tone="muted">Already offline</Tag>
              )}
            </DeviceRow>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}

/**
 * What a completed discovery found: headline counts, what changed, the devices it found, and the
 * known devices it missed.
 *
 * @param {{ scan: import('@/types/api').Scan,
 *           results: { found: import('@/types/api').ScanFoundDevice[],
 *                      missing: import('@/types/api').ScanMissingDevice[] } }} props
 */
export function ScanDiscoveryResults({ scan, results }) {
  const summary = scan.summary ?? {
    devicesFound: results.found.length,
    knownDevices: results.found.length + results.missing.length,
    newDevices: results.found.filter((entry) => entry.isNew).length,
    missingDevices: results.missing.length,
    wentOffline: results.missing.filter((entry) => entry.wentOffline).length,
    backOnline: results.found.filter((entry) => entry.backOnline).length,
  };
  const cards = [
    {
      label: 'Found',
      value: summary.devicesFound,
      icon: MonitorSmartphone,
      tone: 'primary',
      hint: `of ${summary.knownDevices} known`,
    },
    { label: 'New', value: summary.newDevices, icon: Sparkles, tone: 'magenta' },
    {
      label: 'Missing',
      value: summary.missingDevices,
      icon: WifiOff,
      tone: 'muted',
      hint: `${summary.wentOffline} went offline`,
    },
    { label: 'Back online', value: summary.backOnline, icon: Wifi, tone: 'success' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>
      <ScanChanges results={results} />
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <FoundDevices found={results.found} />
        <MissingDevices missing={results.missing} startedAt={scan.startedAt} />
      </div>
    </div>
  );
}
