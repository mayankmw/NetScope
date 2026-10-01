import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { usePortScanStore } from '@/stores/usePortScanStore';
import { portScanState } from '@/utils/portScan';

// While a scan runs and real-time events are not flowing, check its status this often.
const POLL_INTERVAL_MS = 3_000;

const EMPTY = Object.freeze({
  status: 'idle',
  data: null,
  error: null,
  isStarting: false,
  startError: null,
});

/**
 * A device's ports and its port scan state, for the details page. Loads on mount; while a scan
 * of this device runs without a live connection, polls until it ends.
 *
 * `blockedReason` is set when another scan (a discovery, or another device's port scan) is
 * running: the server allows one scan at a time.
 *
 * @param {string} deviceId
 */
export function useDevicePorts(deviceId) {
  const entry = usePortScanStore((state) => state.byDevice[deviceId]) ?? EMPTY;
  const active = usePortScanStore((state) => state.active);
  const loadPorts = usePortScanStore((state) => state.loadPorts);
  const startScan = usePortScanStore((state) => state.startScan);
  const isDiscovering = useDeviceStore((state) => state.discovery.status === 'running');
  const isLive = useConnectionStore((state) => state.status === 'open');

  const scanState = portScanState({
    data: entry.data,
    isStarting: entry.isStarting,
    activeDeviceId: active?.deviceId ?? null,
    deviceId,
  });

  useEffect(() => {
    loadPorts(deviceId);
  }, [deviceId, loadPorts]);

  useEffect(() => {
    if (scanState !== 'scanning' || isLive) return undefined;
    const timer = setInterval(() => loadPorts(deviceId), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [scanState, isLive, deviceId, loadPorts]);

  const start = useCallback(async () => {
    try {
      await startScan(deviceId);
    } catch (error) {
      toast.error('Could not start the port scan', { description: error.message });
    }
  }, [deviceId, startScan]);

  let blockedReason = null;
  if (scanState !== 'scanning') {
    if (isDiscovering) blockedReason = 'A network discovery is running.';
    else if (active) blockedReason = 'Another device is being scanned.';
  }

  return {
    ...entry,
    scanState,
    blockedReason,
    reload: () => loadPorts(deviceId),
    start,
  };
}
