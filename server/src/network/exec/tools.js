import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { config } from '../../config/index.js';
import { NetworkError, NetworkErrorCodes } from '../errors.js';

/**
 * The complete allowlist of programs NetScope may execute, with the absolute locations they are
 * looked up at. Absolute paths mean a modified PATH cannot substitute another program.
 */
const TOOL_LOCATIONS = Object.freeze({
  arp: ['/usr/sbin/arp', '/sbin/arp'],
  ping: ['/sbin/ping', '/bin/ping', '/usr/bin/ping'],
  route: ['/sbin/route', '/usr/sbin/route'],
  nmap: ['/opt/homebrew/bin/nmap', '/usr/local/bin/nmap', '/usr/bin/nmap'],
});

/** @typedef {keyof typeof TOOL_LOCATIONS} ToolName */

const resolved = new Map();

async function isExecutable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Absolute path of an allowlisted tool. Results are cached for the life of the process.
 * @param {ToolName} tool
 * @returns {Promise<string>}
 */
export async function resolveTool(tool) {
  if (!Object.hasOwn(TOOL_LOCATIONS, tool)) {
    // A programming error, not a runtime condition: nothing outside this module picks tools.
    throw new TypeError(`"${tool}" is not an allowlisted tool`);
  }
  if (resolved.has(tool)) return resolved.get(tool);

  const candidates =
    tool === 'nmap' && config.scan.nmap.path
      ? [config.scan.nmap.path, ...TOOL_LOCATIONS.nmap]
      : TOOL_LOCATIONS[tool];

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      resolved.set(tool, candidate);
      return candidate;
    }
  }

  throw new NetworkError(NetworkErrorCodes.TOOL_UNAVAILABLE, `"${tool}" is not installed.`, {
    details: { tool },
  });
}

/** True when the tool can be run. Never throws. @param {ToolName} tool */
export async function isToolAvailable(tool) {
  try {
    await resolveTool(tool);
    return true;
  } catch {
    return false;
  }
}
