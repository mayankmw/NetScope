import { motion } from 'motion/react';
import { RelativeTime } from '@/components/common/RelativeTime';
import { GlassPanel } from '@/components/common/GlassPanel';
import { deviceTypeLabel } from '@/constants/deviceTypes';
import { cn } from '@/lib/utils';
import { DeviceName, DeviceTags, IpChangedMarker, PrivateMacTag } from './DeviceAttributes';
import { DeviceStatusBadge } from './DeviceStatusBadge';
import { DeviceTypeAvatar } from './DeviceTypeLabel';

/** One device as a card (phones and small tablets). */
export function DeviceCard({ device, now, previousIp }) {
  const online = device.status === 'online';
  return (
    <GlassPanel as="article" className={cn('space-y-3 p-4', !online && 'opacity-80')}>
      <div className="flex items-start gap-3">
        <DeviceTypeAvatar type={device.deviceType} online={online} />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <DeviceName device={device} className="truncate" fallback />
          </h3>
          <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[13px] tabular-nums">
            {device.ipAddress}
            <IpChangedMarker previousIp={previousIp} />
          </p>
        </div>
        <DeviceStatusBadge status={device.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="col-span-2 flex min-w-0 items-center gap-2">
          <dt className="sr-only">MAC address</dt>
          <dd className="truncate font-mono text-muted-foreground">{device.macAddress}</dd>
          <PrivateMacTag device={device} />
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Vendor</dt>
          <dd className="truncate">{device.vendor ?? 'Unknown'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Type</dt>
          <dd className="truncate">{deviceTypeLabel(device.deviceType)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">First seen</dt>
          <dd>
            <RelativeTime value={device.firstSeenAt} now={now} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last seen</dt>
          <dd>
            <RelativeTime value={device.lastSeenAt} now={now} />
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-1.5 empty:hidden">
        <DeviceTags device={device} now={now} />
      </div>
    </GlassPanel>
  );
}

/** Card grid for narrow screens. Cards fade in with a short stagger. */
export function DeviceGrid({ devices, now, ipChanges }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {devices.map((device, index) => (
        <motion.li
          key={device.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.025 }}
        >
          <DeviceCard device={device} now={now} previousIp={ipChanges[device.id]} />
        </motion.li>
      ))}
    </ul>
  );
}
