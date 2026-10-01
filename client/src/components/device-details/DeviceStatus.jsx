import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { RelativeTime } from '@/components/common/RelativeTime';
import { StatusDot } from '@/components/common/StatusDot';
import { cn } from '@/lib/utils';
import { formatDateTime, formatDuration, formatPercent } from '@/utils/format';

function Stat({ label, children, detail }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
      {detail && <dd className="text-xs text-muted-foreground">{detail}</dd>}
    </div>
  );
}

/**
 * Whether the device is online, since when, when it was first and last seen, and how often
 * discovery has found it.
 *
 * @param {{ device: import('@/types/api').Device, presence: import('@/types/api').DevicePresence,
 *           now: number, highlight?: boolean, className?: string }} props
 */
export function DeviceStatus({ device, presence, now, highlight = false, className }) {
  const online = device.status === 'online';
  const { timesSeen, scansSinceFirstSeen, statusSince } = presence;
  const seenShare = scansSinceFirstSeen > 0 ? Math.min(1, timesSeen / scansSinceFirstSeen) : 0;

  return (
    <GlassPanel className={cn(highlight && 'animate-live-ring', className)}>
      <PanelHeader title="Status" />
      <div className="space-y-5 px-5 pb-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
          <StatusDot tone={online ? 'online' : 'offline'} pulse={online} />
          <span
            className={cn(
              'text-lg font-semibold',
              online ? 'text-success text-glow' : 'text-muted-foreground',
            )}
          >
            {online ? 'Online' : 'Offline'}
          </span>
          {statusSince && (
            <span className="text-sm text-muted-foreground">
              {online ? 'for ' : 'since '}
              {online ? (
                <time dateTime={statusSince} title={formatDateTime(statusSince)}>
                  {formatDuration((now - new Date(statusSince).getTime()) / 1000)}
                </time>
              ) : (
                <RelativeTime value={statusSince} now={now} />
              )}
            </span>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Stat label="First seen" detail={formatDateTime(device.firstSeenAt)}>
            <RelativeTime value={device.firstSeenAt} now={now} />
          </Stat>
          <Stat label="Last seen" detail={formatDateTime(device.lastSeenAt)}>
            <RelativeTime value={device.lastSeenAt} now={now} />
          </Stat>
          <Stat
            label="Seen by discovery"
            detail={
              scansSinceFirstSeen > 0
                ? `${timesSeen} of ${scansSinceFirstSeen} ${scansSinceFirstSeen === 1 ? 'scan' : 'scans'} since first seen`
                : 'No completed scans yet'
            }
          >
            <span className="font-mono tabular-nums">
              {formatPercent(timesSeen, scansSinceFirstSeen)}
            </span>
            <span
              className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted"
              aria-hidden="true"
            >
              <span
                className="block h-full rounded-full bg-success shadow-[0_0_8px_var(--success)]"
                style={{ width: `${seenShare * 100}%` }}
              />
            </span>
          </Stat>
        </dl>
      </div>
    </GlassPanel>
  );
}
