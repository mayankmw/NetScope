import os from 'node:os';
import { isDeviceMac, normalizeMac } from './mac.js';

/**
 * @typedef {object} LocalInterface
 * @property {string} name e.g. "en0"
 * @property {string} macAddress
 * @property {Array<{ family: 'IPv4' | 'IPv6', address: string, cidr: string | null }>} addresses
 */

/**
 * This machine's network interface with the given MAC, if any: how NetScope recognizes its own
 * host among discovered devices and shows that host's interface details. Reads the OS interface
 * list only; runs no commands.
 *
 * @param {string} macAddress normalized MAC
 * @param {() => ReturnType<typeof os.networkInterfaces>} [listInterfaces] for tests
 * @returns {LocalInterface | null}
 */
export function findLocalInterface(macAddress, listInterfaces = os.networkInterfaces) {
  for (const [name, addresses] of Object.entries(listInterfaces())) {
    const matching = (addresses ?? []).filter(
      (address) => !address.internal && normalizeMac(address.mac) === macAddress,
    );
    if (matching.length === 0) continue;
    return {
      name,
      macAddress,
      addresses: matching.map((address) => ({
        family: address.family,
        address: address.address,
        cidr: address.cidr ?? null,
      })),
    };
  }
  return null;
}

/**
 * MAC addresses of this machine's network interfaces, to recognize it among discovered devices.
 * Reads the OS interface list only; runs no commands.
 *
 * @param {() => ReturnType<typeof os.networkInterfaces>} [listInterfaces] for tests
 * @returns {Set<string>} normalized MACs
 */
export function listLocalMacAddresses(listInterfaces = os.networkInterfaces) {
  const macs = new Set();
  for (const addresses of Object.values(listInterfaces())) {
    for (const address of addresses ?? []) {
      const mac = normalizeMac(address.mac);
      if (!address.internal && isDeviceMac(mac)) macs.add(mac);
    }
  }
  return macs;
}
