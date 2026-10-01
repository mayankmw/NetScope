import { Loader2, SearchX, TriangleAlert } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { BackLink } from '@/components/device-details/DeviceHeader';
import { ScanDetailsHeader } from '@/components/scans/ScanDetailsHeader';
import { ScanDiscoveryResults } from '@/components/scans/ScanDiscoveryResults';
import { ScanPortResults } from '@/components/scans/ScanPortResults';
import { ScanSettings } from '@/components/scans/ScanSettings';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNow } from '@/hooks/useNow';
import { useScanDetails } from '@/hooks/useScanDetails';
import { backLink } from '@/utils/deviceLinks';
import { isActiveScan } from '@/utils/scans';

const SCAN_LIST = { to: '/scans', label: 'Scans' };

function Notice({ tone, icon: Icon, children }) {
  const tones = {
    primary: 'border-primary/30 bg-primary/10 text-primary',
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
    warning: 'border-warning/30 bg-warning/10 text-warning',
  };
  return (
    <div
      role={tone === 'primary' ? 'status' : 'alert'}
      className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}
    >
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${tone === 'primary' ? 'motion-safe:animate-spin' : ''}`}
        aria-hidden="true"
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Outcome({ scan }) {
  if (isActiveScan(scan)) {
    return (
      <Notice tone="primary" icon={Loader2}>
        This scan is still running. Its results appear here when it finishes.
      </Notice>
    );
  }
  if (scan.status === 'cancelled') {
    return (
      <Notice tone="warning" icon={TriangleAlert}>
        This scan was cancelled before it finished (the server stopped). Nothing it saw was
        recorded.
      </Notice>
    );
  }
  if (scan.status === 'failed') {
    return (
      <Notice tone="error" icon={TriangleAlert}>
        This scan failed: {scan.error?.message ?? 'unknown error.'}{' '}
        {scan.error?.code && (
          <span className="font-mono text-xs opacity-80">{scan.error.code}</span>
        )}
        <p className="mt-1 text-xs opacity-80">Nothing it saw was recorded.</p>
      </Notice>
    );
  }
  return null;
}

/**
 * One scan: when it ran and how, and what it found. A network scan shows what changed, the
 * devices it found, and the known devices it missed; a port scan shows the ports. Updates when a
 * running scan finishes.
 */
export function ScanDetailsPage() {
  const { scanId } = useParams();
  const location = useLocation();
  const back = backLink(location.state?.from, SCAN_LIST);
  const now = useNow();
  const { status, data, error, refresh } = useScanDetails(scanId);

  if (status === 'not-found') {
    return (
      <div className="space-y-6">
        <BackLink back={back} />
        <GlassPanel>
          <EmptyState
            icon={SearchX}
            title="Scan not found"
            description="NetScope has no scan with this ID. The link may be mistyped, or the scan belonged to a network that was removed."
            action={
              <Button asChild variant="outline">
                <Link to="/scans">Back to scans</Link>
              </Button>
            }
          />
        </GlassPanel>
      </div>
    );
  }

  if (status === 'error' && !data) {
    return (
      <div className="space-y-6">
        <BackLink back={back} />
        <GlassPanel>
          <ErrorState title="Could not load this scan" error={error} onRetry={refresh} />
        </GlassPanel>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading scan">
        <BackLink back={back} />
        <Skeleton className="h-12 w-72" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { scan, results } = data;
  return (
    <div className="space-y-6">
      <ScanDetailsHeader details={data} back={back} />
      {error && (
        <Notice tone="warning" icon={TriangleAlert}>
          Could not refresh: {error.message} Showing the last loaded data.
        </Notice>
      )}
      <Outcome scan={scan} />
      {results &&
        (scan.type === 'port' ? (
          <ScanPortResults scan={scan} results={results} now={now} />
        ) : (
          <ScanDiscoveryResults scan={scan} results={results} />
        ))}
      <ScanSettings scan={scan} className="max-w-2xl" />
    </div>
  );
}
