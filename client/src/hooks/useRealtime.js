import { EventTypes } from '@netscope/shared/events';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { realtimeClient } from '@/services/realtimeClient';
import { useAlertStore } from '@/stores/useAlertStore';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { useDeviceDetailsStore } from '@/stores/useDeviceDetailsStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { usePortScanStore } from '@/stores/usePortScanStore';
import { useScanDetailsStore } from '@/stores/useScanDetailsStore';
import { useScanHistoryStore } from '@/stores/useScanHistoryStore';
import { createAlertAnnouncer } from '@/utils/alertAnnouncer';
import { ALERT_TYPE_LABELS, summarizeAlerts } from '@/utils/alerts';
import { deviceDetailsPath } from '@/utils/deviceLinks';

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
 * Toasts new alerts: one alert by itself (opening its device), a burst as one summary (opening
 * the Alerts page). A new device is a warning; the other types are informational.
 */
function announceAlerts(alerts, navigate) {
  if (alerts.length === 1) {
    const [alert] = alerts;
    const show = alert.type === 'new_device' ? toast.warning : toast.info;
    show(ALERT_TYPE_LABELS[alert.type] ?? 'New alert', {
      description: alert.message,
      action: {
        label: 'View',
        onClick: () => navigate(alert.device ? deviceDetailsPath(alert.device.id) : '/alerts'),
      },
    });
    return;
  }
  const show = alerts.some((alert) => alert.type === 'new_device') ? toast.warning : toast.info;
  show(`${alerts.length} new alerts`, {
    description: summarizeAlerts(alerts),
    action: { label: 'View', onClick: () => navigate('/alerts') },
  });
}

/**
 * Connects the app to the real-time channel for as long as the shell is mounted:
 * connection status → useConnectionStore, events → useDeviceStore, useDeviceDetailsStore,
 * usePortScanStore, the scan history stores, and useAlertStore. After a reconnection they are
 * reloaded, since events sent while disconnected are not replayed. Alert counts (the navigation
 * badge) are loaded on start.
 *
 * New alerts are toasted in every tab, including the one that ran the discovery.
 *
 * A discovery started from another tab or browser is reported with a toast here; this tab's own
 * discoveries are reported by useDiscoverNetwork from the HTTP response. Port scans run in the
 * background, so this tab's own are announced here when they end.
 */
export function useRealtime() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    const announcer = createAlertAnnouncer((alerts) => announceAlerts(alerts, navigateRef.current));
    useAlertStore.getState().loadSummary();

    const offStatus = realtimeClient.onStatus((info) => {
      useConnectionStore.getState().setStatus(info);
      const devices = useDeviceStore.getState();
      if (info.status === 'open' && info.isReconnect) {
        if (devices.status === 'success') devices.fetchDevices();
        useDeviceDetailsStore.getState().refresh();
        useScanHistoryStore.getState().refresh();
        useScanDetailsStore.getState().refresh();
        const alerts = useAlertStore.getState();
        alerts.loadSummary();
        alerts.refreshList();
        if (alerts.device.deviceId) alerts.openDevice(alerts.device.deviceId);
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
      useScanHistoryStore.getState().applyEvent(event);
      useScanDetailsStore.getState().applyEvent(event);
      useAlertStore.getState().applyEvent(event);
      if (event.type === EventTypes.ALERT_CREATED) announcer.add(event.data.alert);
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
      announcer.cancel();
      offEvent();
      offStatus();
      realtimeClient.disconnect();
    };
  }, []);
}
