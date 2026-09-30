import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { GlassPanel } from './GlassPanel';

const ICON_TONES = {
  primary: 'text-primary border-primary/25 bg-primary/10',
  success: 'text-success border-success/25 bg-success/10',
  magenta: 'text-neon-magenta border-neon-magenta/25 bg-neon-magenta/10',
  muted: 'text-muted-foreground border-border bg-muted/40',
};

/** A single headline number. When `to` is set, the whole card links to the detailed view. */
export function StatCard({ label, value, icon: Icon, tone = 'primary', hint, to, isLoading }) {
  const body = (
    <GlassPanel
      className={cn(
        'flex h-full items-start justify-between gap-4 p-5 transition-colors',
        to && 'group-hover:border-primary/30 group-focus-visible:border-primary/50',
      )}
    >
      <div className="min-w-0 space-y-2">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        {isLoading ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <p className="font-mono text-3xl font-semibold tabular-nums">{value}</p>
        )}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex flex-col items-end gap-3">
        {Icon && (
          <div className={cn('grid size-9 place-items-center rounded-lg border', ICON_TONES[tone])}>
            <Icon className="size-4.5" aria-hidden="true" />
          </div>
        )}
        {to && (
          <ArrowUpRight
            className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        )}
      </div>
    </GlassPanel>
  );

  if (!to) return body;
  return (
    <Link to={to} className="group block rounded-xl outline-none" aria-label={`${label}: ${value}`}>
      {body}
    </Link>
  );
}
