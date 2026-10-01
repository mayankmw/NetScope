import { NetworkError, NetworkErrorCodes } from './errors.js';
import { hostCount, intToIp, isInCidr, isIPv4, isPrivateIPv4, parseCidr } from './ip.js';

/**
 * Safety guards. Every IP or range handed to a network tool passes through one of these first.
 * There is deliberately no option to disable them.
 */

/** Largest range a single sweep may cover (a /22). */
export const MAX_SWEEP_HOSTS = 1022;

/** Most ports one port scan may check. */
export const MAX_SCAN_PORTS = 1000;

function notAllowed(message, details) {
  return new NetworkError(NetworkErrorCodes.TARGET_NOT_ALLOWED, message, { details });
}

/**
 * The subnet to sweep must be RFC 1918 private and no larger than MAX_SWEEP_HOSTS.
 * @param {string} cidr
 */
export function assertSweepableRange(cidr) {
  const { network, prefix, cidr: normalized } = parseCidr(cidr);
  const first = intToIp(network);
  const last = intToIp(network + 2 ** (32 - prefix) - 1);

  if (!isPrivateIPv4(first) || !isPrivateIPv4(last)) {
    throw notAllowed(`${normalized} is not a private (RFC 1918) network.`, { range: normalized });
  }
  if (hostCount(normalized) > MAX_SWEEP_HOSTS) {
    throw notAllowed(`${normalized} is larger than the maximum sweep size.`, { range: normalized });
  }
  return normalized;
}

/**
 * A single target must be a private IPv4 address inside the subnet being scanned.
 * @param {string} ip
 * @param {string} subnet CIDR of the local network
 */
export function assertLocalTarget(ip, subnet) {
  if (!isIPv4(ip) || !isPrivateIPv4(ip) || !isInCidr(ip, subnet)) {
    throw notAllowed(`${ip} is not an address on the local network ${subnet}.`, { ip, subnet });
  }
  return ip;
}

/**
 * A port list must be unique TCP/UDP port numbers (1–65535), at most MAX_SCAN_PORTS of them.
 * @param {number[]} ports
 */
export function assertPortList(ports) {
  const valid =
    Array.isArray(ports) &&
    ports.length > 0 &&
    ports.length <= MAX_SCAN_PORTS &&
    new Set(ports).size === ports.length &&
    ports.every((port) => Number.isInteger(port) && port >= 1 && port <= 65535);
  if (!valid) throw notAllowed('Invalid port list.', { portCount: ports?.length ?? 0 });
  return ports;
}
