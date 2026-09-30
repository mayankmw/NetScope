/**
 * IPv4 and CIDR helpers. Pure functions on 32-bit unsigned integers; no I/O.
 */

const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** @param {unknown} value */
export function isIPv4(value) {
  return typeof value === 'string' && IPV4_PATTERN.test(value);
}

/** @param {string} ip dotted quad */
export function ipToInt(ip) {
  if (!isIPv4(ip)) throw new TypeError(`Not an IPv4 address: ${ip}`);
  return ip.split('.').reduce((acc, octet) => ((acc << 8) | Number(octet)) >>> 0, 0);
}

/** @param {number} value 32-bit unsigned integer */
export function intToIp(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

/** @param {number} prefix 0–32 */
export function prefixToMask(prefix) {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/**
 * Parses "a.b.c.d/nn" and normalizes it to the network address.
 * @param {string} cidr
 * @returns {{ network: number, prefix: number, cidr: string }}
 */
export function parseCidr(cidr) {
  const match = /^([\d.]+)\/(\d{1,2})$/.exec(String(cidr));
  if (!match || !isIPv4(match[1]) || Number(match[2]) > 32) {
    throw new TypeError(`Not an IPv4 CIDR: ${cidr}`);
  }
  const prefix = Number(match[2]);
  const network = (ipToInt(match[1]) & prefixToMask(prefix)) >>> 0;
  return { network, prefix, cidr: `${intToIp(network)}/${prefix}` };
}

/** Network CIDR containing `ip` for the given prefix, e.g. ("192.168.1.37", 24) → "192.168.1.0/24". */
export function cidrFor(ip, prefix) {
  return parseCidr(`${ip}/${prefix}`).cidr;
}

/** @param {string} ip @param {string} cidr */
export function isInCidr(ip, cidr) {
  const { network, prefix } = parseCidr(cidr);
  return (ipToInt(ip) & prefixToMask(prefix)) >>> 0 === network;
}

/** Number of usable host addresses (excludes network and broadcast for prefixes ≤ 30). */
export function hostCount(cidr) {
  const { prefix } = parseCidr(cidr);
  if (prefix >= 31) return 2 ** (32 - prefix);
  return 2 ** (32 - prefix) - 2;
}

/**
 * Usable host addresses in a range, in order. Callers must cap the range size first
 * (see guards.js); this function refuses anything larger than a /16.
 * @param {string} cidr
 * @returns {string[]}
 */
export function hostsInCidr(cidr) {
  const { network, prefix } = parseCidr(cidr);
  if (prefix < 16) throw new RangeError(`Refusing to enumerate ${cidr}`);
  const size = 2 ** (32 - prefix);
  const [first, last] = prefix >= 31 ? [0, size - 1] : [1, size - 2];
  const hosts = [];
  for (let offset = first; offset <= last; offset += 1) hosts.push(intToIp(network + offset));
  return hosts;
}

/** Numeric comparator for sorting IPv4 strings. */
export function compareIPv4(a, b) {
  return ipToInt(a) - ipToInt(b);
}

const PRIVATE_RANGES = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

/** RFC 1918 private address space: the only space NetScope will ever probe. */
export function isPrivateIPv4(ip) {
  return isIPv4(ip) && PRIVATE_RANGES.some((range) => isInCidr(ip, range));
}
