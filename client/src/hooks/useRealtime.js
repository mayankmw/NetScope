import { EventTypes } from '@netscope/shared/events';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { realtimeClient } from '@/services/realtimeClient';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { useDeviceStore } from '@/stores/useDeviceStore';

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Connects the app to the real-time channel for as long as the shell is mounted:
 * connection status → useConnectionStore, events → useDeviceStore. After a reconnection the
 * device list is reloaded, since events sent while disconnected are not replayed.
 *
 * A discovery started from another tab or browser is reported with a toast here; this tab's own
 * discoveries are reported by useDiscoverNetwork from the HTTP response.
 */
export function useRealtime() {
  useEffect(() => {
    const offStatus = realtimeClient.onStatus((info) => {
      useConnectionStore.getState().setStatus(info);
      const devices = useDeviceStore.getState();
      if (info.status === 'open' && info.isReconnect && devices.status === 'success') {
        devices.fetchDevices();
      }
    });

    const offEvent = realtimeClient.onEvent((event) => {
      if (event.type === EventTypes.SYSTEM_CONNECTED) {
        useConnectionStore.getState().setServerInfo(event.data);
      }

      const isLocalScan = useDeviceStore.getState().discovery.localPending;
      useDeviceStore.getState().applyEvent(event);

      if (isLocalScan) return;
      if (event.type === EventTypes.DISCOVERY_COMPLETED) {
        const { summary, sweptRange } = event.data;
        toast.info(`Network scan finished on ${sweptRange}`, {
          description: `${plural(summary.devicesFound, 'device')} found · ${summary.newDevices} new · ${summary.wentOffline} went offline`,
        });
      } else if (event.type === EventTypes.DISCOVERY_FAILED) {
        toast.error('A network scan failed', { description: event.data.error?.message });
      }
    });

    realtimeClient.connect();
    return () => {
      offEvent();
      offStatus();
      realtimeClient.disconnect();
    };
  }, []);
}
