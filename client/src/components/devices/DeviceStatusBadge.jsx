import { StatusDot } from '@/components/common/StatusDot';
import { cn } from '@/lib/utils';

/** Online / offline pill. */
export function DeviceStatusBadge({ status, className }) {
  const online = status === 'online';
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium',
        online
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-border bg-muted/40 text-muted-foreground',
        className,
      )}
    >
      <StatusDot tone={online ? 'online' : 'offline'} />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}
