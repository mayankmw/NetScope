import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDarwinArp, parseLinuxProcArp } from '../../../src/network/parsers/arp.parser.js';
import { parseNmapHostDiscovery } from '../../../src/network/parsers/nmap.parser.js';
import { parsePingResult } from '../../../src/network/parsers/ping.parser.js';
import {
  parseDarwinDefaultRoute,
  parseLinuxProcRoute,
} from '../../../src/network/parsers/route.parser.js';

const fixture = (name) =>
  readFileSync(new URL(`../../fixtures/network/${name}`, import.meta.url), 'utf8');

describe('ARP parsers', () => {
  it('parses macOS arp -an, dropping incomplete, broadcast, and multicast entries', () => {
    expect(parseDarwinArp(fixture('darwin-arp.txt'))).toEqual([
      { ipAddress: '192.168.1.1', macAddress: 'a4:83:e7:00:01:01', interfaceName: 'en0' },
      { ipAddress: '192.168.1.20', macAddress: 'b8:27:eb:12:34:56', interfaceName: 'en0' },
      { ipAddress: '192.168.1.37', macAddress: 'da:a1:19:00:00:37', interfaceName: 'en0' },
      { ipAddress: '10.8.0.1', macAddress: '02:00:00:00:00:01', interfaceName: 'utun4' },
    ]);
  });

  it('parses Linux /proc/net/arp, keeping only complete entries', () => {
    expect(parseLinuxProcArp(fixture('linux-proc-arp.txt'))).toEqual([
      { ipAddress: '192.168.1.1', macAddress: 'a4:83:e7:00:01:01', interfaceName: 'eth0' },
      { ipAddress: '192.168.1.20', macAddress: 'b8:27:eb:12:34:56', interfaceName: 'eth0' },
      { ipAddress: '172.17.0.2', macAddress: '02:42:ac:11:00:02', interfaceName: 'docker0' },
    ]);
  });

  it('ignores garbage', () => {
    expect(parseDarwinArp('nonsense\n\n? (not-an-ip) at x on en0')).toEqual([]);
    expect(parseLinuxProcArp('')).toEqual([]);
  });
});

describe('route parsers', () => {
  it('parses macOS route -n get default', () => {
    expect(parseDarwinDefaultRoute(fixture('darwin-route-default.txt'))).toEqual({
      gatewayIp: '192.168.1.1',
      interfaceName: 'en0',
    });
  });

  it('returns null when macOS has no IPv4 default gateway', () => {
    expect(parseDarwinDefaultRoute('route: writing to routing socket: not in table')).toBeNull();
    expect(parseDarwinDefaultRoute('    gateway: fe80::1%en0\n  interface: en0')).toBeNull();
  });

  it('picks the lowest-metric default route from /proc/net/route', () => {
    expect(parseLinuxProcRoute(fixture('linux-proc-route.txt'))).toEqual({
      gatewayIp: '192.168.1.1',
      interfaceName: 'eth0',
    });
  });

  it('can restrict /proc/net/route to one interface', () => {
    expect(parseLinuxProcRoute(fixture('linux-proc-route.txt'), 'wlan0')).toEqual({
      gatewayIp: '192.168.1.1',
      interfaceName: 'wlan0',
    });
    expect(parseLinuxProcRoute(fixture('linux-proc-route.txt'), 'docker0')).toBeNull();
  });
});

describe('ping parser', () => {
  const summary = (line) =>
    `1 packets transmitted, 1 packets received, 0.0% packet loss\n${line}\n`;

  it.each([
    ['macOS', 'round-trip min/avg/max/stddev = 3.818/3.818/3.818/0.000 ms', 3.82],
    ['macOS with nan stddev', 'round-trip min/avg/max/stddev = 4.176/4.176/4.176/nan ms', 4.18],
    ['Linux', 'rtt min/avg/max/mdev = 0.045/0.045/0.045/0.000 ms', 0.05],
  ])('reads the latency from %s output', (_platform, line, latencyMs) => {
    expect(parsePingResult({ exitCode: 0, stdout: summary(line) })).toEqual({
      alive: true,
      latencyMs,
    });
  });

  it('treats a non-zero exit as no reply', () => {
    expect(
      parsePingResult({ exitCode: 2, stdout: '1 packets transmitted, 0 packets received' }),
    ).toEqual({
      alive: false,
      latencyMs: null,
    });
  });

  it('reports alive without latency if the summary is missing', () => {
    expect(parsePingResult({ exitCode: 0, stdout: '' })).toEqual({ alive: true, latencyMs: null });
  });
});

describe('nmap parser', () => {
  it('returns hosts that are up, with MAC and vendor when present', () => {
    expect(parseNmapHostDiscovery(fixture('nmap-host-discovery.xml'))).toEqual([
      {
        ipAddress: '192.168.1.1',
        macAddress: 'a4:83:e7:00:01:01',
        vendor: 'Apple',
        latencyMs: 1.84,
      },
      { ipAddress: '192.168.1.6', macAddress: null, vendor: null, latencyMs: 0.06 },
    ]);
  });

  it('handles output with no hosts', () => {
    expect(parseNmapHostDiscovery('<?xml version="1.0"?><nmaprun></nmaprun>')).toEqual([]);
  });
});
