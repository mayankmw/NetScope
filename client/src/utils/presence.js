/**
 * Presence history (GET /api/devices/:id/history) prepared for display.
 */

/**
 * The presence bar: the range split into segments, each with its share of the range (`offset`
 * and `width`, 0–1). Before the device was first seen the status is `unknown`.
 *
 * @param {import('@/types/api').DeviceHistory} history
 * @returns {Array<{ status: 'online' | 'offline' | 'unknown', from: number, to: number,
 *                   offset: number, width: number, ongoing: boolean }>}
 */
export function presenceSegments(history) {
  const from = Date.parse(history.range.from);
  const to = Date.parse(history.range.to);
  const span = to - from;
  if (span <= 0) return [];

  const segments = [];
  const firstSeen = Date.parse(history.firstSeenAt);
  if (firstSeen > from) segments.push({ status: 'unknown', from, to: Math.min(firstSeen, to) });
  for (const period of history.periods) {
    const start = Math.max(from, Date.parse(period.from));
    const end = period.to ? Math.min(to, Date.parse(period.to)) : to;
    if (end > start) {
      segments.push({ status: period.status, from: start, to: end, ongoing: !period.to });
    }
  }
  return segments.map((segment) => ({
    ongoing: false,
    ...segment,
    offset: (segment.from - from) / span,
    width: (segment.to - segment.from) / span,
  }));
}

/**
 * Headline numbers: how many scans saw the device, how often it went offline, and how long it
 * was offline at most, within the range.
 * @param {import('@/types/api').DeviceHistory} history
 */
export function presenceStats(history) {
  const to = Date.parse(history.range.to);
  // Changes observed by a scan in the range (a period cut at the range start is not a change).
  const offline = history.periods.filter((period) => period.status === 'offline');
  const durationOf = (period) => (period.to ? Date.parse(period.to) : to) - Date.parse(period.from);
  return {
    scans: history.scans.total,
    seen: history.scans.seen,
    wentOffline: offline.filter((period) => period.scanId).length,
    longestOfflineMs: offline.length > 0 ? Math.max(...offline.map(durationOf)) : 0,
  };
}
