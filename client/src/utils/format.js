/**
 * Formats a duration in seconds as its two most significant units, e.g. "3h 12m".
 * @param {number} totalSeconds
 */
export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const units = [
    ['d', Math.floor(seconds / 86_400)],
    ['h', Math.floor((seconds % 86_400) / 3_600)],
    ['m', Math.floor((seconds % 3_600) / 60)],
    ['s', seconds % 60],
  ];
  const firstNonZero = units.findIndex(([, value]) => value > 0);
  if (firstNonZero === -1) return '0s';
  return units
    .slice(firstNonZero, firstNonZero + 2)
    .map(([unit, value]) => `${value}${unit}`)
    .join(' ');
}

/**
 * Formats an ISO timestamp as a local time, e.g. "14:03:27".
 * @param {string | number | Date} value
 */
export function formatTime(value) {
  return new Date(value).toLocaleTimeString();
}

/**
 * Full local date and time, e.g. "30 Sep 2026, 19:04".
 * @param {string | number | Date} value
 */
export function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: 'auto',
  style: 'short',
});

const RELATIVE_STEPS = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
  ['year', Infinity],
];

/**
 * Human-friendly time relative to `now`, e.g. "just now", "5 min. ago", "yesterday".
 * @param {string | number | Date} value
 * @param {number} [now] epoch ms
 */
export function formatRelativeTime(value, now = Date.now()) {
  let delta = (new Date(value).getTime() - now) / 1000;
  if (Math.abs(delta) < 45) return 'just now';
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(delta) < size) return relativeFormatter.format(Math.round(delta), unit);
    delta /= size;
  }
  return relativeFormatter.format(Math.round(delta), 'year');
}

/**
 * A ping round-trip time, e.g. "3.2 ms", "48 ms", "<1 ms".
 * @param {number} ms
 */
export function formatLatency(ms) {
  if (ms < 1) return '<1 ms';
  return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
}

/**
 * A share as a whole percentage, e.g. "92%". Never shows 100% unless it is exactly 100%.
 * @param {number} part
 * @param {number} whole
 */
export function formatPercent(part, whole) {
  if (whole <= 0) return '—';
  const percent = (part / whole) * 100;
  return `${part < whole ? Math.min(99, Math.round(percent)) : Math.round(percent)}%`;
}

/**
 * How long something took, precise for short runs: "850 ms", "1.2 s", "48 s", "2m 5s".
 * @param {number} ms
 */
export function formatElapsed(ms) {
  if (ms < 1_000) return `${Math.max(0, Math.round(ms))} ms`;
  if (ms < 10_000) return `${(ms / 1_000).toFixed(1)} s`;
  if (ms < 60_000) return `${Math.round(ms / 1_000)} s`;
  return formatDuration(ms / 1_000);
}

/**
 * A configured interval in its largest whole unit: "24 hours", "7 days", "90 minutes".
 * @param {number} ms
 */
export function formatInterval(ms) {
  const units = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1_000],
  ];
  const [unit, size] = units.find(([, size]) => ms >= size && ms % size === 0) ?? units.at(-1);
  const count = Math.round(ms / size);
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
