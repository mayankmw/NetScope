import { Radar } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/** NetScope logo mark and wordmark. `compact` shows the mark only. */
export function Brand({ compact = false, className, onNavigate }) {
  return (
    <Link
      to="/"
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      aria-label="NetScope home"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary shadow-[0_0_18px_-6px_var(--primary)]">
        <Radar className="size-4.5" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight">
          Net<span className="text-primary text-glow">Scope</span>
        </span>
      )}
    </Link>
  );
}
