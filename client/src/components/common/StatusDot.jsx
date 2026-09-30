import { cn } from '@/lib/utils';

const TONES = {
  online: 'bg-success shadow-[0_0_8px_var(--success)]',
  offline: 'bg-muted-foreground/50',
  warning: 'bg-warning shadow-[0_0_8px_var(--warning)]',
  error: 'bg-destructive shadow-[0_0_8px_var(--destructive)]',
  neutral: 'bg-muted-foreground',
};

/**
 * Small status light. `pulse` adds a soft ping ring — use it for single, important indicators
 * only (not on every table row), and it respects reduced-motion preferences.
 */
export function StatusDot({ tone = 'online', pulse = false, className }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)} aria-hidden="true">
      {pulse && (
        <span
          className={cn(
            'absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping',
            TONES[tone],
          )}
        />
      )}
      <span className={cn('relative inline-flex size-2 rounded-full', TONES[tone])} />
    </span>
  );
}
