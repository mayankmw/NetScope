import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { RelativeTime } from '@/components/common/RelativeTime';
import { StatusDot } from '@/components/common/StatusDot';
import { Button } from '@/components/ui/button';
import { deviceTypeLabel } from '@/constants/deviceTypes';
import { DeviceName, DeviceTags } from './DeviceAttributes';
import { DeviceTypeAvatar } from './DeviceTypeLabel';

/** The most recently discovered devices, newest first. */
export function RecentDevicesPanel({ devices, now }) {
  return (
    <GlassPanel>
      <PanelHeader
        title="Recently discovered"
        description="Newest devices on this network"
        actions={
          <Button asChild variant="ghost" size="sm" className="text-primary">
            <Link to="/devices?sort=firstSeen&dir=desc">
              View all
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      <ul className="divide-y divide-border">
        {devices.map((device) => (
          <li key={device.id} className="flex items-center gap-3 px-5 py-3">
            <DeviceTypeAvatar type={device.deviceType} online={device.status === 'online'} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <DeviceName device={device} className="truncate" fallback />
                <DeviceTags device={device} now={now} />
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{device.ipAddress}</span> ·{' '}
                {deviceTypeLabel(device.deviceType)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
              <StatusDot tone={device.status === 'online' ? 'online' : 'offline'} />
              <RelativeTime value={device.firstSeenAt} now={now} />
            </div>
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}
