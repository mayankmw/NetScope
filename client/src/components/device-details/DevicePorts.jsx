import { Loader2, RefreshCw, ScanSearch, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { ErrorState } from '@/components/common/ErrorState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { RelativeTime } from '@/components/common/RelativeTime';
import { Tag } from '@/components/common/Tag';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDevicePorts } from '@/hooks/useDevicePorts';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils';
import { usePortScanStore } from '@/stores/usePortScanStore';
import { formatDuration } from '@/utils/format';
import { serviceDescription } from '@/utils/portScan';

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function ScanButton({ scanState, disabled, onScan, title }) {
  const scanning = scanState === 'scanning';
  return (
    <Button
      variant={scanState === 'ready' ? 'default' : 'outline'}
      size="sm"
      onClick={onScan}
      disabled={disabled || scanning}
      title={title}
      className={cn(scanState === 'ready' && 'glow-primary')}
    >
      {scanning ? (
        <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
      ) : scanState === 'ready' ? (
        <ScanSearch aria-hidden="true" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      {scanning ? 'Scanning…' : scanState === 'ready' ? 'Scan ports' : 'Scan again'}
    </Button>
  );
}

function Notice({ tone = 'muted', icon: Icon, children, role }) {
  const tones = {
    muted: 'border-border bg-muted/30 text-muted-foreground',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
  };
  return (
    <div
      role={role}
      className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', tones[tone])}
    >
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Indeterminate progress with elapsed time. Has its own clock, so only it re-renders. */
function ScanningIndicator({ startedAt, ipAddress, portCount }) {
  const now = useNow(1_000);
  const elapsed = startedAt ? Math.max(0, (now - new Date(startedAt).getTime()) / 1000) : 0;
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <p className="text-sm">
        Checking {portCount} ports on <span className="font-mono">{ipAddress}</span>
        <span className="ml-2 text-xs text-muted-foreground tabular-nums">
          · {formatDuration(elapsed)}
        </span>
      </p>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full w-1/3 rounded-full bg-primary shadow-[0_0_10px_var(--primary)] motion-safe:animate-scan-sweep motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
      </div>
    </div>
  );
}

function PortRow({ port, now }) {
  const open = port.state === 'open';
  const description = serviceDescription(port);
  return (
    <li className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5 text-sm sm:grid-cols-[5rem_8rem_1fr_auto]">
      <span
        className={cn('font-mono tabular-nums', open ? 'text-primary' : 'text-muted-foreground')}
      >
        {port.port}/{port.protocol}
      </span>
      <span className={cn('truncate font-medium', !open && 'text-muted-foreground')}>
        {port.service ?? 'unknown'}
      </span>
      <span className="col-start-2 min-w-0 truncate text-xs text-muted-foreground sm:col-start-auto sm:text-sm">
        {open ? (description ?? 'Version not identified') : `Now ${port.state}`}
      </span>
      <span className="col-start-2 flex items-center gap-2 text-xs text-muted-foreground sm:col-start-auto sm:justify-end">
        {open && port.isNew && (
          <Tag tone="magenta" icon={Sparkles}>
            New
          </Tag>
        )}
        <span>
          {open ? 'open since ' : 'last open '}
          <RelativeTime value={open ? port.firstSeenOpenAt : port.lastSeenOpenAt} now={now} />
        </span>
      </span>
    </li>
  );
}

/** The results of a completed scan: a summary line and the ports. */
function Results({ results, scan, now, dimmed = false }) {
  const { summary } = results;
  const open = results.ports.filter((port) => port.state === 'open');
  const closedSince = results.ports.filter((port) => port.state !== 'open');

  return (
    <div className={cn('space-y-3', dimmed && 'opacity-60')}>
      <p className="px-5 text-xs text-muted-foreground">
        <span className="text-foreground">{plural(summary.open, 'open port')}</span> ·{' '}
        {summary.closed} closed · {summary.filtered} no response · scanned{' '}
        <RelativeTime value={results.finishedAt} now={now} />
        {scan?.id === results.scanId && scan.durationMs !== null && (
          <> in {formatDuration(scan.durationMs / 1000)}</>
        )}
      </p>

      {open.length > 0 ? (
        <ul className="divide-y divide-border/60 border-y border-border/60" aria-label="Open ports">
          {open.map((port) => (
            <PortRow key={`${port.protocol}/${port.port}`} port={port} now={now} />
          ))}
        </ul>
      ) : (
        <div className="px-5">
          <Notice icon={ShieldCheck}>
            {summary.filtered === summary.portsChecked
              ? 'No port answered. The device may be offline, or a firewall silently drops connections.'
              : `None of the ${summary.portsChecked} checked ports is open.`}
          </Notice>
        </div>
      )}

      {closedSince.length > 0 && (
        <div className="space-y-1">
          <h3 className="px-5 text-xs font-medium text-muted-foreground">Previously open</h3>
          <ul className="divide-y divide-border/60" aria-label="Previously open ports">
            {closedSince.map((port) => (
              <PortRow key={`${port.protocol}/${port.port}`} port={port} now={now} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Open TCP ports of one device, from a safe, fixed port scan the user starts here.
 * States: ready (never scanned) → scanning → completed | failed. Earlier results stay visible
 * while a new scan runs and after a failed one.
 *
 * @param {{ device: import('@/types/api').Device, now: number, className?: string }} props
 */
export function DevicePorts({ device, now, className }) {
  const ports = useDevicePorts(device.id);
  const activeScan = usePortScanStore((state) =>
    state.active?.deviceId === device.id ? state.active : null,
  );
  const { status, data, error, startError, scanState, blockedReason } = ports;
  const profile = data?.profile;
  const portCount = profile?.ports.length ?? 0;
  const disabledReason = !profile
    ? 'Loading…'
    : !profile.enabled
      ? 'Port scanning is turned off on the server.'
      : blockedReason;

  let body;
  if (status === 'idle' || status === 'loading') {
    body = (
      <div className="space-y-3 px-5 py-4" aria-busy="true" aria-label="Loading ports">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (status === 'error') {
    body = (
      <ErrorState
        title="Could not load ports"
        error={error}
        onRetry={ports.reload}
        className="py-10"
      />
    );
  } else {
    const { scan, results } = data;
    body = (
      <div className="space-y-4 py-4">
        {startError && (
          <div className="px-5">
            <Notice tone="error" icon={TriangleAlert} role="alert">
              Could not start the scan: {startError.message}{' '}
              <span className="font-mono text-xs opacity-80">{startError.code}</span>
            </Notice>
          </div>
        )}

        {scanState === 'scanning' && (
          <div className="px-5">
            <ScanningIndicator
              startedAt={activeScan?.startedAt ?? scan?.startedAt}
              ipAddress={scan?.ipAddress ?? device.ipAddress}
              portCount={portCount}
            />
          </div>
        )}

        {scanState === 'ready' && (
          <div className="space-y-3 px-5 text-sm text-muted-foreground">
            <p>
              Find out which of {portCount} common TCP ports this device accepts connections on, and
              which services answer there. It usually takes 10–60 seconds.
            </p>
            {device.status === 'offline' && (
              <Notice tone="warning" icon={TriangleAlert}>
                This device was offline at the last discovery, so a scan may find nothing.
              </Notice>
            )}
          </div>
        )}

        {scanState === 'failed' && scan?.status !== 'cancelled' && (
          <div className="px-5">
            <Notice tone="error" icon={TriangleAlert} role="alert">
              The last scan failed: {scan.error?.message ?? 'Unknown error.'}{' '}
              <span className="font-mono text-xs opacity-80">{scan.error?.code}</span>
            </Notice>
          </div>
        )}
        {scanState === 'failed' && scan?.status === 'cancelled' && (
          <div className="px-5">
            <Notice tone="warning" icon={TriangleAlert} role="status">
              The last scan was cancelled before it finished (the server stopped).
            </Notice>
          </div>
        )}

        {results && (
          <Results results={results} scan={scan} now={now} dimmed={scanState === 'scanning'} />
        )}
      </div>
    );
  }

  return (
    <GlassPanel as="section" aria-labelledby="device-ports-title" className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 id="device-ports-title" className="text-sm font-semibold tracking-wide">
            Open ports
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {profile
              ? `TCP connect scan of ${portCount} common ports${profile.serviceDetection === 'light' ? ', with service detection' : ''}`
              : 'TCP port scan'}
          </p>
        </div>
        <ScanButton
          scanState={scanState}
          disabled={Boolean(disabledReason)}
          title={disabledReason ?? undefined}
          onScan={ports.start}
        />
      </div>

      <div className="border-t border-border">{body}</div>

      <p className="flex items-start gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {disabledReason && profile ? `${disabledReason} ` : ''}
          Only this device&apos;s known address is checked, with a fixed list of ports and ordinary
          connections. No login attempts, exploits, or OS fingerprinting.
        </span>
      </p>
    </GlassPanel>
  );
}
