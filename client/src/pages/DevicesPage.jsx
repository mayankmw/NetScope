import { RefreshCw, SearchX, TriangleAlert, Radar } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { PageHeader } from '@/components/common/PageHeader';
import { RelativeTime } from '@/components/common/RelativeTime';
import { DeviceGrid } from '@/components/devices/DeviceGrid';
import { DeviceListSkeleton } from '@/components/devices/DeviceListSkeleton';
import { DeviceTable } from '@/components/devices/DeviceTable';
import { DeviceToolbar } from '@/components/devices/DeviceToolbar';
import { DiscoverButton } from '@/components/devices/DiscoverButton';
import { Button } from '@/components/ui/button';
import { useDeviceFilters } from '@/hooks/useDeviceFilters';
import { useDeviceInventory } from '@/hooks/useDeviceInventory';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { filterDevices, getFilterOptions, sortDevices } from '@/utils/deviceFilters';

/** Device inventory with search, filters, and sorting. Table on wide screens, cards on narrow. */
export function DevicesPage() {
  const { network, devices, status, error, isRefreshing, refresh } = useDeviceInventory();
  const ipChanges = useDeviceStore((state) => state.recentIpChanges);
  const filterState = useDeviceFilters();
  const { filters, activeCount, setSort, clearFilters } = filterState;
  const isWide = useMediaQuery('(min-width: 768px)');
  const now = useNow();
  const searchRef = useRef(null);

  useKeyboardShortcut(
    '/',
    useCallback(() => searchRef.current?.focus(), []),
  );

  const options = useMemo(() => getFilterOptions(devices), [devices]);
  const visible = useMemo(
    () => sortDevices(filterDevices(devices, filters), filters.sort, filters.dir),
    [devices, filters],
  );

  const isLoading = status === 'idle' || status === 'loading';
  const hasInventory = status === 'success' && network !== null;

  let description = 'Every device NetScope has seen on your network.';
  if (hasInventory) {
    description = (
      <>
        {devices.length} {devices.length === 1 ? 'device' : 'devices'} on{' '}
        <span className="font-mono text-foreground">{network.cidr}</span>
        {network.lastScan && (
          <>
            {' '}
            · last scan <RelativeTime value={network.lastScan.finishedAt} now={now} />
          </>
        )}
      </>
    );
  }

  let content;
  if (isLoading) {
    content = (
      <GlassPanel className="overflow-hidden">
        <DeviceListSkeleton variant={isWide ? 'table' : 'cards'} />
      </GlassPanel>
    );
  } else if (status === 'error') {
    content = (
      <GlassPanel>
        <ErrorState title="Could not load devices" error={error} onRetry={refresh} />
      </GlassPanel>
    );
  } else if (!network) {
    content = (
      <GlassPanel>
        <EmptyState
          icon={Radar}
          title="No devices yet"
          description="Run a discovery to find the devices on your local network. Only your own private subnet is scanned."
          action={<DiscoverButton />}
        />
      </GlassPanel>
    );
  } else if (visible.length === 0) {
    content = (
      <GlassPanel>
        <EmptyState
          icon={SearchX}
          title="No devices match"
          description={
            activeCount > 0
              ? 'Try a different search or remove some filters.'
              : 'This network has no recorded devices yet.'
          }
          action={
            activeCount > 0 ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <DiscoverButton />
            )
          }
        />
      </GlassPanel>
    );
  } else if (isWide) {
    content = (
      <GlassPanel className="overflow-hidden">
        <DeviceTable
          devices={visible}
          sort={filters.sort}
          dir={filters.dir}
          onSort={setSort}
          now={now}
          ipChanges={ipChanges}
        />
      </GlassPanel>
    );
  } else {
    content = <DeviceGrid devices={visible} now={now} ipChanges={ipChanges} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devices"
        description={description}
        actions={
          <Button
            variant="outline"
            onClick={refresh}
            disabled={isLoading || isRefreshing}
            aria-label="Reload device list"
          >
            <RefreshCw className={isRefreshing ? 'motion-safe:animate-spin' : undefined} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        }
      />

      {hasInventory && (
        <DeviceToolbar
          filterState={filterState}
          options={options}
          searchRef={searchRef}
          showSortControl={!isWide}
        />
      )}

      {hasInventory && error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            Could not refresh: {error.message} Showing the last loaded data.
          </span>
          <Button variant="ghost" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      )}

      {content}

      {hasInventory && visible.length > 0 && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Showing {visible.length} of {devices.length} devices
        </p>
      )}
    </div>
  );
}
