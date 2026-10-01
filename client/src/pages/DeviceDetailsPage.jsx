import { SearchX, TriangleAlert } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { DeviceActivity } from '@/components/device-details/DeviceActivity';
import { DeviceAlerts } from '@/components/device-details/DeviceAlerts';
import { DeviceDetailsSkeleton } from '@/components/device-details/DeviceDetailsSkeleton';
import { BackLink, DeviceHeader } from '@/components/device-details/DeviceHeader';
import { DeviceIdentityCard } from '@/components/device-details/DeviceIdentityCard';
import { DeviceMetadata } from '@/components/device-details/DeviceMetadata';
import { DeviceNetworkCard } from '@/components/device-details/DeviceNetworkCard';
import { DevicePorts } from '@/components/device-details/DevicePorts';
import { DevicePresenceHistory } from '@/components/device-details/DevicePresenceHistory';
import { DeviceStatus } from '@/components/device-details/DeviceStatus';
import { Button } from '@/components/ui/button';
import { useDeviceDetails } from '@/hooks/useDeviceDetails';
import { useNow } from '@/hooks/useNow';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { backLink } from '@/utils/deviceLinks';

/**
 * One device in detail: status, alerts, identity, network, presence history, open ports,
 * activity, and metadata. Updates live.
 *
 * Panels are ordered for reading on a phone (status, alerts, identity, network, presence, ports,
 * activity, metadata); on wide screens the column wrappers become two columns (`contents` →
 * `flex`): status, alerts, presence, ports, activity, and metadata on the left; identity and
 * network on the right. Alerts appear only for a device that raised some.
 */
export function DeviceDetailsPage() {
  const { deviceId } = useParams();
  const location = useLocation();
  const back = backLink(location.state?.from);
  const now = useNow();
  const state = useDeviceDetails(deviceId);
  const { status, error, details, isRefreshing, changedAt, refresh, loadMore, retryHistory } =
    state;
  // Arriving from the device list, its row already has the basics: show them while loading.
  const preview = useDeviceStore((store) => store.byId[deviceId]);

  if (status === 'not-found') {
    return (
      <div className="space-y-6">
        <BackLink back={back} />
        <GlassPanel>
          <EmptyState
            icon={SearchX}
            title="Device not found"
            description="NetScope has no device with this ID. The link may be mistyped, or the device belonged to a network that was removed."
            action={
              <Button asChild variant="outline">
                <Link to="/devices">Back to devices</Link>
              </Button>
            }
          />
        </GlassPanel>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-6">
        {preview ? (
          <DeviceHeader back={back} now={now} device={preview} />
        ) : (
          <BackLink back={back} />
        )}
        <GlassPanel>
          <ErrorState title="Could not load this device" error={error} onRetry={refresh} />
        </GlassPanel>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="space-y-6">
        <DeviceHeader back={back} now={now} device={preview} />
        <DeviceDetailsSkeleton />
      </div>
    );
  }

  const { device, network, presence, ipHistory, localInterface } = details;

  return (
    <div className="space-y-6">
      <DeviceHeader
        back={back}
        now={now}
        device={device}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />

      {error && (
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

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-4">
          <DeviceStatus
            // A live change re-mounts the panel once to play the highlight.
            key={changedAt ?? 0}
            device={device}
            presence={presence}
            now={now}
            highlight={changedAt !== null}
            className="order-1"
          />
          <DeviceAlerts deviceId={device.id} now={now} className="order-2" />
          <DevicePresenceHistory
            presence={state.presenceHistory}
            onRangeChange={state.setPresenceDays}
            onRetry={state.retryPresence}
            className="order-5"
          />
          <DevicePorts device={device} now={now} className="order-6" />
          <DeviceActivity
            events={state.events}
            observations={state.observations}
            now={now}
            onLoadMore={loadMore}
            onRetry={retryHistory}
            className="order-7"
          />
          <DeviceMetadata device={device} network={network} className="order-8" />
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <DeviceIdentityCard device={device} className="order-3" />
          <DeviceNetworkCard
            device={device}
            network={network}
            presence={presence}
            ipHistory={ipHistory}
            localInterface={localInterface}
            now={now}
            className="order-4"
          />
        </div>
      </div>
    </div>
  );
}
