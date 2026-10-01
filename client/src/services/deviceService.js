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

/**
 * One device with its network, presence, IP history, and (for this machine) its interface.
 * @param {string} deviceId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<import('@/types/api').DeviceDetails>}
 */
export function getDevice(deviceId, { signal } = {}) {
  return apiClient.get(`/devices/${encodeURIComponent(deviceId)}`, { signal });
}

function historyPage(deviceId, resource, { limit, before, signal }) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (before) params.set('before', before);
  const query = params.toString();
  return apiClient
    .get(`/devices/${encodeURIComponent(deviceId)}/${resource}${query ? `?${query}` : ''}`, {
      signal,
      includeMeta: true,
    })
    .then(({ data, meta }) => ({ items: data, nextCursor: meta.nextCursor ?? null }));
}

/**
 * One page of a device's timeline (newest first). Pass the previous page's `nextCursor` as
 * `before` to get the next one.
 * @param {string} deviceId
 * @param {{ limit?: number, before?: string | null, signal?: AbortSignal }} [options]
 * @returns {Promise<import('@/types/api').Page<import('@/types/api').DeviceEvent>>}
 */
export function listDeviceEvents(deviceId, options = {}) {
  return historyPage(deviceId, 'events', options);
}

/**
 * One page of a device's discovery history: the scans that saw it, newest first.
 * @param {string} deviceId
 * @param {{ limit?: number, before?: string | null, signal?: AbortSignal }} [options]
 * @returns {Promise<import('@/types/api').Page<import('@/types/api').Observation>>}
 */
export function listDeviceObservations(deviceId, options = {}) {
  return historyPage(deviceId, 'observations', options);
}
