import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertPortList } from '../../../src/network/guards.js';
import { expandPortRanges, parseNmapPortScan } from '../../../src/network/parsers/nmap.parser.js';
import { PORT_SCAN_PROFILE } from '../../../src/network/portscan/portProfile.js';

const runCommand = vi.hoisted(() => vi.fn());
vi.mock('../../../src/network/exec/runCommand.js', () => ({ runCommand }));

const { formatPortList, nmapPortScan, portScanArgs } =
  await import('../../../src/network/portscan/nmapPortScan.js');

const fixture = (name) =>
  readFileSync(new URL(`../../fixtures/network/${name}`, import.meta.url), 'utf8');
const PORTS = PORT_SCAN_PROFILE.ports;

beforeEach(() => runCommand.mockReset());

describe('port scan profile', () => {
  it('is a fixed list of 63 unique, valid TCP ports', () => {
    expect(PORTS).toHaveLength(63);
    expect(() => assertPortList(PORTS)).not.toThrow();
    expect(Object.isFrozen(PORTS)).toBe(true);
  });
});

describe('portScanArgs', () => {
  const args = (overrides = {}) =>
    portScanArgs({
      ipAddress: '192.168.1.20',
      ports: PORTS,
      serviceDetection: 'light',
      timeoutMs: 120_000,
      ...overrides,
    });

  it('builds the fixed, conservative command line', () => {
    expect(args()).toEqual([
      '-sT',
      '--unprivileged',
      '-Pn',
      '-n',
      '-p',
      formatPortList(PORTS),
      '-sV',
      '--version-light',
      '-T3',
      '--max-retries',
      '1',
      '--max-rate',
      '100',
      '--host-timeout',
      '115s',
      '--noninteractive',
      '-oX',
      '-',
      '192.168.1.20',
    ]);
  });

  it('drops version detection when it is turned off', () => {
    expect(args({ serviceDetection: 'off' })).not.toContain('-sV');
  });

  it('never includes intrusive, stealth, or evasion options', () => {
    const forbidden = [
      '-sS',
      '-sU',
      '-sA',
      '-sN',
      '-sF',
      '-sX',
      '-sI',
      '-O',
      '-A',
      '-sC',
      '--script',
      '-f',
      '-D',
      '-S',
      '-e',
      '-g',
      '--spoof-mac',
      '--data-length',
      '--badsum',
      '--proxies',
      '-iL',
      '-T4',
      '-T5',
      '--min-rate',
      '--privileged',
    ];
    for (const option of forbidden) expect(args()).not.toContain(option);
  });

  it('compresses the port list into ranges', () => {
    expect(formatPortList([25, 21, 22, 23, 80, 8080, 8081])).toBe('21-23,25,80,8080-8081');
  });
});

describe('nmapPortScan', () => {
  it('refuses targets outside the local subnet without running nmap', async () => {
    const scan = (ipAddress) =>
      nmapPortScan({
        ipAddress,
        subnet: '192.168.1.0/24',
        ports: PORTS,
        serviceDetection: 'light',
        timeoutMs: 60_000,
      });

    await expect(scan('192.168.2.20')).rejects.toMatchObject({ code: 'TARGET_NOT_ALLOWED' });
    await expect(scan('8.8.8.8')).rejects.toMatchObject({ code: 'TARGET_NOT_ALLOWED' });
    await expect(scan('192.168.1.20 -sS')).rejects.toMatchObject({ code: 'TARGET_NOT_ALLOWED' });
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('refuses an invalid port list', async () => {
    const scan = (ports) =>
      nmapPortScan({
        ipAddress: '192.168.1.20',
        subnet: '192.168.1.0/24',
        ports,
        serviceDetection: 'light',
        timeoutMs: 60_000,
      });

    for (const ports of [[], [0], [65536], [22, 22], ['22'], [1.5]]) {
      await expect(scan(ports)).rejects.toMatchObject({ code: 'TARGET_NOT_ALLOWED' });
    }
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('runs nmap with the fixed arguments and parses its output', async () => {
    runCommand.mockResolvedValueOnce({
      stdout: fixture('nmap-port-scan-web.xml'),
      stderr: '',
      exitCode: 0,
    });

    const result = await nmapPortScan({
      ipAddress: '192.168.1.20',
      subnet: '192.168.1.0/24',
      ports: PORTS,
      serviceDetection: 'light',
      timeoutMs: 60_000,
    });

    expect(runCommand).toHaveBeenCalledWith('nmap', result.args, {
      timeoutMs: 60_000,
      signal: undefined,
    });
    expect(result.args.at(-1)).toBe('192.168.1.20');
    expect(result.counts).toEqual({ open: 1, closed: 62, filtered: 0 });
  });

  it('fails when nmap exits with an error', async () => {
    runCommand.mockResolvedValueOnce({ stdout: '', stderr: 'boom', exitCode: 1 });

    await expect(
      nmapPortScan({
        ipAddress: '192.168.1.20',
        subnet: '192.168.1.0/24',
        ports: PORTS,
        serviceDetection: 'off',
        timeoutMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: 'COMMAND_FAILED' });
  });
});

describe('parseNmapPortScan', () => {
  it('reads open ports with service and version, and the rest from <extraports>', () => {
    const result = parseNmapPortScan(fixture('nmap-port-scan-web.xml'), { scannedPorts: PORTS });

    expect(result.timedOut).toBe(false);
    expect(result.counts).toEqual({ open: 1, closed: 62, filtered: 0 });
    expect(result.ports.find((port) => port.port === 80)).toEqual({
      port: 80,
      protocol: 'tcp',
      state: 'open',
      service: 'http',
      product: 'nginx',
      version: '1.27.5',
    });
    expect(result.ports.find((port) => port.port === 22)).toEqual({
      port: 22,
      protocol: 'tcp',
      state: 'closed',
      service: null,
      product: null,
      version: null,
    });
  });

  it('reports every port of an unreachable device as filtered', () => {
    const result = parseNmapPortScan(fixture('nmap-port-scan-unreachable.xml'), {
      scannedPorts: PORTS,
    });

    expect(result.counts).toEqual({ open: 0, closed: 0, filtered: 63 });
  });

  it('handles older nmap output, TLS services, odd states, banners, and timeouts', () => {
    const xml = `<?xml version="1.0"?><nmaprun><host timedout="true">
      <status state="up" reason="user-set"/>
      <ports>
        <extraports state="closed" count="2"><extrareasons reason="conn-refused" count="2"/></extraports>
        <port protocol="tcp" portid="443"><state state="open"/>
          <service name="http" tunnel="ssl" product="Router\u0007admin  " version="2.1"/></port>
        <port protocol="tcp" portid="9100"><state state="open|filtered"/></port>
        <port protocol="udp" portid="53"><state state="open"/></port>
      </ports></host></nmaprun>`;

    const result = parseNmapPortScan(xml, { scannedPorts: [22, 23, 443, 9100] });

    expect(result.timedOut).toBe(true);
    expect(result.ports).toEqual([
      { port: 22, protocol: 'tcp', state: 'closed', service: null, product: null, version: null },
      { port: 23, protocol: 'tcp', state: 'closed', service: null, product: null, version: null },
      {
        port: 443,
        protocol: 'tcp',
        state: 'open',
        service: 'ssl/http',
        product: 'Router admin',
        version: '2.1',
      },
      {
        port: 9100,
        protocol: 'tcp',
        state: 'filtered',
        service: null,
        product: null,
        version: null,
      },
    ]);
  });

  it('reports unknown states when nmap printed no host', () => {
    const result = parseNmapPortScan('<nmaprun></nmaprun>', { scannedPorts: [22] });

    expect(result.ports[0].state).toBeNull();
    expect(result.counts).toEqual({ open: 0, closed: 0, filtered: 0 });
  });

  it('expands nmap port ranges and ignores malformed parts', () => {
    expect(expandPortRanges('21-23,25,x,90-80,70000')).toEqual([21, 22, 23, 25]);
  });
});
