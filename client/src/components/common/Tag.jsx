import { cn } from '@/lib/utils';

const TONES = {
  primary: 'border-primary/30 bg-primary/10 text-primary',
  magenta: 'border-neon-magenta/30 bg-neon-magenta/10 text-neon-magenta',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  success: 'border-success/30 bg-success/10 text-success',
  muted: 'border-border bg-muted/40 text-muted-foreground',
};

/** Compact label used for device attributes ("Gateway", "New", "Private MAC"). */
export function Tag({ tone = 'muted', icon: Icon, className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] leading-none font-medium',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-3" aria-hidden="true" />}
      {children}
    </span>
  );
}
