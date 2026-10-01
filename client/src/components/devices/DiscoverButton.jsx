import { Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDiscoverNetwork } from '@/hooks/useDiscoverNetwork';
import { cn } from '@/lib/utils';
import { usePortScanStore } from '@/stores/usePortScanStore';

/**
 * The "Discover network" action. Shared state means every instance (top bar, empty states)
 * shows "Scanning…" while a discovery runs anywhere in the app. It is unavailable while a port
 * scan runs: the server runs one scan at a time.
 */
export function DiscoverButton({ className, compact = false, size = 'default' }) {
  const { discover, isRunning } = useDiscoverNetwork();
  const isPortScanning = usePortScanStore((state) => state.active !== null);
  const label = isRunning ? 'Scanning…' : 'Discover network';
  const hint = isPortScanning && !isRunning ? 'Available when the port scan finishes' : undefined;

  return (
    <Button
      size={size}
      onClick={discover}
      disabled={isRunning || isPortScanning}
      className={cn('glow-primary disabled:opacity-80', className)}
      aria-label={compact ? label : undefined}
      title={hint ?? (compact ? label : undefined)}
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
