import { EventTypes } from '@netscope/shared/events';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { realtimeClient } from '@/services/realtimeClient';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { useDeviceDetailsStore } from '@/stores/useDeviceDetailsStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { usePortScanStore } from '@/stores/usePortScanStore';

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Toasts the outcome of a port scan started from this tab. */
function announcePortScan({ type, data }) {
  const isEnd = type === EventTypes.PORT_SCAN_COMPLETED || type === EventTypes.PORT_SCAN_FAILED;
  if (!isEnd || !usePortScanStore.getState().isLocalScan(data.scanId)) return;
  if (type === EventTypes.PORT_SCAN_FAILED) {
    toast.error('Port scan failed', { description: data.error?.message });
    return;
  }
  const { open, portsChecked, newlyOpen } = data.summary;
  toast.success(`Port scan finished: ${plural(open, 'open port')}`, {
    description:
      newlyOpen.length > 0
        ? `Newly open: ${newlyOpen.join(', ')}`
        : `${portsChecked} ports checked in ${Math.round(data.durationMs / 1000)} s`,
  });
}

/**
 * Connects the app to the real-time channel for as long as the shell is mounted:
 * connection status → useConnectionStore, events → useDeviceStore, useDeviceDetailsStore, and
 * usePortScanStore. After a reconnection they are reloaded, since events sent while disconnected
 * are not replayed.
 *
 * A discovery started from another tab or browser is reported with a toast here; this tab's own
 * discoveries are reported by useDiscoverNetwork from the HTTP response. Port scans run in the
 * background, so this tab's own are announced here when they end.
 */
export function useRealtime() {
  useEffect(() => {
    const offStatus = realtimeClient.onStatus((info) => {
      useConnectionStore.getState().setStatus(info);
      const devices = useDeviceStore.getState();
      if (info.status === 'open' && info.isReconnect) {
        if (devices.status === 'success') devices.fetchDevices();
        useDeviceDetailsStore.getState().refresh();
      }
    });

    const offEvent = realtimeClient.onEvent((event) => {
      if (event.type === EventTypes.SYSTEM_CONNECTED) {
        useConnectionStore.getState().setServerInfo(event.data);
      }

      const isLocalScan = useDeviceStore.getState().discovery.localPending;
      useDeviceStore.getState().applyEvent(event);
      useDeviceDetailsStore.getState().applyEvent(event);
      usePortScanStore.getState().applyEvent(event);
      announcePortScan(event);

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
