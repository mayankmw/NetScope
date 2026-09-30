import { compareIPv4, hostsInCidr, isInCidr } from '../ip.js';
import { isRandomizedMac } from '../mac.js';
import { classifyDevice } from './classifyDevice.js';

/**
 * @typedef {object} MergedHost
 * @property {string} ipAddress
 * @property {string} macAddress
 * @property {number | null} latencyMs
 * @property {string[]} sources which probes saw it: arp, local, nmap, ping
 * @property {string | null} nmapVendor
 * @property {boolean} isGateway
 * @property {boolean} isSelf
 */

/**
 * @typedef {object} DiscoveredDevice
 * @property {string} ipAddress
 * @property {string} macAddress
 * @property {boolean} macIsRandom
 * @property {string | null} hostname
 * @property {string | null} vendor
 * @property {string} deviceType
 * @property {'online'} status
 * @property {number | null} latencyMs
 * @property {string[]} sources
 * @property {boolean} isGateway
 * @property {boolean} isSelf
 */

/**
 * Merges what each probe saw into one record per device.
 *
 * - Everything is keyed by IP first; the ARP cache (or nmap, when privileged) supplies the MAC.
 * - This machine never appears in its own ARP cache, so it is added from the interface.
 * - Identity is the MAC: if one MAC answers on several IPs (multi-homed host, proxy ARP),
 *   one device is kept, preferring the IP that actually answered a probe, then the lowest IP.
 * - Hosts that answered but whose MAC could not be resolved cannot be identified reliably; they
 *   are returned as `unresolvedHosts` and not stored.
 *
 * @param {object} input
 * @param {import('../networkDetection.js').DetectedNetwork} input.network
 * @param {import('../parsers/arp.parser.js').ArpEntry[]} input.arpEntries
 * @param {Array<{ ipAddress: string, latencyMs: number | null }>} input.pingResponders
 * @param {import('../parsers/nmap.parser.js').NmapHost[]} input.nmapHosts
 * @returns {{ hosts: MergedHost[], unresolvedHosts: string[], duplicateMacs: Array<{ macAddress: string, ipAddresses: string[] }> }}
 */
export function mergeObservations({ network, arpEntries, pingResponders, nmapHosts }) {
  const hostAddresses = new Set(hostsInCidr(network.sweepCidr));
  const inRange = (ip) => hostAddresses.has(ip) && isInCidr(ip, network.cidr);
  const byIp = new Map();

  const entryFor = (ipAddress) => {
    if (!byIp.has(ipAddress)) {
      byIp.set(ipAddress, {
        ipAddress,
        macAddress: null,
        latencyMs: null,
        sources: new Set(),
        nmapVendor: null,
      });
    }
    return byIp.get(ipAddress);
  };

  for (const { ipAddress, latencyMs } of pingResponders) {
    if (!inRange(ipAddress)) continue;
    const entry = entryFor(ipAddress);
    entry.sources.add('ping');
    entry.latencyMs = latencyMs;
  }

  for (const host of nmapHosts) {
    if (!inRange(host.ipAddress)) continue;
    const entry = entryFor(host.ipAddress);
    entry.sources.add('nmap');
    entry.latencyMs ??= host.latencyMs;
    entry.macAddress ??= host.macAddress;
    entry.nmapVendor = host.vendor;
  }

  for (const { ipAddress, macAddress, interfaceName } of arpEntries) {
    if (interfaceName !== network.interfaceName || !inRange(ipAddress)) continue;
    const entry = entryFor(ipAddress);
    entry.sources.add('arp');
    entry.macAddress = macAddress;
  }

  if (network.localMac) {
    const self = entryFor(network.localIp);
    self.sources.add('local');
    self.macAddress = network.localMac;
  }

  const unresolvedHosts = [];
  const byMac = new Map();
  for (const entry of [...byIp.values()].sort((a, b) => compareIPv4(a.ipAddress, b.ipAddress))) {
    if (!entry.macAddress) {
      unresolvedHosts.push(entry.ipAddress);
      continue;
    }
    const group = byMac.get(entry.macAddress) ?? [];
    group.push(entry);
    byMac.set(entry.macAddress, group);
  }

  const answered = (entry) => entry.sources.has('ping') || entry.sources.has('nmap');
  const duplicateMacs = [];
  const hosts = [];

  for (const [macAddress, group] of byMac) {
    // Already sorted by IP, so find() picks the lowest answering IP.
    const primary = group.find(answered) ?? group[0];
    if (group.length > 1) {
      duplicateMacs.push({ macAddress, ipAddresses: group.map((entry) => entry.ipAddress) });
    }
    hosts.push({
      ipAddress: primary.ipAddress,
      macAddress,
      latencyMs: primary.latencyMs,
      sources: [...new Set(group.flatMap((entry) => [...entry.sources]))].sort(),
      nmapVendor: group.find((entry) => entry.nmapVendor)?.nmapVendor ?? null,
      isGateway: macAddress === network.gatewayMac || primary.ipAddress === network.gatewayIp,
      isSelf: primary.ipAddress === network.localIp,
    });
  }

  hosts.sort((a, b) => compareIPv4(a.ipAddress, b.ipAddress));
  return { hosts, unresolvedHosts, duplicateMacs };
}

/**
 * Final, common Device shape: adds vendor, hostname, and a device type guess.
 *
 * @param {MergedHost} host
 * @param {{ hostname: string | null, vendor: string | null }} enrichment
 * @returns {DiscoveredDevice}
 */
export function toDiscoveredDevice(host, { hostname, vendor }) {
  const resolvedVendor = vendor ?? host.nmapVendor ?? null;
  return {
    ipAddress: host.ipAddress,
    macAddress: host.macAddress,
    macIsRandom: isRandomizedMac(host.macAddress),
    hostname,
    vendor: resolvedVendor,
    deviceType: classifyDevice({
      isGateway: host.isGateway,
      isSelf: host.isSelf,
      hostname,
      vendor: resolvedVendor,
    }),
    status: 'online',
    latencyMs: host.latencyMs,
    sources: host.sources,
    isGateway: host.isGateway,
    isSelf: host.isSelf,
  };
}
