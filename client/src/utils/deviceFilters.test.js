import { describe, expect, it } from 'vitest';
import { makeDevice, makeInventory } from '@/test/fixtures';
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  filterDevices,
  getFilterOptions,
  isNewDevice,
  matchesSearch,
  parseFilters,
  sortDevices,
  toSearchParams,
  UNKNOWN_VENDOR,
} from './deviceFilters';

const { devices } = makeInventory();
const ips = (list) => list.map((device) => device.ipAddress);

describe('URL filter state', () => {
  it('round-trips filters through search params, omitting defaults', () => {
    const filters = {
      ...DEFAULT_FILTERS,
      q: 'pi',
      status: 'online',
      types: ['router', 'phone'],
      vendors: [UNKNOWN_VENDOR],
      sort: 'lastSeen',
      dir: 'desc',
    };
    const params = toSearchParams(filters);

    expect(params.toString()).toBe(
      'q=pi&status=online&type=router&type=phone&vendor=__unknown__&sort=lastSeen&dir=desc',
    );
    expect(parseFilters(params)).toEqual(filters);
    expect(toSearchParams(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('ignores invalid values', () => {
    expect(parseFilters(new URLSearchParams('status=maybe&sort=__proto__&dir=up'))).toEqual(
      DEFAULT_FILTERS,
    );
  });

  it('counts active filters', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, q: 'x', types: ['a', 'b'] })).toBe(3);
  });
});

describe('search', () => {
  it.each([
    ['192.168.1.2', ['192.168.1.20']],
    ['RASPBERRY', ['192.168.1.20']],
    ['a4-83-e7', ['192.168.1.1']],
    ['router', ['192.168.1.1']],
    ['synology', ['192.168.1.100']],
    ['', ['192.168.1.1', '192.168.1.9', '192.168.1.20', '192.168.1.100']],
  ])('"%s" matches %o', (query, expected) => {
    expect(ips(devices.filter((device) => matchesSearch(device, query)))).toEqual(expected);
  });
});

describe('filterDevices', () => {
  it('combines status, type, vendor, and search', () => {
    expect(ips(filterDevices(devices, { ...DEFAULT_FILTERS, status: 'offline' }))).toEqual([
      '192.168.1.9',
    ]);
    expect(
      ips(filterDevices(devices, { ...DEFAULT_FILTERS, types: ['router', 'computer'] })),
    ).toEqual(['192.168.1.1', '192.168.1.20']);
    expect(ips(filterDevices(devices, { ...DEFAULT_FILTERS, vendors: [UNKNOWN_VENDOR] }))).toEqual([
      '192.168.1.9',
    ]);
    expect(
      ips(filterDevices(devices, { ...DEFAULT_FILTERS, status: 'online', q: 'pixel' })),
    ).toEqual([]);
  });
});

describe('sortDevices', () => {
  it('sorts IP addresses numerically', () => {
    expect(ips(sortDevices(devices, 'ip', 'asc'))).toEqual([
      '192.168.1.1',
      '192.168.1.9',
      '192.168.1.20',
      '192.168.1.100',
    ]);
    expect(ips(sortDevices(devices, 'ip', 'desc'))[0]).toBe('192.168.1.100');
  });

  it('keeps missing values last in both directions', () => {
    expect(ips(sortDevices(devices, 'hostname', 'asc'))).toEqual([
      '192.168.1.9',
      '192.168.1.20',
      '192.168.1.1',
      '192.168.1.100',
    ]);
    expect(ips(sortDevices(devices, 'hostname', 'desc')).slice(0, 2)).toEqual([
      '192.168.1.20',
      '192.168.1.9',
    ]);
  });

  it('sorts by time and status, breaking ties by IP', () => {
    expect(ips(sortDevices(devices, 'firstSeen', 'desc'))[0]).toBe('192.168.1.100');
    expect(ips(sortDevices(devices, 'status', 'asc')).at(-1)).toBe('192.168.1.9');
  });

  it('does not mutate the input', () => {
    const copy = [...devices];
    sortDevices(devices, 'vendor', 'desc');
    expect(devices).toEqual(copy);
  });
});

describe('getFilterOptions', () => {
  it('lists types and vendors present, with counts', () => {
    const options = getFilterOptions(devices);

    expect(options.status).toEqual({ all: 4, online: 3, offline: 1 });
    expect(options.types.find((option) => option.value === 'unknown')).toEqual({
      value: 'unknown',
      label: 'Unknown',
      count: 1,
    });
    expect(options.vendors.map((option) => option.label)).toContain('Unknown vendor');
  });
});

describe('isNewDevice', () => {
  it('is true within 24 hours of first sighting', () => {
    const now = Date.now();
    expect(
      isNewDevice(makeDevice({ firstSeenAt: new Date(now - 3_600_000).toISOString() }), now),
    ).toBe(true);
    expect(
      isNewDevice(makeDevice({ firstSeenAt: new Date(now - 90_000_000).toISOString() }), now),
    ).toBe(false);
  });
});
