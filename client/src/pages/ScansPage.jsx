import { History, ListRestart, Loader2, RefreshCw, ScanSearch, X } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { PageHeader } from '@/components/common/PageHeader';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { DiscoverButton } from '@/components/devices/DiscoverButton';
import { ScanHistoryList } from '@/components/scans/ScanHistoryList';
import { ScanTrendChart } from '@/components/scans/ScanTrendChart';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { useScanHistory } from '@/hooks/useScanHistory';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { deviceTitle } from '@/utils/deviceFilters';
import { SCAN_STATUS_OPTIONS, SCAN_TYPE_OPTIONS, trendScans } from '@/utils/scans';

function ListSkeleton() {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading scans">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

function LoadMore({ history }) {
  if (history.moreError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-center gap-2 border-t border-border px-5 py-3 text-sm text-destructive"
      >
        Could not load older scans.
        <Button variant="ghost" size="sm" onClick={history.loadMore}>
          <RefreshCw />
          Retry
        </Button>
      </div>
    );
  }
  if (!history.nextCursor) return null;
  return (
    <div className="flex justify-center border-t border-border px-5 py-3">
      <Button variant="ghost" size="sm" onClick={history.loadMore} disabled={history.isLoadingMore}>
        {history.isLoadingMore ? <Loader2 className="motion-safe:animate-spin" /> : <ListRestart />}
        {history.isLoadingMore ? 'Loading…' : 'Load older scans'}
      </Button>
    </div>
  );
}

function emptyState({ type, status, deviceId }) {
  if (status !== 'all') {
    return {
      title: `No ${status} scans`,
      description: 'Choose "All" to see every scan.',
    };
  }
  if (type === 'port') {
    return {
      title: deviceId ? 'This device has no port scans' : 'No port scans yet',
      description: "Port scans are started from a device's page, one device at a time.",
    };
  }
  return {
    title: 'No network scans yet',
    description:
      'Every discovery is recorded here: when it ran, how long it took, and which devices it found or missed.',
    action: <DiscoverButton />,
  };
}

/**
 * The scan history: every network discovery and port scan, newest first, with what each found.
 * Network scans also show a trend chart. Filters are in the URL; the list updates live.
 */
export function ScansPage() {
  const history = useScanHistory();
  const { filters, status, error, items } = history;
  const now = useNow();
  const isWide = useMediaQuery('(min-width: 768px)');
  const filteredDevice = useDeviceStore((state) =>
    filters.deviceId ? state.byId[filters.deviceId] : null,
  );
  const deviceName = filteredDevice
    ? deviceTitle(filteredDevice)
    : (items[0]?.device && deviceTitle(items[0].device)) || 'one device';
  const trend =
    filters.type === 'discovery' && filters.status !== 'failed' ? trendScans(items) : [];

  let body;
  if (status === 'idle' || status === 'loading') {
    body = <ListSkeleton />;
  } else if (status === 'error') {
    body = (
      <ErrorState title="Could not load the scan history" error={error} onRetry={history.refresh} />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState icon={filters.type === 'port' ? ScanSearch : History} {...emptyState(filters)} />
    );
  } else {
    body = (
      <>
        <ScanHistoryList scans={items} type={filters.type} now={now} isWide={isWide} />
        <LoadMore history={history} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scans"
        description="Every network discovery and port scan NetScope has run, newest first."
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Scan type"
          value={filters.type}
          onChange={history.setType}
          options={SCAN_TYPE_OPTIONS}
        />
        <SegmentedControl
          label="Scan status"
          value={filters.status}
          onChange={history.setStatus}
          options={SCAN_STATUS_OPTIONS}
        />
        {filters.deviceId && (
          <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 pr-1 pl-3 text-sm text-primary">
            Device: {deviceName}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={history.clearDevice}
              aria-label="Show port scans of every device"
            >
              <X />
            </Button>
          </span>
        )}
      </div>

      {trend.length >= 2 && <ScanTrendChart scans={trend} />}

      <GlassPanel className="overflow-hidden">{body}</GlassPanel>
    </div>
  );
}
