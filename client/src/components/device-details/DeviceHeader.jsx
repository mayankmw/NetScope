import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import {
  DeviceTags,
  PrivateMacTag,
  SelfTag,
  TrustedTag,
} from '@/components/devices/DeviceAttributes';
import { DeviceStatusBadge } from '@/components/devices/DeviceStatusBadge';
import { DeviceTypeIcon } from '@/components/devices/DeviceTypeLabel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { deviceTypeLabel } from '@/constants/deviceTypes';
import { cn } from '@/lib/utils';
import { deviceTitle } from '@/utils/deviceFilters';

/** "← Devices": back to the page the user came from. */
export function BackLink({ back }) {
  return (
    <Link
      to={back.to}
      className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {back.label}
    </Link>
  );
}

/**
 * Title block of the details page: back link, type icon, name, status, tags, and key facts.
 * Without `device` (still loading, nothing to preview) it shows placeholders.
 *
 * @param {{ device?: import('@/types/api').Device & { isSelf?: boolean },
 *           back: { to: string, label: string }, now: number,
 *           onRefresh?: () => void, isRefreshing?: boolean }} props
 */
export function DeviceHeader({ device, back, now, onRefresh, isRefreshing = false }) {
  const online = device?.status === 'online';

  return (
    <div className="space-y-4">
      <BackLink back={back} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-xl border',
              online
                ? 'border-primary/30 bg-primary/10 text-primary shadow-[0_0_24px_-8px_var(--primary)]'
                : 'border-border bg-muted/40 text-muted-foreground',
            )}
            aria-hidden="true"
          >
            {device && <DeviceTypeIcon type={device.deviceType} className="size-6" />}
          </span>

          <div className="min-w-0 space-y-1.5">
            {device ? (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
                    {deviceTitle(device)}
                  </h1>
                  <DeviceStatusBadge status={device.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono text-foreground">{device.ipAddress}</span>
                  {' · '}
                  {device.vendor ?? 'Unknown vendor'}
                  {' · '}
                  {deviceTypeLabel(device.deviceType)}
                </p>
                <div className="flex flex-wrap gap-1.5 empty:hidden">
                  <SelfTag device={device} />
                  <DeviceTags device={device} now={now} />
                  <TrustedTag device={device} />
                  <PrivateMacTag device={device} />
                </div>
              </>
            ) : (
              <>
                <h1 className="sr-only">Device details</h1>
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-64" />
              </>
            )}
          </div>
        </div>

        {onRefresh && (
          <Button
            variant="outline"
            className="self-start"
            onClick={onRefresh}
            disabled={!device || isRefreshing}
            aria-label="Reload device details"
          >
            <RefreshCw className={isRefreshing ? 'motion-safe:animate-spin' : undefined} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        )}
      </div>
    </div>
  );
}
