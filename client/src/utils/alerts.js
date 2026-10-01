import { isUuid } from './ids';

/**
 * Alerts (GET /api/alerts) prepared for display, and the Alerts page filters. Pure.
 */

export const ALERT_TYPE_LABELS = {
  new_device: 'New device',
  device_returned: 'Back online',
  ip_changed: 'IP address changed',
};

export const ALERT_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'unread', label: 'Unread' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

export const ALERT_TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'new_device', label: 'New devices' },
  { value: 'device_returned', label: 'Back online' },
  { value: 'ip_changed', label: 'IP changes' },
];

export const DEFAULT_ALERT_FILTERS = Object.freeze({ status: 'open', type: 'all', deviceId: null });

const isOption = (options, value) => options.some((option) => option.value === value);

/**
 * Alerts page filters from the URL: ?status=unread&type=new_device&device=<id>.
 * @param {URLSearchParams} params
 */
export function parseAlertFilters(params) {
  const status = params.get('status');
  const type = params.get('type');
  const device = params.get('device');
  return {
    status: isOption(ALERT_STATUS_OPTIONS, status) ? status : DEFAULT_ALERT_FILTERS.status,
    type: isOption(ALERT_TYPE_OPTIONS, type) ? type : DEFAULT_ALERT_FILTERS.type,
    deviceId: isUuid(device) ? device : null,
  };
}

/** The URL for a set of filters (defaults are left out). */
export function toAlertSearchParams({ status, type, deviceId }) {
  const params = new URLSearchParams();
  if (status !== DEFAULT_ALERT_FILTERS.status) params.set('status', status);
  if (type !== DEFAULT_ALERT_FILTERS.type) params.set('type', type);
  if (deviceId) params.set('device', deviceId);
  return params;
}

/** Identifies one filtered list. */
export function alertFiltersKey(filters) {
  return toAlertSearchParams(filters).toString() || 'open';
}

/** The API query for a set of filters. */
export function toAlertQuery({ status, type, deviceId }) {
  return {
    status: status === 'all' ? undefined : status,
    type: type === 'all' ? undefined : type,
    deviceId: deviceId ?? undefined,
  };
}

/** Whether an alert belongs in a list with these filters. */
export function matchesAlertFilters(alert, { status, type, deviceId }) {
  if (status === 'open' && alert.status === 'resolved') return false;
  if (status !== 'open' && status !== 'all' && alert.status !== status) return false;
  if (type !== 'all' && alert.type !== type) return false;
  if (deviceId && alert.device?.id !== deviceId) return false;
  return true;
}

/** Open = not resolved. */
export function openCount(counts) {
  return counts.unread + counts.read;
}

/**
 * The state an alert moves to, as the server will record it (for an optimistic update).
 * @param {import('@/types/api').Alert} alert
 * @param {'unread' | 'read' | 'resolved'} status
 * @param {string} [at] ISO time
 */
export function withStatus(alert, status, at = new Date().toISOString()) {
  return {
    ...alert,
    status,
    readAt: status === 'unread' ? null : (alert.readAt ?? at),
    resolvedAt: status === 'resolved' ? (alert.resolvedAt ?? at) : null,
  };
}

/**
 * One line for a burst of new alerts: "2 new devices · 1 back online".
 * @param {Array<{ type: string }>} alerts
 */
export function summarizeAlerts(alerts) {
  const counts = Map.groupBy(alerts, (alert) => alert.type);
  const parts = [
    ['new_device', 'new device', 'new devices'],
    ['device_returned', 'back online', 'back online'],
    ['ip_changed', 'IP change', 'IP changes'],
  ]
    .filter(([type]) => counts.has(type))
    .map(([type, one, many]) => {
      const count = counts.get(type).length;
      return `${count} ${count === 1 ? one : many}`;
    });
  return parts.join(' · ');
}
