import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The OS-facing parts of the network layer are replaced by a scripted scenario. Everything
// else — merging, vendor lookup, classification, the service, SQL — is real.
const scenario = vi.hoisted(() => ({ current: null }));

vi.mock('../../src/network/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  const platform = {
    name: 'test',
    readArpTable: vi.fn(async () => scenario.current.arp()),
    getDefaultRoute: vi.fn(),
    pingArgs: vi.fn(),
  };
  return {
    ...actual,
    getPlatform: vi.fn(() => platform),
    detectNetwork: vi.fn(async () => scenario.current.detectNetwork()),
    pingSweep: vi.fn(async (options) => scenario.current.ping(options)),
    isToolAvailable: vi.fn(async () => scenario.current.nmapAvailable),
    nmapHostDiscovery: vi.fn(async () => scenario.current.nmap()),
    lookupHostnames: vi.fn(async () => new Map(Object.entries(scenario.current.hostnames))),
  };
});

const { createApp } = await import('../../src/app.js');
const { closePool, query } = await import('../../src/db/pool.js');
const { cancelActiveDiscovery } = await import('../../src/services/discovery.service.js');
const { NetworkError, NetworkErrorCodes } = await import('../../src/network/errors.js');
const { resetDatabase } = await import('../helpers/db.js');

const app = createApp();

const NETWORK = {
  interfaceName: 'en0',
  localIp: '192.168.50.37',
  localMac: 'da:a1:19:00:00:37',
  cidr: '192.168.50.0/24',
  sweepCidr: '192.168.50.0/24',
  sweepClamped: false,
  gatewayIp: '192.168.50.1',
  gatewayMac: 'a4:83:e7:00:01:01',
};
const PI_MAC = 'b8:27:eb:12:34:56';

const arpEntry = (ipAddress, macAddress) => ({ ipAddress, macAddress, interfaceName: 'en0' });

/** Gateway, a Raspberry Pi at `piIp` (or absent), and a host that answers but has no MAC. */
function makeScenario({ piIp = '192.168.50.20', overrides = {} } = {}) {
  const arp = [arpEntry('192.168.50.1', NETWORK.gatewayMac)];
  const responders = [
    { ipAddress: '192.168.50.1', latencyMs: 2.5 },
    { ipAddress: '192.168.50.77', latencyMs: 9 },
  ];
  if (piIp) {
    arp.push(arpEntry(piIp, PI_MAC));
    responders.push({ ipAddress: piIp, latencyMs: 5 });
  }
  return {
    detectNetwork: () => NETWORK,
    ping: () => ({ responders, probed: 253, errors: 0 }),
    nmapAvailable: false,
    nmap: () => [],
    arp: () => arp,
    hostnames: piIp ? { [piIp]: 'raspberrypi.lan' } : {},
    ...overrides,
  };
}

const discover = () => request(app).post('/api/devices/discover');

beforeEach(async () => {
  await resetDatabase();
  scenario.current = makeScenario();
});

afterAll(() => closePool());

describe('POST /api/devices/discover', () => {
  it('discovers, normalizes, and persists devices', async () => {
    const res = await discover().expect(200);
    const { data } = res.body;

    expect(res.body.error).toBeNull();
    expect(data.scan).toMatchObject({ status: 'completed', triggeredBy: 'manual' });
    expect(data.network).toMatchObject({
      cidr: '192.168.50.0/24',
      sweptRange: '192.168.50.0/24',
      interfaceName: 'en0',
      gatewayIpAddress: '192.168.50.1',
      gatewayMacAddress: NETWORK.gatewayMac,
    });
    expect(data.summary).toEqual({
      devicesFound: 3,
      newDevices: 3,
      ipChanges: 0,
      wentOffline: 0,
      unresolvedHosts: 1,
    });
    expect(data.unresolvedHosts).toEqual(['192.168.50.77']);
    expect(data.sources.nmap).toEqual({ status: 'unavailable', reason: 'nmap is not installed' });

    expect(data.devices.map((device) => [device.ipAddress, device.deviceType])).toEqual([
      ['192.168.50.1', 'router'],
      ['192.168.50.20', 'computer'],
      ['192.168.50.37', 'computer'],
    ]);
    expect(data.devices[1]).toEqual({
      id: expect.any(String),
      ipAddress: '192.168.50.20',
      macAddress: PI_MAC,
      macIsRandom: false,
      hostname: 'raspberrypi.lan',
      vendor: 'Raspberry Pi Foundation',
      deviceType: 'computer',
      status: 'online',
      latencyMs: 5,
      isGateway: false,
      isSelf: false,
      isNew: true,
      previousIpAddress: null,
      sources: ['arp', 'ping'],
      firstSeenAt: expect.any(String),
      lastSeenAt: expect.any(String),
    });

    const { rows } = await query(
      `SELECT (SELECT count(*) FROM devices WHERE status = 'online')::int AS online,
              (SELECT count(*) FROM device_observations)::int AS observations,
              (SELECT status FROM scans) AS scan_status`,
    );
    expect(rows[0]).toEqual({ online: 3, observations: 3, scan_status: 'completed' });
  });

  it('keeps one device when its IP changes but its MAC stays the same', async () => {
    const first = await discover().expect(200);
    const firstPi = first.body.data.devices.find((device) => device.macAddress === PI_MAC);

    scenario.current = makeScenario({ piIp: '192.168.50.21' });
    const second = await discover().expect(200);
    const secondPi = second.body.data.devices.find((device) => device.macAddress === PI_MAC);

    expect(second.body.data.summary).toMatchObject({ newDevices: 0, ipChanges: 1 });
    expect(secondPi).toMatchObject({
      id: firstPi.id,
      ipAddress: '192.168.50.21',
      previousIpAddress: '192.168.50.20',
      isNew: false,
      firstSeenAt: firstPi.firstSeenAt,
    });
    expect(new Date(secondPi.lastSeenAt) > new Date(firstPi.lastSeenAt)).toBe(true);

    const { rows } = await query('SELECT ip_address FROM devices WHERE mac_address = $1', [PI_MAC]);
    expect(rows).toEqual([{ ip_address: '192.168.50.21' }]);
    const history = await query(
      `SELECT o.ip_address FROM device_observations o JOIN devices d ON d.id = o.device_id
       WHERE d.mac_address = $1 ORDER BY o.observed_at`,
      [PI_MAC],
    );
    expect(history.rows.map((row) => row.ip_address)).toEqual(['192.168.50.20', '192.168.50.21']);
  });

  it('marks devices that were not seen again as offline', async () => {
    await discover().expect(200);

    scenario.current = makeScenario({ piIp: null });
    const res = await discover().expect(200);

    expect(res.body.data.summary).toMatchObject({ devicesFound: 2, wentOffline: 1 });
    const { rows } = await query('SELECT status FROM devices WHERE mac_address = $1', [PI_MAC]);
    expect(rows[0].status).toBe('offline');

    // …and back online when it returns.
    scenario.current = makeScenario();
    await discover().expect(200);
    const again = await query('SELECT status FROM devices WHERE mac_address = $1', [PI_MAC]);
    expect(again.rows[0].status).toBe('online');
  });

  it('never overwrites what the user set, or data this scan could not see', async () => {
    await discover().expect(200);
    await query(
      `UPDATE devices SET display_name = 'Pi-hole', device_type = 'server', is_trusted = true
       WHERE mac_address = $1`,
      [PI_MAC],
    );

    scenario.current = makeScenario({ overrides: { hostnames: {} } });
    await discover().expect(200);

    const { rows } = await query(
      'SELECT display_name, device_type, is_trusted, hostname FROM devices WHERE mac_address = $1',
      [PI_MAC],
    );
    expect(rows[0]).toEqual({
      display_name: 'Pi-hole',
      device_type: 'server',
      is_trusted: true,
      hostname: 'raspberrypi.lan',
    });
  });

  it('uses nmap results when nmap is available', async () => {
    scenario.current = makeScenario({
      overrides: {
        nmapAvailable: true,
        nmap: () => [{ ipAddress: '192.168.50.20', macAddress: null, vendor: null, latencyMs: 1 }],
      },
    });

    const res = await discover().expect(200);

    expect(res.body.data.sources.nmap).toMatchObject({ status: 'ok', responded: 1 });
    const pi = res.body.data.devices.find((device) => device.macAddress === PI_MAC);
    expect(pi.sources).toEqual(['arp', 'nmap', 'ping']);
  });

  it('carries on when an optional source fails', async () => {
    scenario.current = makeScenario({
      overrides: {
        nmapAvailable: true,
        nmap: () => {
          throw new NetworkError(NetworkErrorCodes.COMMAND_TIMEOUT, '"nmap" did not finish.');
        },
        ping: () => {
          throw new NetworkError(NetworkErrorCodes.TOOL_UNAVAILABLE, '"ping" is not installed.');
        },
      },
    });

    const res = await discover().expect(200);

    expect(res.body.data.sources.ping).toMatchObject({ status: 'unavailable' });
    expect(res.body.data.sources.nmap).toMatchObject({ status: 'failed' });
    // The ARP cache alone still identifies the devices.
    expect(res.body.data.summary.devicesFound).toBe(3);
  });

  it('fails the scan cleanly when the ARP table cannot be read', async () => {
    scenario.current = makeScenario({
      overrides: {
        arp: () => {
          throw new NetworkError(NetworkErrorCodes.TOOL_UNAVAILABLE, '"arp" is not installed.');
        },
      },
    });

    const res = await discover().expect(503);

    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'TOOL_UNAVAILABLE', message: '"arp" is not installed.' },
    });
    const { rows } = await query('SELECT status, error_code, finished_at FROM scans');
    expect(rows[0]).toMatchObject({ status: 'failed', error_code: 'TOOL_UNAVAILABLE' });
    expect(rows[0].finished_at).toBeInstanceOf(Date);
  });

  it('returns 503 NETWORK_UNAVAILABLE when no usable network is found', async () => {
    scenario.current = makeScenario({
      overrides: {
        detectNetwork: () => {
          throw new NetworkError(NetworkErrorCodes.NO_DEFAULT_GATEWAY, 'No default gateway found.');
        },
      },
    });

    const res = await discover().expect(503);

    expect(res.body.error).toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    const { rows } = await query('SELECT count(*)::int AS count FROM scans');
    expect(rows[0].count).toBe(0);
  });

  it('returns 409 SCAN_IN_PROGRESS while another scan is running', async () => {
    await query(
      `INSERT INTO scans (type, status, target, started_at)
       VALUES ('discovery', 'running', '192.168.50.0/24', now())`,
    );

    const res = await discover().expect(409);

    expect(res.body.error).toMatchObject({ code: 'SCAN_IN_PROGRESS' });
  });

  it('rejects any request input: the range always comes from the host', async () => {
    const res = await discover().send({ target: '8.8.8.0/24' }).expect(400);

    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ path: 'body', message: expect.stringContaining('target') }],
    });
    const { rows } = await query('SELECT count(*)::int AS count FROM scans');
    expect(rows[0].count).toBe(0);
  });

  it('cancels a running scan on shutdown and records it as cancelled', async () => {
    let pingStarted;
    const started = new Promise((resolve) => {
      pingStarted = resolve;
    });
    scenario.current = makeScenario({
      overrides: {
        ping: ({ signal }) =>
          new Promise((resolve, reject) => {
            pingStarted();
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          }),
      },
    });

    const pending = discover();
    const response = pending.then((res) => res);
    await started;
    cancelActiveDiscovery();
    const res = await response;

    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'SCAN_CANCELLED' });
    const { rows } = await query('SELECT status, error_code FROM scans');
    expect(rows[0]).toEqual({ status: 'cancelled', error_code: null });
  });
});
