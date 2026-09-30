import { Resolver } from 'node:dns/promises';
import { mapWithConcurrency } from '../../utils/concurrency.js';

const HOSTNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,251}[A-Za-z0-9])?$/;

/**
 * Names come from the LAN's DNS server, i.e. from untrusted devices. Keep only plain hostnames.
 * @param {string} name
 */
export function sanitizeHostname(name) {
  const trimmed = String(name).trim().replace(/\.$/, '');
  return HOSTNAME_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Reverse-DNS (PTR) lookups via c-ares, which does not occupy the libuv thread pool.
 * Hosts without a PTR record are simply absent from the result.
 *
 * @param {string[]} ips
 * @param {{ timeoutMs?: number, concurrency?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<Map<string, string>>} ip → hostname
 */
export async function lookupHostnames(ips, { timeoutMs = 1_000, concurrency = 16, signal } = {}) {
  const resolver = new Resolver({ timeout: timeoutMs, tries: 1 });
  const cancel = () => resolver.cancel();
  signal?.addEventListener('abort', cancel, { once: true });

  const names = new Map();
  try {
    await mapWithConcurrency(
      ips,
      concurrency,
      async (ip) => {
        try {
          const [name] = await resolver.reverse(ip);
          const hostname = name ? sanitizeHostname(name) : null;
          if (hostname) names.set(ip, hostname);
        } catch {
          // No PTR record, NXDOMAIN, or timeout: the host simply has no name.
        }
      },
      signal,
    );
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
  return names;
}
