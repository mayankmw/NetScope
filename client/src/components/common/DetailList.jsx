import { cn } from '@/lib/utils';
import { CopyButton } from './CopyButton';

/** Label / value rows for a details panel (a `<dl>`). */
export function DetailList({ className, children }) {
  return <dl className={cn('divide-y divide-border/60', className)}>{children}</dl>;
}

/**
 * One row. `hint` adds a quiet second line; `copyValue` adds a copy button. `stacked` puts the
 * label above a full-width value, for long values such as IPv6 addresses.
 * @param {{ label: string, children: React.ReactNode, hint?: React.ReactNode, copyValue?: string,
 *           stacked?: boolean }} props
 */
export function DetailRow({ label, children, hint, copyValue, stacked = false }) {
  return (
    <div
      className={cn(
        'grid items-start px-5 py-2.5',
        stacked ? 'gap-1' : 'grid-cols-[minmax(6.5rem,36%)_1fr] gap-3',
      )}
    >
      <dt className="pt-0.5 text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-start gap-1.5 text-sm">
        <div className="min-w-0 flex-1 break-words">
          {children}
          {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {copyValue && <CopyButton value={copyValue} label={`Copy ${label.toLowerCase()}`} />}
      </dd>
    </div>
  );
}
