/** Numeric value of a dotted IPv4 address, for correct sorting ("10.0.0.9" < "10.0.0.10"). */
export function ipToNumber(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return Number.NaN;
  return parts.reduce((acc, part) => acc * 256 + Number(part), 0);
}

/** @param {string} a @param {string} b */
export function compareIp(a, b) {
  return ipToNumber(a) - ipToNumber(b);
}
