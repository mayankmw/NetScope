import { createRequire } from 'node:module';
import { isRandomizedMac } from '../mac.js';

const require = createRequire(import.meta.url);

/** @type {Record<string, string> | null} IEEE registry, loaded on first use (~54k entries). */
let registry = null;

// Longest prefix first: MA-S (36-bit), MA-M (28-bit), MA-L (24-bit) assignments.
const PREFIX_LENGTHS = [9, 7, 6];

/**
 * Manufacturer for a MAC address from the bundled IEEE OUI registry (no network calls).
 * Randomized MACs have no manufacturer.
 *
 * @param {string | null} mac normalized
 * @returns {string | null}
 */
export function lookupVendor(mac) {
  if (!mac || isRandomizedMac(mac)) return null;
  registry ??= require('oui-data');

  const hex = mac.replaceAll(':', '').toUpperCase();
  for (const length of PREFIX_LENGTHS) {
    const entry = registry[hex.slice(0, length)];
    if (entry) {
      const name = entry.split('\n')[0].trim();
      return name && name !== 'Private' ? name : null;
    }
  }
  return null;
}
