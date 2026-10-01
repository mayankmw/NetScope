import { apiClient } from './apiClient';

/**
 * One page of alerts, newest first. Pass the previous page's `nextCursor` as `before`.
 * @param {{ status?: 'open' | 'unread' | 'read' | 'resolved', type?: string, deviceId?: string,
 *           limit?: number, before?: string | null, signal?: AbortSignal }} [options]
 * @returns {Promise<import('@/types/api').Page<import('@/types/api').Alert>>}
 */
export function listAlerts({ status, type, deviceId, limit, before, signal } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  if (deviceId) params.set('deviceId', deviceId);
  if (limit) params.set('limit', String(limit));
  if (before) params.set('before', before);
  const query = params.toString();
  return apiClient
    .get(`/alerts${query ? `?${query}` : ''}`, { signal, includeMeta: true })
    .then(({ data, meta }) => ({ items: data, nextCursor: meta.nextCursor ?? null }));
}

/**
 * Alert counts by state, and the settings of the alert rules.
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<import('@/types/api').AlertSummary>}
 */
export function getAlertSummary({ signal } = {}) {
  return apiClient.get('/alerts/summary', { signal });
}

/**
 * Marks one alert unread, read, or resolved.
 * @param {string} alertId
 * @param {'unread' | 'read' | 'resolved'} status
 * @returns {Promise<import('@/types/api').Alert>}
 */
export function updateAlertStatus(alertId, status) {
  return apiClient.patch(`/alerts/${encodeURIComponent(alertId)}`, { status });
}

/** @returns {Promise<{ updated: number, counts: import('@/types/api').AlertCounts }>} */
export function markAllAlertsRead() {
  return apiClient.post('/alerts/read-all', {});
}

/** @returns {Promise<{ updated: number, counts: import('@/types/api').AlertCounts }>} */
export function resolveAllAlerts() {
  return apiClient.post('/alerts/resolve-all', {});
}
