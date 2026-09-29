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
