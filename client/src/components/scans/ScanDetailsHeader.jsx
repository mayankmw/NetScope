import { ChevronLeft, ChevronRight, Radar, ScanSearch } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { BackLink } from '@/components/device-details/DeviceHeader';
import { Button } from '@/components/ui/button';
import { useNow } from '@/hooks/useNow';
import { formatDateTime, formatElapsed } from '@/utils/format';
import { isActiveScan, scanDetailsPath, scanTitle } from '@/utils/scans';
import { ScanStatusBadge } from './ScanStatusBadge';

function RunningFor({ since }) {
  const now = useNow(1_000);
  return <>running for {formatElapsed(Math.max(0, now - new Date(since).getTime()))}</>;
}

/** Older / newer scan of the same network (discovery) or device (port scan). */
function HistoryNav({ previous, next }) {
  const location = useLocation();
  // Keep where "Back" leads while stepping through scans.
  const step = (scan, label, icon) =>
    scan ? (
      <Button asChild variant="outline" size="sm">
        <Link
          to={scanDetailsPath(scan.id)}
          state={location.state}
          title={formatDateTime(scan.createdAt)}
        >
          {icon}
          {label}
        </Link>
      </Button>
    ) : (
      <Button variant="outline" size="sm" disabled>
        {icon}
        {label}
      </Button>
    );

  return (
    <nav aria-label="Scan history" className="flex shrink-0 gap-2">
      {step(previous, 'Older', <ChevronLeft aria-hidden="true" />)}
      {step(next, 'Newer', <ChevronRight aria-hidden="true" />)}
    </nav>
  );
}

/**
 * Title block of a scan's page: back link, what ran and when, its status, and links to the scans
 * before and after it.
 *
 * @param {{ details: import('@/types/api').ScanDetails, back: { to: string, label: string } }} props
 */
export function ScanDetailsHeader({ details, back }) {
  const { scan, previous, next } = details;
  const Icon = scan.type === 'port' ? ScanSearch : Radar;
  const at = scan.startedAt ?? scan.createdAt;

  return (
    <div className="space-y-4">
      <BackLink back={back} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-[0_0_24px_-8px_var(--primary)]"
            aria-hidden="true"
          >
            <Icon className="size-6" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight break-words">
                {scanTitle(scan)}
              </h1>
              <ScanStatusBadge status={scan.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              <time dateTime={at}>{formatDateTime(at)}</time>
              {' · '}
              {isActiveScan(scan) && scan.startedAt ? (
                <RunningFor since={scan.startedAt} />
              ) : scan.durationMs !== null ? (
                `took ${formatElapsed(scan.durationMs)}`
              ) : (
                'did not run'
              )}
              {' · '}
              <span className="font-mono">{scan.target}</span>
              {' · '}
              {scan.triggeredBy === 'schedule' ? 'scheduled' : 'started manually'}
            </p>
          </div>
        </div>
        <HistoryNav previous={previous} next={next} />
      </div>
    </div>
  );
}
