/**
 * The manufacturer prefix (OUI) of a MAC address: its first three bytes, e.g. "b8:27:eb".
 * @param {string} mac lowercase, colon-separated
 */
export function ouiPrefix(mac) {
  return mac.slice(0, 8);
}
