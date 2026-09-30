import { mapWithConcurrency } from '../../utils/concurrency.js';
import { NetworkErrorCodes } from '../errors.js';
import { runCommand } from '../exec/runCommand.js';
import { assertLocalTarget, assertSweepableRange } from '../guards.js';
import { hostsInCidr } from '../ip.js';
import { parsePingResult } from '../parsers/ping.parser.js';

// Extra time the process gets beyond ping's own wait before it is killed.
const PROCESS_GRACE_MS = 1_500;

/**
 * Sends one ICMP echo request to every host in the range (bounded concurrency).
 * Besides finding hosts that answer, every attempt makes the OS resolve the target's MAC,
 * which fills the ARP cache even for hosts that ignore ICMP.
 *
 * @param {object} options
 * @param {import('../platform/index.js').PlatformAdapter} options.platform
 * @param {string} options.cidr   range to sweep
 * @param {string} options.subnet local subnet (every target is checked against it)
 * @param {string[]} [options.exclude] addresses to skip (e.g. this machine)
 * @param {number} options.timeoutMs per-host wait
 * @param {number} options.concurrency
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ responders: Array<{ ipAddress: string, latencyMs: number | null }>, probed: number, errors: number }>}
 */
export async function pingSweep({
  platform,
  cidr,
  subnet,
  exclude = [],
  timeoutMs,
  concurrency,
  signal,
}) {
  const skip = new Set(exclude);
  const targets = hostsInCidr(assertSweepableRange(cidr)).filter((ip) => !skip.has(ip));
  const responders = [];
  let errors = 0;

  await mapWithConcurrency(
    targets,
    concurrency,
    async (ip) => {
      assertLocalTarget(ip, subnet);
      try {
        const result = await runCommand('ping', platform.pingArgs(ip, timeoutMs), {
          timeoutMs: timeoutMs + PROCESS_GRACE_MS,
          signal,
        });
        const { alive, latencyMs } = parsePingResult(result);
        if (alive) responders.push({ ipAddress: ip, latencyMs });
      } catch (error) {
        // Missing ping or cancellation ends the sweep; a single stuck ping just counts as silent.
        if (error.code === NetworkErrorCodes.TOOL_UNAVAILABLE || signal?.aborted) throw error;
        errors += 1;
      }
    },
    signal,
  );

  return { responders, probed: targets.length, errors };
}
