import { useCallback } from 'react';
import { toast } from 'sonner';
import { useDeviceStore } from '@/stores/useDeviceStore';

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * The "Discover network" action: runs discovery through the store and reports the outcome
 * with a toast. Safe to call while a scan is running (it is ignored).
 */
export function useDiscoverNetwork() {
  const isRunning = useDeviceStore((state) => state.discovery.status === 'running');
  const discoverNetwork = useDeviceStore((state) => state.discoverNetwork);

  const discover = useCallback(async () => {
    try {
      const result = await discoverNetwork();
      if (!result) return;
      const { summary, network } = result;
      const details = [
        summary.newDevices > 0 && plural(summary.newDevices, 'new device'),
        summary.ipChanges > 0 && plural(summary.ipChanges, 'IP change'),
        summary.wentOffline > 0 && `${summary.wentOffline} went offline`,
      ].filter(Boolean);
      toast.success(`Found ${plural(summary.devicesFound, 'device')} on ${network.sweptRange}`, {
        description: details.length > 0 ? details.join(' · ') : 'No changes since the last scan.',
      });
    } catch (error) {
      toast.error(
        error.code === 'SCAN_IN_PROGRESS' ? 'A scan is already running' : 'Discovery failed',
        { description: error.message },
      );
    }
  }, [discoverNetwork]);

  return { discover, isRunning };
}
