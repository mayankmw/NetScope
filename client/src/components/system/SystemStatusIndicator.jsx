import { StatusDot } from '@/components/common/StatusDot';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import { cn } from '@/lib/utils';
import { formatTime } from '@/utils/format';

const STATES = {
  checking: { tone: 'neutral', label: 'Checking…', detail: 'Contacting the NetScope server…' },
  online: { tone: 'online', label: 'Online', detail: 'API and database are up.' },
  degraded: {
    tone: 'warning',
    label: 'Degraded',
    detail: 'The API is running, but it cannot reach the database.',
  },
  offline: { tone: 'error', label: 'Offline', detail: 'The NetScope server is not reachable.' },
};

/** Compact API/database health in the top bar. Click to re-check. */
export function SystemStatusIndicator({ className }) {
  const { state, data, checkedAt, isChecking, refresh } = useSystemHealth();
  const { tone, label, detail } = STATES[state];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={refresh}
          disabled={isChecking}
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-full border border-border bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
          aria-label={`System status: ${label}. Click to check again.`}
        >
          <StatusDot tone={tone} pulse={state === 'online'} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        <span className="font-medium">{detail}</span>
        {data?.checks?.database?.latencyMs !== undefined && (
          <span>Database latency {data.checks.database.latencyMs} ms</span>
        )}
        {checkedAt && <span className="opacity-70">Checked at {formatTime(checkedAt)}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
