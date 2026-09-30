import { deviceTypeLabel } from '@/constants/deviceTypes';
import { compareIp } from './ip';

/**
 * Pure search / filter / sort logic for the device list, plus the mapping between filter state
 * and URL search params (so filtered views survive reloads and can be linked to).
 * The whole inventory is in memory (≤ ~1,000 devices per network), so this runs client-side.
 */

export const UNKNOWN_VENDOR = '__unknown__';
export const NEW_DEVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const STATUS_FILTERS = ['all', 'online', 'offline'];

export const SORT_FIELDS = Object.freeze({
  ip: 'IP address',
  hostname: 'Hostname',
  vendor: 'Vendor',
  type: 'Device type',
  status: 'Status',
  firstSeen: 'First seen',
  lastSeen: 'Last seen',
});

/**
 * @typedef {object} DeviceFilters
 * @property {string} q free-text search
 * @property {'all' | 'online' | 'offline'} status
 * @property {string[]} types device type codes
 * @property {string[]} vendors vendor names, or UNKNOWN_VENDOR
 * @property {keyof typeof SORT_FIELDS} sort
 * @property {'asc' | 'desc'} dir
 */

/** @type {DeviceFilters} */
export const DEFAULT_FILTERS = Object.freeze({
  q: '',
  status: 'all',
  types: [],
  vendors: [],
  sort: 'ip',
  dir: 'asc',
});

/**
 * Reads filters from URL search params, ignoring anything invalid.
 * @param {URLSearchParams} params
 * @returns {DeviceFilters}
 */
export function parseFilters(params) {
  const status = params.get('status');
  const sort = params.get('sort');
  const dir = params.get('dir');
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    status: STATUS_FILTERS.includes(status) ? status : DEFAULT_FILTERS.status,
    types: [...new Set(params.getAll('type'))],
    vendors: [...new Set(params.getAll('vendor'))],
    sort: Object.hasOwn(SORT_FIELDS, sort) ? sort : DEFAULT_FILTERS.sort,
    dir: dir === 'desc' ? 'desc' : 'asc',
  };
}

/**
 * Writes filters to URL search params, omitting defaults to keep URLs short.
 * @param {DeviceFilters} filters
 */
export function toSearchParams(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status !== DEFAULT_FILTERS.status) params.set('status', filters.status);
  for (const type of filters.types) params.append('type', type);
  for (const vendor of filters.vendors) params.append('vendor', vendor);
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort);
  if (filters.dir !== DEFAULT_FILTERS.dir) params.set('dir', filters.dir);
  return params;
}

/** Number of active filters (search counts as one). @param {DeviceFilters} filters */
export function countActiveFilters(filters) {
  return (
    (filters.q ? 1 : 0) +
    (filters.status !== 'all' ? 1 : 0) +
    filters.types.length +
    filters.vendors.length
  );
}

/** The name shown for a device: user-given name, else hostname, else null. */
export function deviceDisplayName(device) {
  return device.displayName || device.hostname || null;
}

/** First seen within the last 24 hours. */
export function isNewDevice(device, now = Date.now()) {
  return now - new Date(device.firstSeenAt).getTime() < NEW_DEVICE_WINDOW_MS;
}

/**
 * Case-insensitive match on IP, MAC (":" or "-" separators), hostname, display name, vendor,
 * and device type.
 */
export function matchesSearch(device, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const macNeedle = needle.replaceAll('-', ':');
  const haystack = [
    device.ipAddress,
    device.hostname,
    device.displayName,
    device.vendor,
    deviceTypeLabel(device.deviceType),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return haystack.includes(needle) || device.macAddress.includes(macNeedle);
}

/**
 * @param {import('@/types/api').Device[]} devices
 * @param {DeviceFilters} filters
 */
export function filterDevices(devices, filters) {
  const types = new Set(filters.types);
  const vendors = new Set(filters.vendors);
  return devices.filter(
    (device) =>
      (filters.status === 'all' || device.status === filters.status) &&
      (types.size === 0 || types.has(device.deviceType)) &&
      (vendors.size === 0 || vendors.has(device.vendor ?? UNKNOWN_VENDOR)) &&
      matchesSearch(device, filters.q),
  );
}

const SORT_VALUE = {
  ip: (device) => device.ipAddress,
  hostname: (device) => deviceDisplayName(device)?.toLowerCase() ?? null,
  vendor: (device) => device.vendor?.toLowerCase() ?? null,
  type: (device) => (device.deviceType === 'unknown' ? null : deviceTypeLabel(device.deviceType)),
  status: (device) => (device.status === 'online' ? 0 : 1),
  firstSeen: (device) => new Date(device.firstSeenAt).getTime(),
  lastSeen: (device) => new Date(device.lastSeenAt).getTime(),
};

/**
 * Sorts a copy. Missing values (no hostname, unknown vendor/type) always sort last, whatever the
 * direction; ties fall back to IP order.
 *
 * @param {import('@/types/api').Device[]} devices
 * @param {keyof typeof SORT_FIELDS} field
 * @param {'asc' | 'desc'} dir
 */
export function sortDevices(devices, field, dir) {
  const valueOf = SORT_VALUE[field] ?? SORT_VALUE.ip;
  const sign = dir === 'desc' ? -1 : 1;

  return [...devices].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    let result = 0;
    if (left !== null && right !== null) {
      if (field === 'ip') result = compareIp(left, right);
      else if (typeof left === 'number') result = left - right;
      else result = left.localeCompare(right);
    }
    return result !== 0 ? result * sign : compareIp(a.ipAddress, b.ipAddress);
  });
}

/**
 * Filter menu options with counts, from the devices actually present.
 * @param {import('@/types/api').Device[]} devices
 */
export function getFilterOptions(devices) {
  const typeCounts = new Map();
  const vendorCounts = new Map();
  let online = 0;
  for (const device of devices) {
    typeCounts.set(device.deviceType, (typeCounts.get(device.deviceType) ?? 0) + 1);
    const vendor = device.vendor ?? UNKNOWN_VENDOR;
    vendorCounts.set(vendor, (vendorCounts.get(vendor) ?? 0) + 1);
    if (device.status === 'online') online += 1;
  }

  const byCountThenLabel = (a, b) => b.count - a.count || a.label.localeCompare(b.label);
  return {
    status: { all: devices.length, online, offline: devices.length - online },
    types: [...typeCounts]
      .map(([value, count]) => ({ value, label: deviceTypeLabel(value), count }))
      .sort(byCountThenLabel),
    vendors: [...vendorCounts]
      .map(([value, count]) => ({
        value,
        label: value === UNKNOWN_VENDOR ? 'Unknown vendor' : value,
        count,
      }))
      .sort(byCountThenLabel),
  };
}
