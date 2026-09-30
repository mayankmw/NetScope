import { isIPv4 } from '../ip.js';
import { isDeviceMac, normalizeMac } from '../mac.js';

/**
 * @typedef {object} ArpEntry
 * @property {string} ipAddress
 * @property {string} macAddress normalized
 * @property {string} interfaceName
 */

/**
 * Parses macOS `arp -an` output. Example lines:
 *   ? (192.168.1.1) at a4:83:e7:12:34:56 on en0 ifscope [ethernet]
 *   ? (192.168.1.9) at 0:1c:42:0:0:8 on en0 ifscope permanent [ethernet]
 *   ? (192.168.1.5) at (incomplete) on en0 ifscope [ethernet]
 * Incomplete, multicast, and broadcast entries are dropped.
 *
 * @param {string} output
 * @returns {ArpEntry[]}
 */
export function parseDarwinArp(output) {
  const entries = [];
  for (const line of output.split('\n')) {
    const match = /^\S+ \(([\d.]+)\) at (\S+) on (\S+)/.exec(line.trim());
    if (!match || !isIPv4(match[1])) continue;
    const macAddress = normalizeMac(match[2]);
    if (!isDeviceMac(macAddress)) continue;
    entries.push({ ipAddress: match[1], macAddress, interfaceName: match[3] });
  }
  return entries;
}

const ATF_COMPLETE = 0x2;

/**
 * Parses Linux /proc/net/arp. Example:
 *   IP address       HW type     Flags       HW address            Mask     Device
 *   192.168.1.1      0x1         0x2         a4:83:e7:12:34:56     *        eth0
 * Only complete entries (flag 0x2) are kept.
 *
 * @param {string} content
 * @returns {ArpEntry[]}
 */
export function parseLinuxProcArp(content) {
  const entries = [];
  for (const line of content.split('\n').slice(1)) {
    const [ipAddress, , flags, hwAddress, , interfaceName] = line.trim().split(/\s+/);
    if (!isIPv4(ipAddress) || !interfaceName) continue;
    if ((Number.parseInt(flags, 16) & ATF_COMPLETE) === 0) continue;
    const macAddress = normalizeMac(hwAddress);
    if (!isDeviceMac(macAddress)) continue;
    entries.push({ ipAddress, macAddress, interfaceName });
  }
  return entries;
}
