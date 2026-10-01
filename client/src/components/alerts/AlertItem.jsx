import { toast } from 'sonner';
import { RelativeTime } from '@/components/common/RelativeTime';
import { DeviceLink } from '@/components/devices/DeviceLink';
import { ScanLink } from '@/components/scans/ScanLink';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAlertStore } from '@/stores/useAlertStore';
import { ALERT_TYPE_LABELS } from '@/utils/alerts';
import { ALERT_TYPE_STYLES } from './alertTypes';

const linkClass =
  'rounded-sm underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring';

/**
 * One alert: what happened (type, message), when and how often, links to the device and the scan
 * that saw it, and its state with the actions that change it. Unread alerts carry a dot and bold
 * title; resolved ones are muted. Opening the device marks the alert read.
 *
 * @param {{ alert: import('@/types/api').Alert, now: number, compact?: boolean,
 *           highlight?: boolean }} props `compact` leaves out the device link (device page)
 */
export function AlertItem({ alert, now, compact = false, highlight = false }) {
  const setStatus = useAlertStore((state) => state.setStatus);
  const isSaving = useAlertStore((state) => Boolean(state.pending[alert.id]));
  const { icon: Icon, tone } = ALERT_TYPE_STYLES[alert.type] ?? ALERT_TYPE_STYLES.new_device;
  const label = ALERT_TYPE_LABELS[alert.type] ?? 'Alert';
  const unread = alert.status === 'unread';
  const resolved = alert.status === 'resolved';

  async function change(status) {
    try {
      await setStatus(alert, status);
    } catch (error) {
      toast.error('Could not update the alert', { description: error.message });
    }
  }

  return (
    <li
      className={cn(
        'flex flex-col gap-3 px-5 py-3.5 sm:flex-row',
        unread && 'bg-primary/[0.04]',
        highlight && 'animate-live-highlight',
      )}
      data-status={alert.status}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <span
          className={cn(
            'relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border',
            tone,
            resolved && 'opacity-50',
          )}
          aria-hidden="true"
        >
          <Icon className="size-4" />
          {unread && (
            <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] ring-2 ring-background" />
          )}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3
              className={cn(
                'text-sm',
                unread ? 'font-semibold' : 'font-medium',
                resolved && 'text-muted-foreground',
              )}
            >
              {label}{' '}
              <span className="sr-only">
                {unread ? '(unread)' : resolved ? '(resolved)' : '(read)'}
              </span>
            </h3>
            <RelativeTime
              value={alert.lastOccurredAt}
              now={now}
              className="text-xs text-muted-foreground"
            />
          </div>
          <p className={cn('text-sm break-words', resolved && 'text-muted-foreground')}>
            {alert.message}
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {!compact && alert.device && (
              <DeviceLink
                deviceId={alert.device.id}
                className={linkClass}
                onClick={() => unread && change('read')}
              >
                Open device
              </DeviceLink>
            )}
            {alert.occurrences > 1 && (
              <span>
                {alert.occurrences} times since <RelativeTime value={alert.createdAt} now={now} />
              </span>
            )}
            {alert.scanId && (
              <ScanLink scanId={alert.scanId} className={linkClass}>
                The scan that saw it
              </ScanLink>
            )}
            {resolved && alert.resolvedAt && (
              <span>
                Resolved <RelativeTime value={alert.resolvedAt} now={now} />
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2 pl-11 sm:pl-0">
        {!resolved && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isSaving}
            onClick={() => change(unread ? 'read' : 'unread')}
            aria-label={`${unread ? 'Mark read' : 'Mark unread'}: ${label}`}
          >
            {unread ? 'Mark read' : 'Mark unread'}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={isSaving}
          onClick={() => change(resolved ? 'read' : 'resolved')}
          aria-label={`${resolved ? 'Reopen' : 'Resolve'}: ${label}`}
        >
          {resolved ? 'Reopen' : 'Resolve'}
        </Button>
      </div>
    </li>
  );
}
