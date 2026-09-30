import { NetworkError, NetworkErrorCodes } from '../errors.js';
import { runCommand } from '../exec/runCommand.js';
import { assertSweepableRange } from '../guards.js';
import { parseNmapHostDiscovery } from '../parsers/nmap.parser.js';

/**
 * Fixed nmap profile: host discovery only (-sn, no port scan), no DNS (-n), one retry,
 * a per-host cap, XML to stdout. Nothing else is ever passed: no scripts, no OS detection,
 * no spoofing or evasion options. Without root, nmap probes TCP 80/443 instead of ARP,
 * which finds some hosts that ignore ping.
 *
 * @param {string} cidr validated sweep range
 */
export function nmapArgs(cidr) {
  return ['-sn', '-n', '-T4', '--max-retries', '1', '--host-timeout', '5s', '-oX', '-', cidr];
}

/**
 * @param {{ cidr: string, timeoutMs: number, signal?: AbortSignal }} options
 * @returns {Promise<import('../parsers/nmap.parser.js').NmapHost[]>}
 */
export async function nmapHostDiscovery({ cidr, timeoutMs, signal }) {
  const result = await runCommand('nmap', nmapArgs(assertSweepableRange(cidr)), {
    timeoutMs,
    signal,
  });
  if (result.exitCode !== 0) {
    throw new NetworkError(NetworkErrorCodes.COMMAND_FAILED, 'nmap exited with an error.', {
      details: { tool: 'nmap', exitCode: result.exitCode, stderr: result.stderr.slice(0, 500) },
    });
  }
  return parseNmapHostDiscovery(result.stdout);
}
