import { XMLParser } from 'fast-xml-parser';
import { isIPv4 } from '../ip.js';
import { isDeviceMac, normalizeMac } from '../mac.js';

/**
 * @typedef {object} NmapHost
 * @property {string} ipAddress
 * @property {string | null} macAddress Only reported when nmap runs with raw-socket privileges.
 * @property {string | null} vendor nmap's own MAC vendor guess, when a MAC is present.
 * @property {number | null} latencyMs
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  processEntities: true,
  isArray: (name) => ['host', 'address'].includes(name),
});

/**
 * Parses `nmap -sn -oX -` output and returns the hosts reported "up".
 * Example host element:
 *   <host><status state="up" reason="syn-ack"/>
 *     <address addr="192.168.1.1" addrtype="ipv4"/>
 *     <address addr="A4:83:E7:12:34:56" addrtype="mac" vendor="Apple"/>
 *     <times srtt="1843" rttvar="5000" to="100000"/></host>
 *
 * @param {string} xml
 * @returns {NmapHost[]}
 */
export function parseNmapHostDiscovery(xml) {
  const document = parser.parse(xml);
  const hosts = document?.nmaprun?.host ?? [];

  return hosts.flatMap((host) => {
    if (host?.status?.state !== 'up') return [];
    const addresses = host.address ?? [];
    const ipAddress = addresses.find((address) => address.addrtype === 'ipv4')?.addr;
    if (!isIPv4(ipAddress)) return [];

    const macEntry = addresses.find((address) => address.addrtype === 'mac');
    const macAddress = normalizeMac(macEntry?.addr);
    const srttMicros = Number(host.times?.srtt);

    return [
      {
        ipAddress,
        macAddress: isDeviceMac(macAddress) ? macAddress : null,
        vendor: macEntry?.vendor ? String(macEntry.vendor) : null,
        latencyMs: Number.isFinite(srttMicros) ? Math.round(srttMicros / 10) / 100 : null,
      },
    ];
  });
}
