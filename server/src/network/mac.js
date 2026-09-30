/**
 * MAC address helpers. Pure functions; no I/O.
 */

/**
 * Normalizes "A4-83-E7-1-2-3", "a4:83:e7:01:02:03", or macOS's unpadded "a4:83:e7:1:2:3" to
 * lowercase, zero-padded, colon-separated form. Returns null when the input is not a MAC.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeMac(value) {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split(/[:-]/);
  if (parts.length !== 6 || !parts.every((part) => /^[0-9a-fA-F]{1,2}$/.test(part))) return null;
  return parts.map((part) => part.toLowerCase().padStart(2, '0')).join(':');
}

function firstOctet(mac) {
  return Number.parseInt(mac.slice(0, 2), 16);
}

/** Group bit set: multicast or broadcast, never a real device. @param {string} mac normalized */
export function isMulticastMac(mac) {
  return (firstOctet(mac) & 1) === 1;
}

/** Locally administered bit set: randomized / private MAC. @param {string} mac normalized */
export function isRandomizedMac(mac) {
  return (firstOctet(mac) & 2) === 2;
}

/** True for a MAC that can identify a device: valid, unicast, and not all zeros. */
export function isDeviceMac(mac) {
  return mac !== null && mac !== '00:00:00:00:00:00' && !isMulticastMac(mac);
}
