import { StatusDot } from '@/components/common/StatusDot';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { formatTime } from '@/utils/format';

const STATES = {
  idle: { tone: 'neutral', label: 'Offline', detail: 'Live updates are off.' },
  connecting: { tone: 'neutral', label: 'Connecting', detail: 'Connecting to live updates…' },
  open: { tone: 'online', label: 'Live', detail: 'Live updates connected.' },
  reconnecting: {
    tone: 'warning',
    label: 'Reconnecting',
    detail: 'Live updates disconnected. Reconnecting…',
  },
};

/** Real-time connection status in the top bar. */
export function LiveIndicator({ className }) {
  const status = useConnectionStore((state) => state.status);
  const attempt = useConnectionStore((state) => state.attempt);
  const nextRetryAt = useConnectionStore((state) => state.nextRetryAt);
  const connectedAt = useConnectionStore((state) => state.connectedAt);
  const now = useNow(1_000);
  const { tone, label, detail } = STATES[status];
  const retryIn = nextRetryAt ? Math.max(0, Math.ceil((nextRetryAt - now) / 1000)) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          tabIndex={0}
          aria-label={`Live updates: ${label}`}
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-full border border-border bg-background/40 px-3 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
            status === 'open' && 'text-success',
            className,
          )}
        >
          <StatusDot tone={tone} pulse={status === 'open'} />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        <span className="font-medium">{detail}</span>
        {status === 'reconnecting' && retryIn !== null && (
          <span>
            Next attempt in {retryIn} s (attempt {attempt})
          </span>
        )}
        {status === 'open' && connectedAt && (
          <span className="opacity-70">Connected at {formatTime(connectedAt)}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
