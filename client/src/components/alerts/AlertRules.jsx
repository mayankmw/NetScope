import { CircleCheck, Repeat2 } from 'lucide-react';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { cn } from '@/lib/utils';
import { formatInterval } from '@/utils/format';
import { ALERT_TYPE_STYLES } from './alertTypes';

const DAY_MS = 86_400_000;

function Rule({ icon: Icon, tone, title, children }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border', tone)}
        aria-hidden="true"
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

/**
 * How discovery decides what is worth an alert: the four ways a device can be seen, and how
 * repeats are kept quiet. Durations come from the server's settings.
 *
 * @param {{ policy: { returnAfterMs: number, cooldownMs: number } | null, className?: string }} props
 */
export function AlertRules({ policy, className }) {
  const away = formatInterval(policy?.returnAfterMs ?? DAY_MS);
  const cooldown = formatInterval(policy?.cooldownMs ?? DAY_MS);

  return (
    <GlassPanel as="section" aria-labelledby="alert-rules-title" className={className}>
      <PanelHeader
        title={<span id="alert-rules-title">How alerts work</span>}
        description="Each network scan compares every device with what NetScope knew before"
      />
      <ul className="space-y-4 border-t border-border px-5 py-4">
        <Rule {...ALERT_TYPE_STYLES.new_device} title="New device">
          A MAC address never seen on this network: an alert, once per device. The first scan of a
          network only records its devices.
        </Rule>
        <Rule {...ALERT_TYPE_STYLES.device_returned} title="Back online">
          A known device seen again after at least {away} away. Shorter absences only appear in its
          timeline.
        </Rule>
        <Rule {...ALERT_TYPE_STYLES.ip_changed} title="IP address changed">
          A known device found at a different address.
        </Rule>
        <Rule
          icon={CircleCheck}
          tone="border-border bg-muted/40 text-muted-foreground"
          title="Known device"
        >
          Seen again with nothing changed: no alert. Nor is there ever one about the computer
          NetScope runs on.
        </Rule>
        <Rule icon={Repeat2} tone="border-primary/30 bg-primary/10 text-primary" title="No repeats">
          While an alert is open, the same change again updates it (how often, and when) instead of
          adding another.{' '}
          {policy?.cooldownMs === 0
            ? 'After you resolve an alert, the same change can raise it again at once.'
            : `After you resolve an alert, the same one stays quiet for ${cooldown}.`}
        </Rule>
      </ul>
    </GlassPanel>
  );
}
