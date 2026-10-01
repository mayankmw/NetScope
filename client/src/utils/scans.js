import { deviceTitle } from './deviceFilters';
import { isUuid } from './ids';

/** Path of a scan's details page. */
export function scanDetailsPath(scanId) {
  return `/scans/${encodeURIComponent(scanId)}`;
}

export const SCAN_TYPE_OPTIONS = [
  { value: 'discovery', label: 'Network scans' },
  { value: 'port', label: 'Port scans' },
];

export const SCAN_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

export const SCAN_STATUS_LABELS = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** Still going: no results yet. */
export function isActiveScan(scan) {
  return scan.status === 'queued' || scan.status === 'running';
}

export const DEFAULT_SCAN_FILTERS = Object.freeze({
  type: 'discovery',
  status: 'all',
  deviceId: null,
});

/**
 * Scan history filters from the URL: ?type=port&status=failed&device=<id>. Anything unknown
 * falls back to the default; `device` only applies to port scans.
 * @param {URLSearchParams} params
 */
export function parseScanFilters(params) {
  const type = params.get('type') === 'port' ? 'port' : 'discovery';
  const status = SCAN_STATUS_OPTIONS.some((option) => option.value === params.get('status'))
    ? params.get('status')
    : 'all';
  const device = params.get('device');
  return { type, status, deviceId: type === 'port' && isUuid(device) ? device : null };
}

/** The URL for a set of filters (defaults are left out). */
export function toScanSearchParams({ type, status, deviceId }) {
  const params = new URLSearchParams();
  if (type !== DEFAULT_SCAN_FILTERS.type) params.set('type', type);
  if (status !== DEFAULT_SCAN_FILTERS.status) params.set('status', status);
  if (type === 'port' && deviceId) params.set('device', deviceId);
  return params;
}

/** Identifies one filtered list (the same filters give the same key). */
export function scanFiltersKey(filters) {
  return toScanSearchParams(filters).toString() || 'all';
}

/** The API query for a set of filters. */
export function toScanQuery({ type, status, deviceId }) {
  return {
    type,
    status: status === 'all' ? undefined : status,
    deviceId: deviceId ?? undefined,
  };
}

/**
 * Puts a freshly loaded first page on top of the pages already loaded. Scans change after they
 * are listed (running → completed), so the fresh copies replace the loaded ones. When the page
 * does not reach the loaded scans, more scans ran than one page holds: the older pages are
 * dropped rather than shown with a gap.
 *
 * @param {{ items: Array<{ id: string }>, nextCursor: string | null }} current
 * @param {{ items: Array<{ id: string }>, nextCursor: string | null }} page
 */
export function mergeFirstPage(current, page) {
  const fresh = new Set(page.items.map((item) => item.id));
  if (!current.items.some((item) => fresh.has(item.id))) {
    return { items: page.items, nextCursor: page.nextCursor };
  }
  return {
    items: [...page.items, ...current.items.filter((item) => !fresh.has(item.id))],
    nextCursor: current.nextCursor,
  };
}

/** "Network scan", or "Port scan of raspberrypi.lan". */
export function scanTitle(scan) {
  if (scan.type !== 'port') return 'Network scan';
  return `Port scan of ${scan.device ? deviceTitle(scan.device) : scan.target}`;
}

/**
 * The completed discoveries of a newest-first list that have counts, oldest first: the points of
 * the trend chart.
 * @param {import('@/types/api').Scan[]} scans
 * @param {number} [count]
 */
export function trendScans(scans, count = 30) {
  return scans
    .filter((scan) => scan.type === 'discovery' && scan.status === 'completed' && scan.summary)
    .slice(0, count)
    .reverse();
}
