import {
  ArrowRightLeft,
  History,
  ListRestart,
  Loader2,
  PencilLine,
  RefreshCw,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { RelativeTime } from '@/components/common/RelativeTime';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Tag } from '@/components/common/Tag';
import { ScanLink } from '@/components/scans/ScanLink';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { describeDeviceEvent } from '@/utils/deviceActivity';
import { formatDateTime, formatLatency } from '@/utils/format';

const TABS = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'discovery', label: 'Discovery history' },
];

const EVENT_STYLES = {
  discovered: {
    icon: Sparkles,
    tone: 'border-neon-magenta/30 bg-neon-magenta/10 text-neon-magenta',
  },
  online: { icon: Wifi, tone: 'border-success/30 bg-success/10 text-success' },
  offline: { icon: WifiOff, tone: 'border-border bg-muted/40 text-muted-foreground' },
  updated: { icon: PencilLine, tone: 'border-primary/30 bg-primary/10 text-primary' },
  ipChanged: { icon: ArrowRightLeft, tone: 'border-warning/30 bg-warning/10 text-warning' },
};

function eventStyle(event) {
  if (event.type === 'updated' && event.changes?.ipAddress) return EVENT_STYLES.ipChanged;
  return EVENT_STYLES[event.type] ?? EVENT_STYLES.updated;
}

function ListSkeleton({ label }) {
  return (
    <div className="space-y-4 px-5 py-4" aria-busy="true" aria-label={label}>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** "Load more" for a paginated history, with its own loading and error states. */
function LoadMore({ history, onLoadMore, noun }) {
  if (history.moreError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-center gap-2 border-t border-border px-5 py-3 text-sm text-destructive"
      >
        Could not load older {noun}.
        <Button variant="ghost" size="sm" onClick={onLoadMore}>
          <RefreshCw />
          Retry
        </Button>
      </div>
    );
  }
  if (!history.nextCursor) return null;
  return (
    <div className="flex justify-center border-t border-border px-5 py-3">
      <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={history.isLoadingMore}>
        {history.isLoadingMore ? <Loader2 className="motion-safe:animate-spin" /> : <ListRestart />}
        {history.isLoadingMore ? 'Loading…' : `Load older ${noun}`}
      </Button>
    </div>
  );
}

/**
 * Shared loading / error / empty handling for one history list.
 * @param {{ history: object, label: string, errorTitle: string, empty: { icon: any, title: string, description: string },
 *           onRetry: () => void, children: React.ReactNode }} props
 */
function HistoryBody({ history, label, errorTitle, empty, onRetry, children }) {
  if (history.status === 'idle' || history.status === 'loading') {
    return <ListSkeleton label={label} />;
  }
  if (history.status === 'error') {
    return (
      <ErrorState title={errorTitle} error={history.error} onRetry={onRetry} className="py-10" />
    );
  }
  if (history.items.length === 0) {
    return <EmptyState {...empty} className="py-10" />;
  }
  return children;
}

function Timeline({ items, now }) {
  return (
    <ol className="px-5 py-4" aria-label="Device timeline">
      {items.map((event, index) => {
        const { title, changes } = describeDeviceEvent(event);
        const { icon: Icon, tone } = eventStyle(event);
        const isLast = index === items.length - 1;
        return (
          <li key={event.id} className={cn('relative flex gap-3', !isLast && 'pb-5')}>
            {!isLast && (
              <span
                className="absolute top-8 bottom-1 left-3.5 w-px -translate-x-1/2 bg-border"
                aria-hidden="true"
              />
            )}
            <span
              className={cn('grid size-7 shrink-0 place-items-center rounded-full border', tone)}
              aria-hidden="true"
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium">{title}</p>
                <RelativeTime
                  value={event.occurredAt}
                  now={now}
                  className="text-xs text-muted-foreground"
                />
              </div>
              {changes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {event.type === 'offline' ? 'Last at ' : 'At '}
                  <span className="font-mono">{event.ipAddress}</span>
                </p>
              ) : (
                <ul className="space-y-0.5 text-xs">
                  {changes.map((change) => (
                    <li key={change.field} className="break-words">
                      {changes.length > 1 && (
                        <span className="text-muted-foreground">{change.label}: </span>
                      )}
                      <span className="font-mono text-muted-foreground">
                        {change.from ?? 'unknown'}
                      </span>
                      <span className="mx-1.5 text-muted-foreground" aria-hidden="true">
                        →
                      </span>
                      <span className="sr-only"> changed to </span>
                      <span className="font-mono">{change.to ?? 'unknown'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DiscoveryHistory({ items }) {
  return (
    <ul className="divide-y divide-border/60" aria-label="Discovery history">
      {items.map((observation, index) => {
        const older = items[index + 1];
        const ipChanged = older && older.ipAddress !== observation.ipAddress;
        return (
          <li
            key={observation.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm"
          >
            <ScanLink
              scanId={observation.scanId}
              className="min-w-36 rounded-sm text-muted-foreground tabular-nums underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Scan of ${formatDateTime(observation.observedAt)}`}
            >
              <time dateTime={observation.observedAt}>
                {formatDateTime(observation.observedAt)}
              </time>
            </ScanLink>
            <span className={cn('font-mono tabular-nums', ipChanged && 'text-warning')}>
              {observation.ipAddress}
              {ipChanged && <span className="sr-only"> (new address)</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              {observation.latencyMs !== null
                ? formatLatency(observation.latencyMs)
                : 'no ping reply'}
            </span>
            {observation.hostname && (
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {observation.hostname}
              </span>
            )}
            <Tag
              tone={observation.triggeredBy === 'schedule' ? 'primary' : 'muted'}
              className="ml-auto"
            >
              {observation.triggeredBy === 'schedule' ? 'Scheduled' : 'Manual scan'}
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The device's activity: its timeline (first seen, offline / online, changes) and the discovery
 * scans that saw it. Both are paginated, newest first.
 *
 * @param {{ events: object, observations: object, now: number,
 *           onLoadMore: (kind: 'events' | 'observations') => void,
 *           onRetry: (kind: 'events' | 'observations') => void, className?: string }} props
 */
export function DeviceActivity({ events, observations, now, onLoadMore, onRetry, className }) {
  const [tab, setTab] = useState('timeline');

  return (
    <GlassPanel as="section" aria-labelledby="device-activity-title" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 id="device-activity-title" className="text-sm font-semibold tracking-wide">
            Activity
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tab === 'timeline'
              ? 'Status changes and changes to its details'
              : 'Every discovery scan that saw this device'}
          </p>
        </div>
        <SegmentedControl label="Activity view" value={tab} onChange={setTab} options={TABS} />
      </div>

      <div className="border-t border-border">
        {tab === 'timeline' ? (
          <HistoryBody
            history={events}
            label="Loading timeline"
            errorTitle="Could not load the timeline"
            empty={{
              icon: History,
              title: 'No activity yet',
              description: 'Changes appear here as discovery scans find them.',
            }}
            onRetry={() => onRetry('events')}
          >
            <Timeline items={events.items} now={now} />
            <LoadMore history={events} onLoadMore={() => onLoadMore('events')} noun="activity" />
          </HistoryBody>
        ) : (
          <HistoryBody
            history={observations}
            label="Loading discovery history"
            errorTitle="Could not load the discovery history"
            empty={{
              icon: History,
              title: 'Not seen by a scan yet',
              description: 'Each discovery scan that finds this device is listed here.',
            }}
            onRetry={() => onRetry('observations')}
          >
            <DiscoveryHistory items={observations.items} />
            <LoadMore
              history={observations}
              onLoadMore={() => onLoadMore('observations')}
              noun="scans"
            />
          </HistoryBody>
        )}
      </div>
    </GlassPanel>
  );
}
