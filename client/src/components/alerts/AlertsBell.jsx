import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAlertStore } from '@/stores/useAlertStore';

/** Top-bar link to the alerts, with the number of unread ones. */
export function AlertsBell({ className }) {
  const unread = useAlertStore((state) => state.counts.unread);
  const label = unread > 0 ? `Alerts: ${unread} unread` : 'Alerts';

  return (
    <Button asChild variant="ghost" size="icon" className={cn('relative', className)}>
      <Link to="/alerts" aria-label={label} title={label}>
        <Bell className={cn(unread > 0 && 'text-foreground')} aria-hidden="true" />
        {unread > 0 && (
          <span
            className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-neon-magenta px-1 text-[10px] leading-none font-semibold text-white tabular-nums shadow-[0_0_10px_-2px_var(--neon-magenta)]"
            aria-hidden="true"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
