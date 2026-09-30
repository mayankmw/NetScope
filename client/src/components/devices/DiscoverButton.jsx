import { Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDiscoverNetwork } from '@/hooks/useDiscoverNetwork';
import { cn } from '@/lib/utils';

/**
 * The "Discover network" action. Shared state means every instance (top bar, empty states)
 * shows "Scanning…" while a discovery runs anywhere in the app.
 */
export function DiscoverButton({ className, compact = false, size = 'default' }) {
  const { discover, isRunning } = useDiscoverNetwork();
  const label = isRunning ? 'Scanning…' : 'Discover network';

  return (
    <Button
      size={size}
      onClick={discover}
      disabled={isRunning}
      className={cn('glow-primary disabled:opacity-80', className)}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
    >
      <Radar
        className={cn(
          isRunning && 'motion-safe:animate-spin motion-safe:[animation-duration:1.4s]',
        )}
        aria-hidden="true"
      />
      {!compact && <span>{label}</span>}
    </Button>
  );
}
