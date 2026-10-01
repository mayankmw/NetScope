import { Ban, CircleCheck, CircleX, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SCAN_STATUS_LABELS } from '@/utils/scans';

const STYLES = {
  completed: { icon: CircleCheck, tone: 'border-success/30 bg-success/10 text-success' },
  running: { icon: Loader2, tone: 'border-primary/30 bg-primary/10 text-primary', spin: true },
  queued: { icon: Loader2, tone: 'border-primary/30 bg-primary/10 text-primary', spin: true },
  failed: { icon: CircleX, tone: 'border-destructive/30 bg-destructive/10 text-destructive' },
  cancelled: { icon: Ban, tone: 'border-warning/30 bg-warning/10 text-warning' },
};

/** Completed / Running / Failed / Cancelled pill. */
export function ScanStatusBadge({ status, className }) {
  const { icon: Icon, tone, spin } = STYLES[status] ?? STYLES.failed;
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium',
        tone,
        className,
      )}
    >
      <Icon className={cn('size-3.5', spin && 'motion-safe:animate-spin')} aria-hidden="true" />
      {SCAN_STATUS_LABELS[status] ?? status}
    </span>
  );
}
