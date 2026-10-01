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
  isArray: (name) => ['host', 'address', 'port', 'extraports', 'extrareasons'].includes(name),
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

/**
 * @typedef {'open' | 'closed' | 'filtered'} PortState
 *
 * @typedef {object} ScannedPort
 * @property {number} port
 * @property {'tcp'} protocol
 * @property {PortState | null} state null when nmap's output does not say (very old versions)
 * @property {string | null} service e.g. "http", "ssl/http"; nmap's guess when not probed
 * @property {string | null} product e.g. "nginx"; only from version detection
 * @property {string | null} version e.g. "1.27.5"; only from version detection
 *
 * @typedef {object} PortScanResult
 * @property {boolean} timedOut nmap gave up on the host (--host-timeout) before finishing
 * @property {ScannedPort[]} ports every scanned port, in the order scanned
 * @property {{ open: number, closed: number, filtered: number }} counts
 */

const TEXT_LIMITS = { service: 100, product: 200, version: 200 };

/** nmap reports six states; NetScope stores three. Anything not clearly open or closed is "filtered". */
function toPortState(state) {
  if (state === 'open') return 'open';
  if (state === 'closed') return 'closed';
  return 'filtered';
}

/** Trimmed, length-limited printable text, or null. */
function cleanText(value, limit) {
  if (value === undefined || value === null) return null;
  // Control characters (from a device's service banner) become spaces.
  const text = Array.from(String(value), (char) => {
    const code = char.codePointAt(0);
    return code < 0x20 || code === 0x7f ? ' ' : char;
  })
    .join('')
    .trim();
  return text ? text.slice(0, limit) : null;
}

/** "21-23,25" → [21, 22, 23, 25]. Ignores anything malformed. */
export function expandPortRanges(list) {
  if (typeof list !== 'string') return [];
  return list.split(',').flatMap((part) => {
    const [start, end = start] = part.trim().split('-').map(Number);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end > 65535 ||
      end < start
    ) {
      return [];
    }
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
}

function toService(service) {
  if (!service) return { service: null, product: null, version: null };
  const name = cleanText(service.name, TEXT_LIMITS.service);
  return {
    service: name && service.tunnel === 'ssl' ? `ssl/${name}`.slice(0, TEXT_LIMITS.service) : name,
    product: cleanText(service.product, TEXT_LIMITS.product),
    version: cleanText(service.version, TEXT_LIMITS.version),
  };
}

/**
 * Parses `nmap -sT … -oX -` output for one host. nmap lists "interesting" ports individually and
 * summarizes the rest in <extraports>, whose <extrareasons ports="…"> names them (nmap ≥ 7.80);
 * with older versions a single summary group still tells their state.
 *
 * Example:
 *   <host><status state="up" reason="user-set"/>
 *     <ports><extraports state="closed" count="62">
 *              <extrareasons reason="conn-refused" count="62" proto="tcp" ports="21-23,25"/>
 *            </extraports>
 *       <port protocol="tcp" portid="80"><state state="open" reason="syn-ack"/>
 *         <service name="http" product="nginx" version="1.27.5" method="probed"/></port>
 *     </ports></host>
 *
 * @param {string} xml
 * @param {{ scannedPorts: number[] }} options the ports that were requested
 * @returns {PortScanResult}
 */
export function parseNmapPortScan(xml, { scannedPorts }) {
  const document = parser.parse(xml);
  const host = document?.nmaprun?.host?.[0];
  const byPort = new Map();

  for (const entry of host?.ports?.port ?? []) {
    const port = Number(entry.portid);
    if (entry.protocol !== 'tcp' || !Number.isInteger(port)) continue;
    byPort.set(port, { state: toPortState(entry.state?.state), ...toService(entry.service) });
  }

  const extraGroups = host?.ports?.extraports ?? [];
  for (const group of extraGroups) {
    for (const reasons of group.extrareasons ?? []) {
      for (const port of expandPortRanges(reasons.ports)) {
        if (!byPort.has(port))
          byPort.set(port, { state: toPortState(group.state), ...toService() });
      }
    }
  }
  // Older nmap: no port lists, but one summary group means every unlisted port shares its state.
  const fallbackState = extraGroups.length === 1 ? toPortState(extraGroups[0].state) : null;

  const ports = scannedPorts.map((port) => ({
    port,
    protocol: 'tcp',
    ...(byPort.get(port) ?? {
      state: host ? fallbackState : null,
      ...toService(),
    }),
  }));

  const counts = { open: 0, closed: 0, filtered: 0 };
  for (const { state } of ports) if (state) counts[state] += 1;

  return { timedOut: host?.timedout === 'true', ports, counts };
}
