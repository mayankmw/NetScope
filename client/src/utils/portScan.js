/**
 * Pure helpers for the port scan UI.
 */

const RUNNING = new Set(['queued', 'running']);

/**
 * The state the ports panel shows for a device:
 * - "scanning"  a scan of this device is starting or running
 * - "ready"     it has never been scanned
 * - "completed" its latest scan succeeded
 * - "failed"    its latest scan failed or was cancelled (earlier results may still exist)
 *
 * @param {{ data: import('@/types/api').DevicePorts | null, isStarting: boolean,
 *           activeDeviceId: string | null, deviceId: string }} input
 * @returns {'ready' | 'scanning' | 'completed' | 'failed'}
 */
export function portScanState({ data, isStarting, activeDeviceId, deviceId }) {
  if (isStarting || activeDeviceId === deviceId || RUNNING.has(data?.scan?.status)) {
    return 'scanning';
  }
  if (!data?.scan) return 'ready';
  return data.scan.status === 'completed' ? 'completed' : 'failed';
}

/** "OpenSSH 9.2p1", "nginx", or null. */
export function serviceDescription(port) {
  return [port.product, port.version].filter(Boolean).join(' ') || null;
}
