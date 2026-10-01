import { apiClient } from './apiClient';

/**
 * One page of the scan history, newest first. Pass the previous page's `nextCursor` as `before`
 * to get the next one.
 * @param {{ type?: 'discovery' | 'port', status?: string, deviceId?: string, limit?: number,
 *           before?: string | null, signal?: AbortSignal }} [options]
 * @returns {Promise<import('@/types/api').Page<import('@/types/api').Scan>>}
 */
export function listScans({ type, status, deviceId, limit, before, signal } = {}) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  if (deviceId) params.set('deviceId', deviceId);
  if (limit) params.set('limit', String(limit));
  if (before) params.set('before', before);
  const query = params.toString();
  return apiClient
    .get(`/scans${query ? `?${query}` : ''}`, { signal, includeMeta: true })
    .then(({ data, meta }) => ({ items: data, nextCursor: meta.nextCursor ?? null }));
}

/**
 * One scan with its results (once completed) and its neighbours in the history.
 * @param {string} scanId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<import('@/types/api').ScanDetails>}
 */
export function getScan(scanId, { signal } = {}) {
  return apiClient.get(`/scans/${encodeURIComponent(scanId)}`, { signal });
}
