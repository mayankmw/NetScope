import { runCommand } from '../exec/runCommand.js';
import { parseDarwinArp } from '../parsers/arp.parser.js';
import { parseDarwinDefaultRoute } from '../parsers/route.parser.js';

const COMMAND_TIMEOUT_MS = 5_000;

/** macOS adapter: the system `arp`, `route`, and BSD `ping`. */
export const darwin = Object.freeze({
  name: 'darwin',

  /** @param {{ signal?: AbortSignal }} [options] */
  async readArpTable({ signal } = {}) {
    const { stdout } = await runCommand('arp', ['-an'], { timeoutMs: COMMAND_TIMEOUT_MS, signal });
    return parseDarwinArp(stdout);
  },

  /**
   * Default route, optionally scoped to one interface (useful when a VPN owns the global one).
   * @param {{ interfaceName?: string, signal?: AbortSignal }} [options]
   */
  async getDefaultRoute({ interfaceName, signal } = {}) {
    const args = interfaceName
      ? ['-n', 'get', '-ifscope', interfaceName, 'default']
      : ['-n', 'get', 'default'];
    const { stdout, exitCode } = await runCommand('route', args, {
      timeoutMs: COMMAND_TIMEOUT_MS,
      signal,
    });
    return exitCode === 0 ? parseDarwinDefaultRoute(stdout) : null;
  },

  /**
   * One echo request. BSD ping: -W is the per-reply wait in milliseconds, -t the overall
   * deadline in whole seconds.
   * @param {string} ip validated target
   * @param {number} timeoutMs
   */
  pingArgs(ip, timeoutMs) {
    return [
      '-n',
      '-q',
      '-c',
      '1',
      '-W',
      String(timeoutMs),
      '-t',
      String(Math.ceil(timeoutMs / 1000)),
      ip,
    ];
  },
});
