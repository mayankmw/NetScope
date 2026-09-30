import { createElement } from 'react';
import { deviceTypeLabel } from '@/constants/deviceTypes';
import { cn } from '@/lib/utils';
import { deviceTypeIcon } from './deviceTypeIcons';

/** The icon for a device type. Icons come from a static map, never created during render. */
export function DeviceTypeIcon({ type, ...props }) {
  return createElement(deviceTypeIcon(type), { 'aria-hidden': true, ...props });
}

/** Device type as icon + label; "Unknown" is de-emphasized. */
export function DeviceTypeLabel({ type, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        type === 'unknown' && 'text-muted-foreground',
        className,
      )}
    >
      <DeviceTypeIcon type={type} className="size-4 shrink-0 opacity-80" />
      {deviceTypeLabel(type)}
    </span>
  );
}

/** Round icon badge for a device type (cards and lists). */
export function DeviceTypeAvatar({ type, online = true, className }) {
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg border',
        online
          ? 'border-primary/25 bg-primary/10 text-primary'
          : 'border-border bg-muted/40 text-muted-foreground',
        className,
      )}
      aria-hidden="true"
    >
      <DeviceTypeIcon type={type} className="size-4.5" />
    </span>
  );
}
