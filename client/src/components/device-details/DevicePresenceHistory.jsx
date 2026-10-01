import { Info } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOpenScan } from '@/hooks/useOpenScan';
import { cn } from '@/lib/utils';
import { PRESENCE_RANGES } from '@/stores/useDeviceDetailsStore';
import { formatDateTime, formatDuration, formatPercent } from '@/utils/format';
import { presenceSegments, presenceStats } from '@/utils/presence';

const RANGE_OPTIONS = PRESENCE_RANGES.map((days) => ({
  value: String(days),
  label: `${days} days`,
}));
const PERIODS_SHOWN = 5;

const SEGMENT_STYLES = {
  online: 'bg-success/70 shadow-[0_0_10px_-3px_var(--success)]',
  offline: 'bg-muted-foreground/25',
  unknown: 'bg-[repeating-linear-gradient(135deg,transparent_0_4px,var(--border)_4px_5px)]',
};

const STATUS_LABELS = { online: 'Online', offline: 'Offline', unknown: 'Not known yet' };

function span(from, to, ongoing) {
  const duration = formatDuration((to - from) / 1000);
  return `${formatDateTime(from)} → ${ongoing ? 'now' : formatDateTime(to)} (${duration})`;
}

/** The range as a bar: online, offline, and before the device was first seen. */
function PresenceBar({ history }) {
  const segments = presenceSegments(history);
  return (
    <div>
      <div className="relative h-6 overflow-hidden rounded-md border border-border bg-background/40">
        {segments.map((segment) => (
          <Tooltip key={segment.from}>
            <TooltipTrigger asChild>
              <div
                data-testid="presence-segment"
                data-status={segment.status}
                className={cn('absolute inset-y-0', SEGMENT_STYLES[segment.status])}
                style={{ left: `${segment.offset * 100}%`, width: `${segment.width * 100}%` }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {STATUS_LABELS[segment.status]} · {span(segment.from, segment.to, segment.ongoing)}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{formatDateTime(history.range.from)}</span>
        <span>now</span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {['online', 'offline', 'unknown'].map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              className={cn('h-2.5 w-4 rounded-sm border border-border', SEGMENT_STYLES[status])}
              aria-hidden="true"
            />
            {status === 'unknown' ? 'Before it was first seen' : STATUS_LABELS[status]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One cell per discovery scan, oldest first: seen or missed. A cell opens its scan. */
function ScanStrip({ history }) {
  const openScan = useOpenScan();
  const scans = [...history.scans.items].reverse();
  if (scans.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {history.scans.total > scans.length
          ? `The latest ${scans.length} of ${history.scans.total} network scans`
          : `${scans.length === 1 ? 'The network scan' : `All ${scans.length} network scans`} in this period`}
        : found or not
      </p>
      <div className="flex flex-wrap gap-[3px]" aria-hidden="true">
        {scans.map((scan) => (
          <Tooltip key={scan.id}>
            <TooltipTrigger asChild>
              <div
                data-testid="presence-scan"
                data-seen={scan.seen}
                onClick={(event) => openScan(event, scan.id)}
                className={cn(
                  'h-4 w-2.5 cursor-pointer rounded-[3px] transition-opacity hover:opacity-70',
                  scan.seen
                    ? 'bg-success/80 shadow-[0_0_6px_-2px_var(--success)]'
                    : 'border border-border bg-muted/40',
                )}
              />
            </TooltipTrigger>
            <TooltipContent>
              {formatDateTime(scan.finishedAt)}:{' '}
              {scan.seen ? `seen at ${scan.ipAddress}` : 'not found'}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

/** The periods as text, newest first (the bar's accessible equivalent). */
function PeriodList({ history }) {
  const [showAll, setShowAll] = useState(false);
  const to = Date.parse(history.range.to);
  const periods = [...history.periods].reverse();
  const shown = showAll ? periods : periods.slice(0, PERIODS_SHOWN);

  return (
    <div>
      <ol className="space-y-1.5" aria-label="Online and offline periods">
        {shown.map((period) => {
          const from = Date.parse(period.from);
          const end = period.to ? Date.parse(period.to) : to;
          return (
            <li key={period.from} className="flex items-baseline gap-2 text-sm">
              <span
                className={cn(
                  'size-2 shrink-0 translate-y-[-1px] rounded-full',
                  period.status === 'online' ? 'bg-success' : 'bg-muted-foreground/50',
                )}
                aria-hidden="true"
              />
              <span className="w-14 shrink-0 font-medium">{STATUS_LABELS[period.status]}</span>
              <span className="min-w-0 text-xs text-muted-foreground">
                {span(from, end, !period.to)}
              </span>
            </li>
          );
        })}
      </ol>
      {periods.length > PERIODS_SHOWN && (
        <Button
          variant="link"
          size="sm"
          className="mt-1 h-auto px-0"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show fewer' : `Show all ${periods.length} periods`}
        </Button>
      )}
    </div>
  );
}

function Body({ presence, onRetry }) {
  if (presence.status === 'error' && !presence.data) {
    return (
      <ErrorState
        title="Could not load the presence history"
        error={presence.error}
        onRetry={onRetry}
        className="py-10"
      />
    );
  }
  if (!presence.data) {
    return (
      <div className="space-y-3 px-5 py-4" aria-busy="true" aria-label="Loading presence history">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  const history = presence.data;
  const stats = presenceStats(history);
  return (
    <div className="space-y-4 px-5 py-4">
      <p className="text-sm">
        {stats.scans > 0 ? (
          <>
            Seen by <span className="font-semibold tabular-nums">{stats.seen}</span> of{' '}
            <span className="tabular-nums">{stats.scans}</span> scans{' '}
            <span className="text-muted-foreground">
              ({formatPercent(stats.seen, stats.scans)})
            </span>
          </>
        ) : (
          'No network scan in this period.'
        )}
        {stats.wentOffline > 0 && (
          <span className="text-muted-foreground">
            {' '}
            · went offline {stats.wentOffline} {stats.wentOffline === 1 ? 'time' : 'times'} ·
            longest offline {formatDuration(stats.longestOfflineMs / 1000)}
          </span>
        )}
      </p>
      <PresenceBar history={history} />
      <ScanStrip history={history} />
      <PeriodList history={history} />
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Status is known only when a network scan runs; between scans, the last known status is
        shown.
      </p>
    </div>
  );
}

/**
 * When the device was on the network over the last 7, 30, or 90 days: online and offline periods
 * (from its timeline), and which discovery scans found it.
 *
 * @param {{ presence: { days: number, status: string, data: import('@/types/api').DeviceHistory | null,
 *           error: unknown }, onRangeChange: (days: number) => void, onRetry: () => void,
 *           className?: string }} props
 */
export function DevicePresenceHistory({ presence, onRangeChange, onRetry, className }) {
  return (
    <GlassPanel as="section" aria-labelledby="device-presence-title" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 id="device-presence-title" className="text-sm font-semibold tracking-wide">
            Presence history
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            When this device was on the network, from discovery scans
          </p>
        </div>
        <SegmentedControl
          label="Presence period"
          value={String(presence.days)}
          onChange={(value) => onRangeChange(Number(value))}
          options={RANGE_OPTIONS}
        />
      </div>
      <div className="border-t border-border">
        <Body presence={presence} onRetry={onRetry} />
      </div>
    </GlassPanel>
  );
}
