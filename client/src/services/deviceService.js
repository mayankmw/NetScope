import { apiClient } from './apiClient';

// Discovery is synchronous and bounded server-side by SCAN_TIMEOUT_MS (60 s by default).
// The client waits a little longer so the server's own timeout error arrives first.
const DISCOVERY_TIMEOUT_MS = 90_000;

/**
 * Device inventory of the current (most recently seen) network.
 * @param {{ networkId?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<import('@/types/api').DeviceList>}
 */
export function listDevices({ networkId, signal } = {}) {
  const query = networkId ? `?networkId=${encodeURIComponent(networkId)}` : '';
  return apiClient.get(`/devices${query}`, { signal });
}

/**
 * Runs a discovery on the local network. Takes no parameters by design.
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<import('@/types/api').DiscoveryResult>}
 */
export function discoverDevices({ signal } = {}) {
  return apiClient.post('/devices/discover', undefined, {
    signal,
    timeoutMs: DISCOVERY_TIMEOUT_MS,
  });
}
