/**
 * A device's presence over a period, as consecutive online / offline periods, built from its
 * status events (device_events: discovered, online, offline). Pure: no I/O.
 *
 * Status is only known at discovery scans. A period runs from the scan that observed the change
 * to the scan that observed the next one: between scans, the last known status is assumed.
 */

const statusOf = (type) => (type === 'offline' ? 'offline' : 'online');

const byTime = (a, b) =>
  new Date(a.occurred_at) - new Date(b.occurred_at) || Number(a.id) - Number(b.id);

/**
 * @typedef {object} PresencePeriod
 * @property {'online' | 'offline'} status
 * @property {Date} from
 * @property {Date | null} to null: still ongoing
 * @property {string | null} scanId the scan that observed the change; null when the period began
 *   before the requested range (it is cut at `from`)
 */

/**
 * @param {object} input
 * @param {Array<{ id: string | number, type: string, occurred_at: Date | string,
 *                 scan_id: string | null }>} input.events status events from `from` on, plus
 *   the last one before it (any order)
 * @param {Date} input.from start of the range
 * @param {Date} input.to end of the range (now)
 * @param {Date} input.firstSeenAt when the device was first seen
 * @param {'online' | 'offline'} input.currentStatus used only when the device has no status
 *   events at all (data recorded before device timelines existed)
 * @returns {PresencePeriod[]} oldest first; the last one is ongoing
 */
export function buildPresencePeriods({ events, from, to, firstSeenAt, currentStatus }) {
  const periods = [];

  for (const event of [...events].sort(byTime)) {
    const occurredAt = new Date(event.occurred_at);
    if (occurredAt > to) break;
    const before = occurredAt < from;
    const start = before ? from : occurredAt;
    const status = statusOf(event.type);

    // A change at the very instant the previous period began replaces it.
    if (periods.at(-1)?.from.getTime() === start.getTime()) {
      periods.pop();
      if (periods.length > 0) periods.at(-1).to = null;
    }
    const last = periods.at(-1);
    if (last?.status === status) continue;
    if (last) last.to = start;
    periods.push({ status, from: start, to: null, scanId: before ? null : event.scan_id });
  }

  if (periods.length === 0 && firstSeenAt <= to) {
    const start = firstSeenAt > from ? firstSeenAt : from;
    periods.push({ status: currentStatus, from: start, to: null, scanId: null });
  }
  return periods;
}
