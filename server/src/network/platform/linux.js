import { readFile } from 'node:fs/promises';
import { NetworkError, NetworkErrorCodes } from '../errors.js';
import { parseLinuxProcArp } from '../parsers/arp.parser.js';
import { parseLinuxProcRoute } from '../parsers/route.parser.js';

/**
 * Linux adapter. The kernel's ARP and routing tables are read straight from /proc — the same
 * data `arp -an` and `ip route` print, without depending on net-tools being installed.
 */
async function readProcFile(path, signal) {
  try {
    return await readFile(path, { encoding: 'utf8', signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new NetworkError(NetworkErrorCodes.TOOL_UNAVAILABLE, `Could not read ${path}.`, {
      cause: error,
      details: { path },
    });
  }
}

export const linux = Object.freeze({
  name: 'linux',

  /** @param {{ signal?: AbortSignal }} [options] */
  async readArpTable({ signal } = {}) {
    return parseLinuxProcArp(await readProcFile('/proc/net/arp', signal));
  },

  /** @param {{ interfaceName?: string, signal?: AbortSignal }} [options] */
  async getDefaultRoute({ interfaceName, signal } = {}) {
    return parseLinuxProcRoute(await readProcFile('/proc/net/route', signal), interfaceName);
  },

  /**
   * One echo request. iputils ping: -W is the reply wait in whole seconds.
   * @param {string} ip validated target
   * @param {number} timeoutMs
   */
  pingArgs(ip, timeoutMs) {
    return ['-n', '-q', '-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), ip];
  },
});
