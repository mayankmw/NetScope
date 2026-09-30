import { describe, expect, it } from 'vitest';
import { NetworkErrorCodes } from '../../../src/network/errors.js';
import {
  assertLocalTarget,
  assertSweepableRange,
  MAX_SWEEP_HOSTS,
} from '../../../src/network/guards.js';
import {
  cidrFor,
  hostCount,
  hostsInCidr,
  intToIp,
  ipToInt,
  isInCidr,
  isIPv4,
  isPrivateIPv4,
  parseCidr,
} from '../../../src/network/ip.js';
import {
  isDeviceMac,
  isMulticastMac,
  isRandomizedMac,
  normalizeMac,
} from '../../../src/network/mac.js';

describe('ip', () => {
  it('validates IPv4 strings strictly', () => {
    expect(isIPv4('192.168.1.1')).toBe(true);
    expect(isIPv4('256.1.1.1')).toBe(false);
    expect(isIPv4('192.168.1')).toBe(false);
    expect(isIPv4('192.168.01.1')).toBe(false);
    expect(isIPv4('192.168.1.1; rm -rf /')).toBe(false);
    expect(isIPv4(undefined)).toBe(false);
  });

  it('round-trips addresses through integers', () => {
    expect(intToIp(ipToInt('192.168.1.37'))).toBe('192.168.1.37');
    expect(ipToInt('255.255.255.255')).toBe(0xffffffff);
  });

  it('normalizes a CIDR to its network address', () => {
    expect(parseCidr('192.168.1.37/24').cidr).toBe('192.168.1.0/24');
    expect(cidrFor('172.20.10.4', 28)).toBe('172.20.10.0/28');
    expect(() => parseCidr('192.168.1.0/33')).toThrow();
  });

  it('checks subnet membership', () => {
    expect(isInCidr('192.168.1.200', '192.168.1.0/24')).toBe(true);
    expect(isInCidr('192.168.2.1', '192.168.1.0/24')).toBe(false);
  });

  it('enumerates usable hosts, excluding network and broadcast', () => {
    expect(hostsInCidr('192.168.1.0/30')).toEqual(['192.168.1.1', '192.168.1.2']);
    expect(hostsInCidr('172.20.10.0/28')).toHaveLength(14);
    expect(hostCount('192.168.1.0/24')).toBe(254);
    expect(() => hostsInCidr('10.0.0.0/8')).toThrow(RangeError);
  });

  it.each([
    ['10.1.2.3', true],
    ['172.16.0.1', true],
    ['172.31.255.254', true],
    ['172.32.0.1', false],
    ['192.168.0.1', true],
    ['8.8.8.8', false],
    ['169.254.1.1', false],
    ['100.64.0.1', false],
    ['127.0.0.1', false],
  ])('isPrivateIPv4(%s) is %s', (ip, expected) => {
    expect(isPrivateIPv4(ip)).toBe(expected);
  });
});

describe('mac', () => {
  it('normalizes separators, case, and macOS unpadded octets', () => {
    expect(normalizeMac('A4-83-E7-12-34-56')).toBe('a4:83:e7:12:34:56');
    expect(normalizeMac('0:1c:42:0:0:8')).toBe('00:1c:42:00:00:08');
    expect(normalizeMac('(incomplete)')).toBeNull();
    expect(normalizeMac('a4:83:e7:12:34')).toBeNull();
  });

  it('classifies multicast, broadcast, and randomized addresses', () => {
    expect(isMulticastMac('01:00:5e:00:00:fb')).toBe(true);
    expect(isDeviceMac('ff:ff:ff:ff:ff:ff')).toBe(false);
    expect(isDeviceMac('00:00:00:00:00:00')).toBe(false);
    expect(isDeviceMac(null)).toBe(false);
    expect(isRandomizedMac('da:a1:19:00:00:37')).toBe(true);
    expect(isRandomizedMac('a4:83:e7:12:34:56')).toBe(false);
  });
});

describe('guards', () => {
  it('accepts private ranges up to the sweep limit', () => {
    expect(assertSweepableRange('192.168.1.37/24')).toBe('192.168.1.0/24');
    expect(assertSweepableRange('10.0.0.0/22')).toBe('10.0.0.0/22');
  });

  it.each([
    ['8.8.8.0/24', 'public'],
    ['172.15.255.0/23', 'partly public'],
    ['10.0.0.0/21', 'too large'],
    ['0.0.0.0/0', 'everything'],
  ])('refuses %s (%s)', (cidr) => {
    expect(() => assertSweepableRange(cidr)).toThrow(
      expect.objectContaining({ code: NetworkErrorCodes.TARGET_NOT_ALLOWED }),
    );
  });

  it('caps sweeps at a /22', () => {
    expect(MAX_SWEEP_HOSTS).toBe(1022);
  });

  it('only allows targets inside the local subnet', () => {
    expect(assertLocalTarget('192.168.1.20', '192.168.1.0/24')).toBe('192.168.1.20');
    for (const target of ['192.168.2.20', '8.8.8.8', '192.168.1.20 -oX /tmp/x', '']) {
      expect(() => assertLocalTarget(target, '192.168.1.0/24')).toThrow(
        expect.objectContaining({ code: NetworkErrorCodes.TARGET_NOT_ALLOWED }),
      );
    }
  });
});
