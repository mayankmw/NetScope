import { describe, expect, it } from 'vitest';
import { classifyDevice } from '../../../src/network/discovery/classifyDevice.js';
import {
  mergeObservations,
  toDiscoveredDevice,
} from '../../../src/network/discovery/normalizeDevices.js';
import { lookupVendor } from '../../../src/network/discovery/vendors.js';
import { sanitizeHostname } from '../../../src/network/discovery/hostnames.js';

const network = {
  interfaceName: 'en0',
  localIp: '192.168.1.37',
  localMac: 'da:a1:19:00:00:37',
  cidr: '192.168.1.0/24',
  sweepCidr: '192.168.1.0/24',
  sweepClamped: false,
  gatewayIp: '192.168.1.1',
  gatewayMac: 'a4:83:e7:00:01:01',
};

const arp = (ipAddress, macAddress, interfaceName = 'en0') => ({
  ipAddress,
  macAddress,
  interfaceName,
});

describe('mergeObservations', () => {
  it('combines ping, nmap, ARP, and this machine into one record per MAC', () => {
    const { hosts, unresolvedHosts } = mergeObservations({
      network,
      pingResponders: [
        { ipAddress: '192.168.1.1', latencyMs: 2.1 },
        { ipAddress: '192.168.1.20', latencyMs: 5 },
      ],
      nmapHosts: [{ ipAddress: '192.168.1.30', macAddress: null, vendor: null, latencyMs: 0.9 }],
      arpEntries: [
        arp('192.168.1.1', 'a4:83:e7:00:01:01'),
        arp('192.168.1.20', 'b8:27:eb:12:34:56'),
        arp('192.168.1.30', 'dc:a6:32:00:00:30'),
        arp('192.168.1.40', '00:11:32:00:00:40'),
      ],
    });

    expect(hosts.map((host) => [host.ipAddress, host.sources])).toEqual([
      ['192.168.1.1', ['arp', 'ping']],
      ['192.168.1.20', ['arp', 'ping']],
      ['192.168.1.30', ['arp', 'nmap']],
      ['192.168.1.37', ['local']],
      ['192.168.1.40', ['arp']],
    ]);
    expect(hosts[0]).toMatchObject({ isGateway: true, isSelf: false, latencyMs: 2.1 });
    expect(hosts[3]).toMatchObject({ isSelf: true, macAddress: network.localMac });
    expect(unresolvedHosts).toEqual([]);
  });

  it('ignores ARP entries on other interfaces or outside the swept range', () => {
    const { hosts } = mergeObservations({
      network,
      pingResponders: [],
      nmapHosts: [],
      arpEntries: [
        arp('10.8.0.1', '02:00:00:00:00:01', 'utun4'),
        arp('192.168.2.5', 'b8:27:eb:00:00:05'),
      ],
    });

    expect(hosts.map((host) => host.ipAddress)).toEqual(['192.168.1.37']);
  });

  it('reports hosts that answered but have no MAC as unresolved', () => {
    const { hosts, unresolvedHosts } = mergeObservations({
      network: { ...network, localMac: null },
      pingResponders: [{ ipAddress: '192.168.1.50', latencyMs: 1 }],
      nmapHosts: [],
      arpEntries: [],
    });

    expect(hosts).toEqual([]);
    expect(unresolvedHosts).toEqual(['192.168.1.50']);
  });

  it('keeps one device when a MAC answers on several IPs, preferring the IP that answered', () => {
    const { hosts, duplicateMacs } = mergeObservations({
      network: { ...network, localMac: null },
      pingResponders: [{ ipAddress: '192.168.1.60', latencyMs: 1 }],
      nmapHosts: [],
      arpEntries: [
        arp('192.168.1.50', 'b8:27:eb:00:00:50'),
        arp('192.168.1.60', 'b8:27:eb:00:00:50'),
      ],
    });

    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({ ipAddress: '192.168.1.60', sources: ['arp', 'ping'] });
    expect(duplicateMacs).toEqual([
      { macAddress: 'b8:27:eb:00:00:50', ipAddresses: ['192.168.1.50', '192.168.1.60'] },
    ]);
  });
});

describe('toDiscoveredDevice', () => {
  it('produces the common Device shape', () => {
    const [, raspberryPi] = mergeObservations({
      network,
      pingResponders: [{ ipAddress: '192.168.1.20', latencyMs: 5 }],
      nmapHosts: [],
      arpEntries: [
        arp('192.168.1.1', 'a4:83:e7:00:01:01'),
        arp('192.168.1.20', 'b8:27:eb:12:34:56'),
      ],
    }).hosts;

    expect(
      toDiscoveredDevice(raspberryPi, {
        hostname: null,
        vendor: lookupVendor(raspberryPi.macAddress),
      }),
    ).toEqual({
      ipAddress: '192.168.1.20',
      macAddress: 'b8:27:eb:12:34:56',
      macIsRandom: false,
      hostname: null,
      vendor: 'Raspberry Pi Foundation',
      deviceType: 'computer',
      status: 'online',
      latencyMs: 5,
      sources: ['arp', 'ping'],
      isGateway: false,
      isSelf: false,
    });
  });
});

describe('lookupVendor', () => {
  it('finds manufacturers by OUI and skips randomized MACs', () => {
    expect(lookupVendor('a4:83:e7:12:34:56')).toBe('Apple, Inc.');
    expect(lookupVendor('da:a1:19:12:34:56')).toBeNull();
    expect(lookupVendor(null)).toBeNull();
  });
});

describe('classifyDevice', () => {
  it.each([
    [{ isGateway: true }, 'router'],
    [{ isSelf: true }, 'computer'],
    [{ hostname: 'Johns-iPhone' }, 'phone'],
    [{ hostname: 'living-room-roku' }, 'tv'],
    [{ hostname: 'BRN001BA9123456' }, 'printer'],
    [{ vendor: 'Espressif Inc.' }, 'iot'],
    [{ vendor: 'Sonos, Inc.' }, 'speaker'],
    [{ hostname: 'host-42', vendor: 'Apple, Inc.' }, 'unknown'],
    [{}, 'unknown'],
  ])('%o → %s', (input, expected) => {
    expect(
      classifyDevice({ isGateway: false, isSelf: false, hostname: null, vendor: null, ...input }),
    ).toBe(expected);
  });
});

describe('sanitizeHostname', () => {
  it('keeps plain hostnames and rejects anything else', () => {
    expect(sanitizeHostname('printer.lan.')).toBe('printer.lan');
    expect(sanitizeHostname('<script>alert(1)</script>')).toBeNull();
    expect(sanitizeHostname('name with spaces')).toBeNull();
  });
});
