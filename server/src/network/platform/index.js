import { NetworkError, NetworkErrorCodes } from '../errors.js';
import { darwin } from './darwin.js';
import { linux } from './linux.js';

const ADAPTERS = { darwin, linux };

/**
 * @typedef {object} PlatformAdapter
 * @property {string} name
 * @property {(options?: { signal?: AbortSignal }) => Promise<import('../parsers/arp.parser.js').ArpEntry[]>} readArpTable
 * @property {(options?: { interfaceName?: string, signal?: AbortSignal }) => Promise<import('../parsers/route.parser.js').DefaultRoute | null>} getDefaultRoute
 * @property {(ip: string, timeoutMs: number) => string[]} pingArgs
 */

/**
 * The adapter for the current OS. macOS and Linux are supported; anything else (including
 * Windows) fails with PLATFORM_NOT_SUPPORTED.
 * @param {string} [platform]
 * @returns {PlatformAdapter}
 */
export function getPlatform(platform = process.platform) {
  const adapter = ADAPTERS[platform];
  if (!adapter) {
    throw new NetworkError(
      NetworkErrorCodes.PLATFORM_NOT_SUPPORTED,
      `Network discovery is not supported on ${platform}. Supported: macOS and Linux.`,
      { details: { platform } },
    );
  }
  return adapter;
}
