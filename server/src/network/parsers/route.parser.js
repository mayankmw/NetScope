import { isIPv4 } from '../ip.js';

/**
 * @typedef {object} DefaultRoute
 * @property {string} gatewayIp
 * @property {string} interfaceName
 */

/**
 * Parses macOS `route -n get default` output:
 *      route to: default
 *   destination: default
 *       gateway: 192.168.1.1
 *     interface: en0
 * Returns null when there is no default route or the gateway is not an IPv4 address
 * (e.g. a point-to-point VPN link).
 *
 * @param {string} output
 * @returns {DefaultRoute | null}
 */
export function parseDarwinDefaultRoute(output) {
  const gatewayIp = /^\s*gateway:\s*(\S+)/m.exec(output)?.[1];
  const interfaceName = /^\s*interface:\s*(\S+)/m.exec(output)?.[1];
  if (!isIPv4(gatewayIp) || !interfaceName) return null;
  return { gatewayIp, interfaceName };
}

const RTF_GATEWAY = 0x2;

/** /proc/net/route stores addresses as little-endian hex: "0101A8C0" → "192.168.1.1". */
function hexToIp(hex) {
  if (!/^[0-9A-Fa-f]{8}$/.test(hex ?? '')) return null;
  return hex
    .match(/../g)
    .map((byte) => Number.parseInt(byte, 16))
    .reverse()
    .join('.');
}

/**
 * Parses Linux /proc/net/route and returns the default route with the lowest metric,
 * optionally restricted to one interface:
 *   Iface  Destination  Gateway   Flags  RefCnt  Use  Metric  Mask      MTU  Window  IRTT
 *   eth0   00000000     0101A8C0  0003   0       0    100     00000000  0    0       0
 *
 * @param {string} content
 * @param {string} [interfaceName]
 * @returns {DefaultRoute | null}
 */
export function parseLinuxProcRoute(content, interfaceName) {
  let best = null;
  for (const line of content.split('\n').slice(1)) {
    const [iface, destination, gateway, flags, , , metric, mask] = line.trim().split(/\s+/);
    if (!iface || destination !== '00000000' || mask !== '00000000') continue;
    if ((Number.parseInt(flags, 16) & RTF_GATEWAY) === 0) continue;
    if (interfaceName && iface !== interfaceName) continue;
    const gatewayIp = hexToIp(gateway);
    if (!gatewayIp) continue;
    const candidate = { gatewayIp, interfaceName: iface, metric: Number(metric) || 0 };
    if (!best || candidate.metric < best.metric) best = candidate;
  }
  return best && { gatewayIp: best.gatewayIp, interfaceName: best.interfaceName };
}
