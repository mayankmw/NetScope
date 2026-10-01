import { NetworkError, NetworkErrorCodes } from '../errors.js';
import { runCommand } from '../exec/runCommand.js';
import { assertLocalTarget, assertPortList } from '../guards.js';
import { parseNmapPortScan } from '../parsers/nmap.parser.js';

const MIN_HOST_TIMEOUT_S = 5;
// nmap gives up on the host this long before NetScope's own hard limit kills it, so a slow
// device still produces a (partial) report instead of a killed process.
const HOST_TIMEOUT_MARGIN_MS = 5_000;

/** Sorted port numbers in nmap's range syntax: [21, 22, 23, 25] → "21-23,25". */
export function formatPortList(ports) {
  const sorted = [...ports].sort((a, b) => a - b);
  const parts = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const start = sorted[index];
    while (sorted[index + 1] === sorted[index] + 1) index += 1;
    parts.push(start === sorted[index] ? `${start}` : `${start}-${sorted[index]}`);
  }
  return parts.join(',');
}

/**
 * The complete, fixed nmap command line for scanning one device. Every value comes from NetScope
 * code or validated configuration; nothing from an API request.
 *
 *   -sT --unprivileged   TCP connect scan: ordinary connections through the OS, no raw packets,
 *                        no root, never a SYN/"stealth" scan even if nmap runs as root
 *   -Pn                  the device is already known from discovery; do not probe whether it is up
 *   -n                   no DNS lookups
 *   -p <list>            the fixed profile (portProfile.js)
 *   -sV --version-light  light service/version detection (only the most likely probes), unless
 *                        PORT_SCAN_SERVICE_DETECTION=off
 *   -T3                  nmap's normal timing (not aggressive)
 *   --max-retries 1      one retransmission at most
 *   --max-rate 100       at most 100 probes per second
 *   --host-timeout       nmap stops on its own before NetScope's hard limit
 *   --noninteractive     never read the keyboard
 *   -oX -                XML on stdout, parsed by parseNmapPortScan
 *
 * Never used: -sS/-sU/-sA/-sN/-sF/-sX/-sI, -O, -A, -sC/--script, -f, -D, -S, -e, -g, --spoof-mac,
 * --data-length, --badsum, --proxies, -iL, -T4/-T5, --min-rate.
 *
 * @param {{ ipAddress: string, ports: number[], serviceDetection: import('./portProfile.js').ServiceDetection,
 *           timeoutMs: number }} options validated values; `timeoutMs` is NetScope's hard limit
 */
export function portScanArgs({ ipAddress, ports, serviceDetection, timeoutMs }) {
  const hostTimeoutS = Math.max(
    MIN_HOST_TIMEOUT_S,
    Math.floor((timeoutMs - HOST_TIMEOUT_MARGIN_MS) / 1000),
  );
  return [
    '-sT',
    '--unprivileged',
    '-Pn',
    '-n',
    '-p',
    formatPortList(ports),
    ...(serviceDetection === 'light' ? ['-sV', '--version-light'] : []),
    '-T3',
    '--max-retries',
    '1',
    '--max-rate',
    '100',
    '--host-timeout',
    `${hostTimeoutS}s`,
    '--noninteractive',
    '-oX',
    '-',
    ipAddress,
  ];
}

/**
 * Scans one device's TCP ports with nmap. The target must be a private address on the local
 * subnet, and the port list must be valid; both are checked here, whatever the caller did.
 *
 * @param {{ ipAddress: string, subnet: string, ports: number[],
 *           serviceDetection: import('./portProfile.js').ServiceDetection,
 *           timeoutMs: number, signal?: AbortSignal }} options
 * @returns {Promise<import('../parsers/nmap.parser.js').PortScanResult & { args: string[] }>}
 */
export async function nmapPortScan({
  ipAddress,
  subnet,
  ports,
  serviceDetection,
  timeoutMs,
  signal,
}) {
  assertLocalTarget(ipAddress, subnet);
  assertPortList(ports);
  const args = portScanArgs({ ipAddress, ports, serviceDetection, timeoutMs });

  const result = await runCommand('nmap', args, { timeoutMs, signal });
  if (result.exitCode !== 0) {
    throw new NetworkError(NetworkErrorCodes.COMMAND_FAILED, 'nmap exited with an error.', {
      details: { tool: 'nmap', exitCode: result.exitCode, stderr: result.stderr.slice(0, 500) },
    });
  }
  return { ...parseNmapPortScan(result.stdout, { scannedPorts: ports }), args };
}
