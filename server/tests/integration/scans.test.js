import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool, query } from '../../src/db/pool.js';
import {
  insertDevice,
  insertDeviceEvent,
  insertNetwork,
  insertObservation,
  insertScan,
  resetDatabase,
} from '../helpers/db.js';

const app = createApp();
const UNKNOWN_ID = '6f1c1c9e-6a4b-4a70-8a3c-0b3f7d0d8f55';

beforeEach(() => resetDatabase());
afterAll(() => closePool());

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000);

const discoverySummary = (overrides = {}) => ({
  devicesFound: 2,
  newDevices: 0,
  backOnline: 0,
  wentOffline: 0,
  missingDevices: 0,
  knownDevices: 2,
  ipChanges: 0,
  unresolvedHosts: 0,
  ...overrides,
});

/**
 * A network with a gateway, a Raspberry Pi, and a phone, and its history:
 *   50 min ago  discovery: finds all three (first scan)
 *   40 min ago  port scan of the Pi: 22 open
 *   30 min ago  discovery: the phone is missing (went offline), the Pi moved to .21
 *   20 min ago  discovery that failed
 *   10 min ago  discovery: the phone is back
 */
async function seedHistory() {
  const network = await insertNetwork({ gatewayMac: 'a4:83:e7:00:01:01' });
  const gateway = await insertDevice(network.id, {
    macAddress: 'a4:83:e7:00:01:01',
    ipAddress: '192.168.1.1',
    deviceType: 'router',
  });
  const pi = await insertDevice(network.id, {
    macAddress: 'b8:27:eb:12:34:56',
    ipAddress: '192.168.1.21',
    deviceType: 'computer',
  });
  const phone = await insertDevice(network.id, {
    macAddress: 'da:a1:19:00:00:09',
    ipAddress: '192.168.1.9',
    deviceType: 'phone',
  });
  await query(
    `UPDATE devices SET first_seen_at = $1, hostname = CASE WHEN id = $2 THEN 'raspberrypi.lan' END`,
    [minutesAgo(51), pi.id],
  );

  // Each scan takes 6 s.
  const at = (minutes, extra = {}) => {
    const startedAt = minutesAgo(minutes);
    return {
      networkId: network.id,
      status: 'completed',
      startedAt,
      finishedAt: new Date(startedAt.getTime() + 6_000),
      ...extra,
    };
  };
  const first = await insertScan(
    at(50, { summary: discoverySummary({ devicesFound: 3, newDevices: 3, knownDevices: 3 }) }),
  );
  const portScan = await insertScan(
    at(40, {
      type: 'port',
      target: '192.168.1.20',
      targetDeviceId: pi.id,
      summary: { portsChecked: 63, open: 1, closed: 62, filtered: 0, openPorts: [22] },
    }),
  );
  const missed = await insertScan(
    at(30, {
      summary: discoverySummary({
        wentOffline: 1,
        missingDevices: 1,
        knownDevices: 3,
        ipChanges: 1,
      }),
    }),
  );
  const failed = await insertScan(
    at(20, {
      status: 'failed',
      errorCode: 'NETWORK_UNAVAILABLE',
      errorMessage: 'No usable network.',
    }),
  );
  const back = await insertScan(
    at(10, { summary: discoverySummary({ devicesFound: 3, backOnline: 1, knownDevices: 3 }) }),
  );

  const observe = (scan, device, ipAddress, latencyMs = 3) =>
    insertObservation({
      scanId: scan.id,
      deviceId: device.id,
      ipAddress,
      latencyMs,
      observedAt: new Date(scan.finished_at),
    });
  await observe(first, gateway, '192.168.1.1');
  await observe(first, pi, '192.168.1.20');
  await observe(first, phone, '192.168.1.9', 12);
  await observe(missed, gateway, '192.168.1.1');
  await observe(missed, pi, '192.168.1.21');
  await observe(back, gateway, '192.168.1.1');
  await observe(back, pi, '192.168.1.21');
  await observe(back, phone, '192.168.1.9', 15);

  for (const device of [gateway, pi, phone]) {
    await insertDeviceEvent({
      deviceId: device.id,
      scanId: first.id,
      type: 'discovered',
      ipAddress: device.ip_address,
      occurredAt: first.finished_at,
    });
  }
  await insertDeviceEvent({
    deviceId: phone.id,
    scanId: missed.id,
    type: 'offline',
    ipAddress: '192.168.1.9',
    occurredAt: missed.finished_at,
  });
  await insertDeviceEvent({
    deviceId: pi.id,
    scanId: missed.id,
    type: 'updated',
    ipAddress: '192.168.1.21',
    changes: { ipAddress: { from: '192.168.1.20', to: '192.168.1.21' } },
    occurredAt: missed.finished_at,
  });
  await insertDeviceEvent({
    deviceId: phone.id,
    scanId: back.id,
    type: 'online',
    ipAddress: '192.168.1.9',
    occurredAt: back.finished_at,
  });

  const port = await query(
    `INSERT INTO device_ports (device_id, port, service_name, first_seen_at, last_seen_at)
     VALUES ($1, 22, 'ssh', $2, $2) RETURNING id`,
    [pi.id, portScan.finished_at],
  );
  await query(
    `INSERT INTO port_scan_results (scan_id, device_port_id, state, service_name, service_product,
                                    service_version, observed_at)
     VALUES ($1, $2, 'open', 'ssh', 'OpenSSH', '9.2p1', $3)`,
    [portScan.id, port.rows[0].id, portScan.finished_at],
  );

  return { network, gateway, pi, phone, scans: { first, portScan, missed, failed, back } };
}

const ids = (res) => res.body.data.map((scan) => scan.id);

describe('GET /api/scans', () => {
  it('lists every scan, newest first, with its outcome', async () => {
    const { network, pi, scans } = await seedHistory();

    const res = await request(app).get('/api/scans').expect(200);

    expect(ids(res)).toEqual(
      ['back', 'failed', 'missed', 'portScan', 'first'].map((name) => scans[name].id),
    );
    expect(res.body.meta).toEqual({ limit: 20, nextCursor: null });
    expect(res.body.data[0]).toEqual({
      id: scans.back.id,
      type: 'discovery',
      status: 'completed',
      triggeredBy: 'manual',
      target: '192.168.1.0/24',
      network: { id: network.id, cidr: '192.168.1.0/24' },
      device: null,
      createdAt: expect.any(String),
      startedAt: expect.any(String),
      finishedAt: expect.any(String),
      durationMs: 6_000,
      error: null,
      summary: discoverySummary({ devicesFound: 3, backOnline: 1, knownDevices: 3 }),
    });
    expect(res.body.data[1]).toMatchObject({
      status: 'failed',
      error: { code: 'NETWORK_UNAVAILABLE', message: 'No usable network.' },
      summary: null,
    });
    // A port scan names the device it checked.
    expect(res.body.data[3]).toMatchObject({
      type: 'port',
      target: '192.168.1.20',
      device: {
        id: pi.id,
        ipAddress: '192.168.1.21',
        macAddress: 'b8:27:eb:12:34:56',
        hostname: 'raspberrypi.lan',
        displayName: null,
        vendor: null,
        deviceType: 'computer',
        isGateway: false,
      },
      summary: { open: 1, openPorts: [22] },
    });
  });

  it('filters by type, status, network, and device', async () => {
    const { network, pi, scans } = await seedHistory();
    const other = await insertNetwork({ gatewayMac: 'a4:83:e7:00:02:02' });
    await insertScan({ networkId: other.id, status: 'cancelled', finishedAt: new Date() });

    const discoveries = await request(app).get('/api/scans?type=discovery').expect(200);
    expect(discoveries.body.data.every((scan) => scan.type === 'discovery')).toBe(true);
    expect(discoveries.body.data).toHaveLength(5);

    const failed = await request(app).get('/api/scans?status=failed').expect(200);
    expect(ids(failed)).toEqual([scans.failed.id]);

    const onNetwork = await request(app)
      .get(`/api/scans?networkId=${network.id}&type=discovery`)
      .expect(200);
    expect(onNetwork.body.data).toHaveLength(4);

    const ofDevice = await request(app).get(`/api/scans?deviceId=${pi.id}`).expect(200);
    expect(ids(ofDevice)).toEqual([scans.portScan.id]);

    const none = await request(app).get(`/api/scans?networkId=${UNKNOWN_ID}`).expect(200);
    expect(none.body.data).toEqual([]);
  });

  it('pages through the history with a cursor, without gaps or repeats', async () => {
    const { scans } = await seedHistory();

    const first = await request(app).get('/api/scans?limit=2').expect(200);
    expect(ids(first)).toEqual([scans.back.id, scans.failed.id]);
    expect(first.body.meta).toEqual({ limit: 2, nextCursor: scans.failed.id });

    const second = await request(app)
      .get(`/api/scans?limit=2&before=${first.body.meta.nextCursor}`)
      .expect(200);
    expect(ids(second)).toEqual([scans.missed.id, scans.portScan.id]);

    const last = await request(app)
      .get(`/api/scans?limit=2&before=${second.body.meta.nextCursor}`)
      .expect(200);
    expect(ids(last)).toEqual([scans.first.id]);
    expect(last.body.meta.nextCursor).toBeNull();
  });

  it.each([
    ['an unknown type', 'type=arp'],
    ['an unknown status', 'status=done'],
    ['a malformed network id', 'networkId=42'],
    ['a limit outside 1–100', 'limit=0'],
    ['a malformed cursor', 'before=1234'],
    ['an unknown parameter', 'sort=duration'],
  ])('rejects %s with 400', async (_, queryString) => {
    const res = await request(app).get(`/api/scans?${queryString}`).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/scans/:scanId', () => {
  it('shows what a discovery found, what it missed, and what changed', async () => {
    const { network, gateway, pi, phone, scans } = await seedHistory();

    const res = await request(app).get(`/api/scans/${scans.missed.id}`).expect(200);
    const { data } = res.body;

    expect(data.scan).toMatchObject({
      id: scans.missed.id,
      type: 'discovery',
      status: 'completed',
      network: { id: network.id, cidr: '192.168.1.0/24', interfaceName: 'en0' },
      params: {},
      summary: { wentOffline: 1, missingDevices: 1 },
    });
    // Neighbours among the network's discoveries; the port scan is not one of them.
    expect(data.previous).toEqual({ id: scans.first.id, createdAt: expect.any(String) });
    expect(data.next).toEqual({ id: scans.failed.id, createdAt: expect.any(String) });

    expect(data.results.found).toEqual([
      {
        device: expect.objectContaining({ id: gateway.id, isGateway: true, isSelf: false }),
        ipAddress: '192.168.1.1',
        hostname: null,
        latencyMs: 3,
        isNew: false,
        backOnline: false,
        changes: {},
      },
      {
        device: expect.objectContaining({ id: pi.id, hostname: 'raspberrypi.lan' }),
        ipAddress: '192.168.1.21',
        hostname: null,
        latencyMs: 3,
        isNew: false,
        backOnline: false,
        changes: { ipAddress: { from: '192.168.1.20', to: '192.168.1.21' } },
      },
    ]);
    expect(data.results.missing).toEqual([
      {
        device: expect.objectContaining({ id: phone.id, deviceType: 'phone' }),
        wentOffline: true,
        lastSeenAt: scans.first.finished_at.toISOString(),
        lastIpAddress: '192.168.1.9',
      },
    ]);
  });

  it('marks new and returning devices', async () => {
    const { phone, scans } = await seedHistory();

    const first = await request(app).get(`/api/scans/${scans.first.id}`).expect(200);
    expect(first.body.data.previous).toBeNull();
    expect(first.body.data.results.found.every((entry) => entry.isNew)).toBe(true);
    expect(first.body.data.results.missing).toEqual([]);

    const back = await request(app).get(`/api/scans/${scans.back.id}`).expect(200);
    expect(back.body.data.next).toBeNull();
    expect(
      back.body.data.results.found.find((entry) => entry.device.id === phone.id),
    ).toMatchObject({ backOnline: true, isNew: false, latencyMs: 15 });
  });

  it('shows the ports a port scan saw', async () => {
    const { pi, scans } = await seedHistory();

    const res = await request(app).get(`/api/scans/${scans.portScan.id}`).expect(200);

    expect(res.body.data.scan).toMatchObject({ type: 'port', device: { id: pi.id } });
    expect(res.body.data.previous).toBeNull();
    expect(res.body.data.next).toBeNull();
    expect(res.body.data.results.ports).toEqual([
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        service: 'ssh',
        product: 'OpenSSH',
        version: '9.2p1',
        firstSeenOpenAt: expect.any(String),
        lastSeenOpenAt: expect.any(String),
        isNew: true,
      },
    ]);
  });

  it('has no results for a scan that did not complete', async () => {
    const { scans } = await seedHistory();

    const res = await request(app).get(`/api/scans/${scans.failed.id}`).expect(200);

    expect(res.body.data.scan.error).toEqual({
      code: 'NETWORK_UNAVAILABLE',
      message: 'No usable network.',
    });
    expect(res.body.data.results).toBeNull();
  });

  it('returns 404 for an unknown scan and 400 for a malformed id', async () => {
    const missing = await request(app).get(`/api/scans/${UNKNOWN_ID}`).expect(404);
    expect(missing.body.error).toMatchObject({
      code: 'NOT_FOUND',
      details: { scanId: UNKNOWN_ID },
    });

    const malformed = await request(app).get('/api/scans/latest').expect(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });
});
