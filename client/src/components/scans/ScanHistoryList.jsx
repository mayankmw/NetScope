import { RelativeTime } from '@/components/common/RelativeTime';
import { DeviceLink } from '@/components/devices/DeviceLink';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useNow } from '@/hooks/useNow';
import { useOpenScan } from '@/hooks/useOpenScan';
import { cn } from '@/lib/utils';
import { deviceTitle } from '@/utils/deviceFilters';
import { formatDateTime, formatElapsed } from '@/utils/format';
import { isActiveScan } from '@/utils/scans';
import { ScanLink } from './ScanLink';
import { ScanStatusBadge } from './ScanStatusBadge';

const linkClass =
  'rounded-sm underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring';

/** Time since a running scan started. Has its own clock, so only it re-renders every second. */
function Elapsed({ since }) {
  const now = useNow(1_000);
  return <>{formatElapsed(Math.max(0, now - new Date(since).getTime()))}</>;
}

function Duration({ scan }) {
  if (isActiveScan(scan) && scan.startedAt) return <Elapsed since={scan.startedAt} />;
  if (scan.durationMs === null) return <span className="text-muted-foreground/60">—</span>;
  return formatElapsed(scan.durationMs);
}

/** A count, quiet when zero; `tone` colours it when it is not. */
function Count({ value, tone, prefix = '' }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/60">—</span>;
  }
  return (
    <span className={cn('font-mono tabular-nums', value > 0 ? tone : 'text-muted-foreground')}>
      {value > 0 ? prefix : ''}
      {value}
    </span>
  );
}

function StartedAt({ scan, now }) {
  const at = scan.startedAt ?? scan.createdAt;
  return (
    <div className="min-w-0">
      <ScanLink scanId={scan.id} className={cn(linkClass, 'font-medium tabular-nums')}>
        {formatDateTime(at)}
      </ScanLink>
      <div className="text-xs text-muted-foreground">
        <RelativeTime value={at} now={now} />
      </div>
    </div>
  );
}

function StatusCell({ scan }) {
  return (
    <div className="space-y-1">
      <ScanStatusBadge status={scan.status} />
      {scan.error && (
        <p className="max-w-56 truncate text-xs text-muted-foreground" title={scan.error.message}>
          {scan.error.message}
        </p>
      )}
    </div>
  );
}

function OpenPorts({ summary }) {
  if (!summary) return <span className="text-muted-foreground/60">—</span>;
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <Count value={summary.open} tone="text-primary" />
      {summary.openPorts?.length > 0 && (
        <span className="truncate font-mono text-xs text-muted-foreground">
          {summary.openPorts.join(', ')}
        </span>
      )}
    </span>
  );
}

function DeviceCell({ device }) {
  if (!device) return <span className="text-muted-foreground/60">—</span>;
  return (
    <div className="min-w-0">
      <DeviceLink deviceId={device.id} className={cn(linkClass, 'block truncate font-medium')}>
        {deviceTitle(device)}
      </DeviceLink>
      <div className="font-mono text-xs text-muted-foreground">{device.ipAddress}</div>
    </div>
  );
}

const head = 'text-xs text-muted-foreground uppercase';

function DiscoveryTable({ scans, now, openScan }) {
  return (
    <Table className="text-[13px]">
      <TableHeader className="bg-muted/20">
        <TableRow className="hover:bg-transparent">
          <TableHead className={head}>Started</TableHead>
          <TableHead className={head}>Network</TableHead>
          <TableHead className={head}>Duration</TableHead>
          <TableHead className={cn(head, 'text-right')}>Found</TableHead>
          <TableHead className={cn(head, 'text-right')}>New</TableHead>
          <TableHead className={cn(head, 'text-right')}>Missing</TableHead>
          <TableHead className={head}>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {scans.map((scan) => {
          const summary = scan.summary;
          return (
            <TableRow
              key={scan.id}
              onClick={(event) => openScan(event, scan.id)}
              className="animate-in cursor-pointer duration-300 fade-in-0 hover:bg-primary/[0.04]"
            >
              <TableCell>
                <StartedAt scan={scan} now={now} />
              </TableCell>
              <TableCell className="font-mono text-muted-foreground">{scan.target}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                <Duration scan={scan} />
              </TableCell>
              <TableCell className="text-right">
                <Count value={summary?.devicesFound} tone="text-foreground" />
                {summary && (
                  <span className="text-xs text-muted-foreground"> / {summary.knownDevices}</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Count value={summary?.newDevices} tone="text-neon-magenta" prefix="+" />
              </TableCell>
              <TableCell className="text-right">
                <Count value={summary?.missingDevices} tone="text-warning" />
                {summary?.wentOffline > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {summary.wentOffline} went offline
                  </div>
                )}
              </TableCell>
              <TableCell>
                <StatusCell scan={scan} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function PortTable({ scans, now, openScan }) {
  return (
    <Table className="text-[13px]">
      <TableHeader className="bg-muted/20">
        <TableRow className="hover:bg-transparent">
          <TableHead className={head}>Started</TableHead>
          <TableHead className={head}>Device</TableHead>
          <TableHead className={head}>Duration</TableHead>
          <TableHead className={head}>Open ports</TableHead>
          <TableHead className={head}>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {scans.map((scan) => (
          <TableRow
            key={scan.id}
            onClick={(event) => openScan(event, scan.id)}
            className="animate-in cursor-pointer duration-300 fade-in-0 hover:bg-primary/[0.04]"
          >
            <TableCell>
              <StartedAt scan={scan} now={now} />
            </TableCell>
            <TableCell className="max-w-64">
              <DeviceCell device={scan.device} />
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              <Duration scan={scan} />
            </TableCell>
            <TableCell className="max-w-56">
              <OpenPorts summary={scan.summary} />
            </TableCell>
            <TableCell>
              <StatusCell scan={scan} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Phones: one card per scan. */
function ScanCards({ scans, type, now }) {
  return (
    <ul className="divide-y divide-border/60" aria-label="Scans">
      {scans.map((scan) => {
        const summary = scan.summary;
        return (
          <li key={scan.id} className="space-y-2 px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <StartedAt scan={scan} now={now} />
              <ScanStatusBadge status={scan.status} />
            </div>
            {type === 'port' && <DeviceCell device={scan.device} />}
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {type === 'discovery' && summary && (
                <>
                  <span>
                    <span className="text-foreground">{summary.devicesFound}</span> found
                  </span>
                  <span>
                    <span className={cn(summary.newDevices > 0 && 'text-neon-magenta')}>
                      {summary.newDevices}
                    </span>{' '}
                    new
                  </span>
                  <span>
                    <span className={cn(summary.missingDevices > 0 && 'text-warning')}>
                      {summary.missingDevices}
                    </span>{' '}
                    missing
                  </span>
                </>
              )}
              {type === 'port' && summary && (
                <span>
                  <span className="text-foreground">{summary.open}</span> open
                  {summary.openPorts?.length > 0 && ` (${summary.openPorts.join(', ')})`}
                </span>
              )}
              <span className="tabular-nums">
                <Duration scan={scan} />
              </span>
            </p>
            {scan.error && <p className="text-xs text-destructive">{scan.error.message}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The scan history: a table from tablet width, cards on phones. Each scan links to its details
 * (its start time is the keyboard-accessible link; the whole row is clickable).
 *
 * @param {{ scans: import('@/types/api').Scan[], type: 'discovery' | 'port', now: number,
 *           isWide: boolean }} props
 */
export function ScanHistoryList({ scans, type, now, isWide }) {
  const openScan = useOpenScan();
  if (!isWide) return <ScanCards scans={scans} type={type} now={now} />;
  return type === 'port' ? (
    <PortTable scans={scans} now={now} openScan={openScan} />
  ) : (
    <DiscoveryTable scans={scans} now={now} openScan={openScan} />
  );
}
