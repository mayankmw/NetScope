import { BellRing, CheckCheck, ListChecks, ListRestart, Loader2, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertItem } from '@/components/alerts/AlertItem';
import { AlertRules } from '@/components/alerts/AlertRules';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { PageHeader } from '@/components/common/PageHeader';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAlerts } from '@/hooks/useAlerts';
import { useNow } from '@/hooks/useNow';
import { useAlertStore } from '@/stores/useAlertStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { ALERT_STATUS_OPTIONS, ALERT_TYPE_OPTIONS, openCount } from '@/utils/alerts';
import { deviceTitle } from '@/utils/deviceFilters';

function ListSkeleton() {
  return (
    <div className="space-y-4 p-5" aria-busy="true" aria-label="Loading alerts">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadMore({ list, onLoadMore }) {
  if (list.moreError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-center gap-2 border-t border-border px-5 py-3 text-sm text-destructive"
      >
        Could not load older alerts.
        <Button variant="ghost" size="sm" onClick={onLoadMore}>
          <RefreshCw />
          Retry
        </Button>
      </div>
    );
  }
  if (!list.nextCursor) return null;
  return (
    <div className="flex justify-center border-t border-border px-5 py-3">
      <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={list.isLoadingMore}>
        {list.isLoadingMore ? <Loader2 className="motion-safe:animate-spin" /> : <ListRestart />}
        {list.isLoadingMore ? 'Loading…' : 'Load older alerts'}
      </Button>
    </div>
  );
}

function emptyState({ status, type }) {
  const kind = ALERT_TYPE_OPTIONS.find((option) => option.value === type);
  if (type !== 'all') {
    return {
      title: `No ${kind.label.toLowerCase()}`,
      description: 'Choose "All types" to see every alert.',
    };
  }
  if (status === 'resolved') {
    return { title: 'No resolved alerts', description: 'Alerts you resolve are kept here.' };
  }
  return {
    title:
      status === 'all'
        ? 'No alerts yet'
        : status === 'unread'
          ? 'Nothing unread'
          : 'No open alerts',
    description:
      'NetScope tells you here when a device it has never seen joins your network, when a device comes back after a long absence, or when one changes address.',
  };
}

/** Runs a bulk action, reporting the outcome with a toast. */
function useBulkAction(action, { done, failed }) {
  const [running, setRunning] = useState(false);
  async function run() {
    setRunning(true);
    try {
      await action();
      toast.success(done);
    } catch (error) {
      toast.error(failed, { description: error.message });
    } finally {
      setRunning(false);
    }
  }
  return [run, running];
}

/**
 * The alerts inbox: new devices, devices back after a long absence, and address changes, newest
 * first. Filter by state and type (in the URL), mark read, resolve, and see how alerts are
 * decided. New alerts appear live.
 */
export function AlertsPage() {
  const alerts = useAlerts();
  const { filters, status, error, items } = alerts;
  const counts = useAlertStore((state) => state.counts);
  const policy = useAlertStore((state) => state.policy);
  const arrivedAt = useAlertStore((state) => state.arrivedAt);
  const loadMore = useAlertStore((state) => state.loadMore);
  const refreshList = useAlertStore((state) => state.refreshList);
  const now = useNow();
  const [markAllRead, isMarking] = useBulkAction(useAlertStore.getState().markAllRead, {
    done: 'All alerts marked as read',
    failed: 'Could not mark the alerts as read',
  });
  const [resolveAll, isResolving] = useBulkAction(useAlertStore.getState().resolveAll, {
    done: 'All open alerts resolved',
    failed: 'Could not resolve the alerts',
  });
  const filteredDevice = useDeviceStore((state) =>
    filters.deviceId ? state.byId[filters.deviceId] : null,
  );
  const deviceName = filteredDevice
    ? deviceTitle(filteredDevice)
    : (items[0]?.device && deviceTitle(items[0].device)) || 'one device';
  const open = openCount(counts);

  const statusOptions = ALERT_STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value === 'open' ? open : option.value === 'unread' ? counts.unread : undefined,
  }));

  let body;
  if (status === 'idle' || status === 'loading') {
    body = <ListSkeleton />;
  } else if (status === 'error') {
    body = <ErrorState title="Could not load the alerts" error={error} onRetry={refreshList} />;
  } else if (items.length === 0) {
    body = <EmptyState icon={BellRing} {...emptyState(filters)} />;
  } else {
    body = (
      <>
        <ul className="divide-y divide-border/60" aria-label="Alerts">
          {items.map((alert) => (
            <AlertItem
              // A live arrival gives the row a new key: it mounts once and plays the highlight.
              key={`${alert.id}:${arrivedAt[alert.id] ?? 0}`}
              alert={alert}
              now={now}
              highlight={Boolean(arrivedAt[alert.id])}
            />
          ))}
        </ul>
        <LoadMore list={alerts} onLoadMore={loadMore} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        description={
          <>
            <span className="tabular-nums">{counts.unread}</span> unread ·{' '}
            <span className="tabular-nums">{open}</span> open
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              disabled={counts.unread === 0 || isMarking}
            >
              <CheckCheck aria-hidden="true" />
              Mark all read
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={resolveAll}
              disabled={open === 0 || isResolving}
            >
              <ListChecks aria-hidden="true" />
              Resolve all
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Alert state"
          value={filters.status}
          onChange={alerts.setStatus}
          options={statusOptions}
        />
        <SegmentedControl
          label="Alert type"
          value={filters.type}
          onChange={alerts.setType}
          options={ALERT_TYPE_OPTIONS}
          className="max-w-full overflow-x-auto"
        />
        {filters.deviceId && (
          <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 pr-1 pl-3 text-sm text-primary">
            Device: {deviceName}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={alerts.clearDevice}
              aria-label="Show alerts of every device"
            >
              <X />
            </Button>
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <GlassPanel className="overflow-hidden">{body}</GlassPanel>
        <AlertRules policy={policy} />
      </div>
    </div>
  );
}
