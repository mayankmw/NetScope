import { Link } from 'react-router';
import { AlertItem } from '@/components/alerts/AlertItem';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { useDeviceAlerts } from '@/hooks/useDeviceAlerts';
import { toAlertSearchParams } from '@/utils/alerts';

/**
 * The alerts about this device, newest first (at most five; a link leads to all of them). Not
 * shown for a device that never raised one.
 *
 * @param {{ deviceId: string, now: number, className?: string }} props
 */
export function DeviceAlerts({ deviceId, now, className }) {
  const alerts = useDeviceAlerts(deviceId);
  if (alerts.status !== 'success' || alerts.items.length === 0) return null;

  const open = alerts.items.filter((alert) => alert.status !== 'resolved').length;
  const all = `/alerts?${toAlertSearchParams({ status: 'all', type: 'all', deviceId })}`;

  return (
    <GlassPanel as="section" aria-labelledby="device-alerts-title" className={className}>
      <PanelHeader
        title={<span id="device-alerts-title">Alerts</span>}
        description={open > 0 ? `${open} open` : 'All resolved'}
        actions={
          <Link
            to={all}
            className="rounded-sm text-xs text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {alerts.nextCursor ? 'View all' : 'Open in Alerts'}
          </Link>
        }
      />
      <ul className="divide-y divide-border/60 border-t border-border" aria-label="Device alerts">
        {alerts.items.map((alert) => (
          <AlertItem key={alert.id} alert={alert} now={now} compact />
        ))}
      </ul>
    </GlassPanel>
  );
}
