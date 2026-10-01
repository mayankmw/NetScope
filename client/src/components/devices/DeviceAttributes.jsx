import {
  ArrowRightLeft,
  MonitorCheck,
  Router,
  ShieldCheck,
  Sparkles,
  VenetianMask,
} from 'lucide-react';
import { Tag } from '@/components/common/Tag';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { deviceDisplayName, isNewDevice } from '@/utils/deviceFilters';

/**
 * Small, tooltip-explained building blocks for device rows and cards. Each renders nothing when
 * it does not apply, so callers can place them unconditionally.
 */

function WithTooltip({ label, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** "Gateway" and "New" tags. */
export function DeviceTags({ device, now }) {
  return (
    <>
      {device.isGateway && (
        <Tag tone="primary" icon={Router}>
          Gateway
        </Tag>
      )}
      {isNewDevice(device, now) && (
        <WithTooltip label="First seen in the last 24 hours">
          <Tag tone="magenta" icon={Sparkles} tabIndex={0}>
            New
          </Tag>
        </WithTooltip>
      )}
    </>
  );
}

/** Marker for the machine NetScope runs on (details page only: the inventory does not know). */
export function SelfTag({ device }) {
  if (!device.isSelf) return null;
  return (
    <WithTooltip label="The computer NetScope is running on">
      <Tag tone="success" icon={MonitorCheck} tabIndex={0}>
        This computer
      </Tag>
    </WithTooltip>
  );
}

/** Marker for a device the user marked as trusted. */
export function TrustedTag({ device }) {
  if (!device.isTrusted) return null;
  return (
    <Tag tone="success" icon={ShieldCheck}>
      Trusted
    </Tag>
  );
}

/** Marker for a randomized (private) MAC address. */
export function PrivateMacTag({ device }) {
  if (!device.macIsRandom) return null;
  return (
    <WithTooltip label="Randomized (private) MAC address: the manufacturer cannot be identified, and it may change after a device reset.">
      <Tag tone="muted" icon={VenetianMask} tabIndex={0}>
        Private
      </Tag>
    </WithTooltip>
  );
}

/** Marker for an IP address that changed in the latest discovery. */
export function IpChangedMarker({ previousIp }) {
  if (!previousIp) return null;
  return (
    <WithTooltip label={`Changed from ${previousIp} in the latest scan`}>
      <button
        type="button"
        className="inline-grid size-5 place-items-center rounded text-warning"
        aria-label={`IP changed from ${previousIp}`}
      >
        <ArrowRightLeft className="size-3.5" />
      </button>
    </WithTooltip>
  );
}

/** A missing value: a quiet dash on screen, "Unknown" for screen readers. */
export function MissingValue() {
  return (
    <>
      <span className="text-muted-foreground/60" aria-hidden="true">
        —
      </span>
      <span className="sr-only">Unknown</span>
    </>
  );
}

/**
 * Display name / hostname. With `fallback`, unnamed devices are called after their vendor
 * ("Espressif Inc. device") or "Unknown device" — for lists where a name is required.
 * Without it, a missing name renders as MissingValue (table cells).
 */
export function DeviceName({ device, className, fallback = false }) {
  const name = deviceDisplayName(device);
  if (name) {
    return (
      <span className={className} title={name}>
        {name}
      </span>
    );
  }
  if (!fallback) return <MissingValue />;
  return (
    <span className={cn(className, 'text-muted-foreground')}>
      {device.vendor ? `${device.vendor} device` : 'Unknown device'}
    </span>
  );
}
