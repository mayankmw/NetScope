import os from 'node:os';
import { NetworkError, NetworkErrorCodes } from './errors.js';
import { runCommand } from './exec/runCommand.js';
import { assertLocalTarget, assertSweepableRange, MAX_SWEEP_HOSTS } from './guards.js';
import { cidrFor, hostCount, isInCidr, isPrivateIPv4, parseCidr } from './ip.js';
import { isDeviceMac, normalizeMac } from './mac.js';

const GATEWAY_PING_TIMEOUT_MS = 1_000;

/**
 * @typedef {object} DetectedNetwork
 * @property {string} interfaceName   e.g. "en0"
 * @property {string} localIp         this machine's address on the LAN
 * @property {string | null} localMac this machine's MAC on that interface
 * @property {string} cidr            the interface's subnet, e.g. "192.168.1.0/24"
 * @property {string} sweepCidr       the range that will be probed (≤ MAX_SWEEP_HOSTS hosts)
 * @property {boolean} sweepClamped   true when the subnet was too large and was narrowed to a /24
 * @property {string} gatewayIp
 * @property {string} gatewayMac
 */

/** IPv4, non-loopback interfaces as { name, address, cidr, mac }. */
function listIPv4Interfaces() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((address) => address.family === 'IPv4' && !address.internal && address.cidr)
      .map((address) => ({
        name,
        address: address.address,
        cidr: parseCidr(address.cidr).cidr,
        mac: normalizeMac(address.mac),
      })),
  );
}

function unusable(code, message, details) {
  return new NetworkError(code, message, { details });
}

/**
 * Finds the gateway's MAC in the ARP cache. If it is not cached yet, one ping makes the OS
 * resolve it, and the cache is read again.
 */
async function resolveGatewayMac({ platform, gatewayIp, interfaceName, cidr, signal }) {
  const find = (entries) =>
    entries.find((entry) => entry.ipAddress === gatewayIp && entry.interfaceName === interfaceName)
      ?.macAddress;

  let mac = find(await platform.readArpTable({ signal }));
  if (!mac) {
    assertLocalTarget(gatewayIp, cidr);
    await runCommand('ping', platform.pingArgs(gatewayIp, GATEWAY_PING_TIMEOUT_MS), {
      timeoutMs: GATEWAY_PING_TIMEOUT_MS + 1_500,
      signal,
    });
    mac = find(await platform.readArpTable({ signal }));
  }
  if (!mac) {
    throw unusable(
      NetworkErrorCodes.GATEWAY_UNRESOLVED,
      `The gateway ${gatewayIp} did not answer, so the network cannot be identified.`,
      { gatewayIp },
    );
  }
  return mac;
}

/**
 * Works out which LAN to scan: the interface carrying the default route (or `interfaceName`
 * when configured), its subnet, and its gateway. Read-only apart from at most one ping to the
 * gateway.
 *
 * @param {{ platform: import('./platform/index.js').PlatformAdapter, interfaceName?: string, signal?: AbortSignal }} options
 * @returns {Promise<DetectedNetwork>}
 */
export async function detectNetwork({ platform, interfaceName, signal }) {
  const interfaces = listIPv4Interfaces();
  const route = await platform.getDefaultRoute({ interfaceName, signal });

  if (!route) {
    throw unusable(
      NetworkErrorCodes.NO_DEFAULT_GATEWAY,
      interfaceName
        ? `No default gateway found on interface ${interfaceName}.`
        : 'No default gateway found. Is this machine connected to a network?',
      { interfaceName },
    );
  }

  const selectedName = interfaceName ?? route.interfaceName;
  const iface = interfaces.find((candidate) => candidate.name === selectedName);
  if (!iface || !isInCidr(route.gatewayIp, iface.cidr)) {
    // Typical cause: a full-tunnel VPN owns the default route (utun/tun/wg interfaces).
    throw unusable(
      NetworkErrorCodes.NO_USABLE_INTERFACE,
      `Interface ${selectedName} is not a local network with its gateway on the same subnet ` +
        '(a VPN may own the default route). Set SCAN_INTERFACE to your LAN interface, e.g. en0 or eth0.',
      { interfaceName: selectedName },
    );
  }

  if (!isPrivateIPv4(iface.address)) {
    throw unusable(
      NetworkErrorCodes.TARGET_NOT_ALLOWED,
      `${iface.cidr} is not a private (RFC 1918) network. NetScope only scans private networks.`,
      { cidr: iface.cidr },
    );
  }

  // Very large subnets (e.g. a /16) are narrowed to the /24 around this machine.
  const sweepClamped = hostCount(iface.cidr) > MAX_SWEEP_HOSTS;
  const sweepCidr = assertSweepableRange(sweepClamped ? cidrFor(iface.address, 24) : iface.cidr);

  const gatewayMac = await resolveGatewayMac({
    platform,
    gatewayIp: route.gatewayIp,
    interfaceName: iface.name,
    cidr: iface.cidr,
    signal,
  });

  return {
    interfaceName: iface.name,
    localIp: iface.address,
    localMac: isDeviceMac(iface.mac) ? iface.mac : null,
    cidr: iface.cidr,
    sweepCidr,
    sweepClamped,
    gatewayIp: route.gatewayIp,
    gatewayMac,
  };
}
