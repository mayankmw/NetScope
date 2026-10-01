import os from 'node:os';
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

/**
 * A Raspberry Pi first seen 60 minutes ago at .20, missed by the next scan (offline), then back
 * at .21. Three completed discoveries: seen, not seen, seen.
 */
async function seedPi() {
  const network = await insertNetwork({ gatewayMac: 'a4:83:e7:00:01:01' });
  const device = await insertDevice(network.id, {
    macAddress: 'b8:27:eb:12:34:56',
    ipAddress: '192.168.1.21',
    deviceType: 'computer',
  });
  await query(
    `UPDATE devices SET hostname = 'raspberrypi.lan', vendor = 'Raspberry Pi Foundation',
                        first_seen_at = $2, last_seen_at = $3
     WHERE id = $1`,
    [device.id, minutesAgo(60), minutesAgo(20)],
  );

  const scans = [];
  for (const minutes of [60, 40, 20]) {
    scans.push(
      await insertScan({
        networkId: network.id,
        status: 'completed',
        startedAt: minutesAgo(minutes),
        finishedAt: minutesAgo(minutes),
      }),
    );
  }
  await insertObservation({
    scanId: scans[0].id,
    deviceId: device.id,
    ipAddress: '192.168.1.20',
    latencyMs: 4,
    observedAt: minutesAgo(60),
  });
  await insertObservation({
    scanId: scans[2].id,
    deviceId: device.id,
    ipAddress: '192.168.1.21',
    latencyMs: 2,
    observedAt: minutesAgo(20),
  });

  const events = [
    { type: 'discovered', scan: 0, minutes: 60, ipAddress: '192.168.1.20' },
    { type: 'offline', scan: 1, minutes: 40, ipAddress: '192.168.1.20' },
    { type: 'online', scan: 2, minutes: 20, ipAddress: '192.168.1.21' },
    {
      type: 'updated',
      scan: 2,
      minutes: 20,
      ipAddress: '192.168.1.21',
      changes: { ipAddress: { from: '192.168.1.20', to: '192.168.1.21' } },
    },
  ];
  for (const event of events) {
    await insertDeviceEvent({
      deviceId: device.id,
      scanId: scans[event.scan].id,
      type: event.type,
      ipAddress: event.ipAddress,
      changes: event.changes,
      occurredAt: minutesAgo(event.minutes),
    });
  }
  return { network, device, scans };
}

describe('GET /api/devices/:deviceId', () => {
  it('returns the device with its network, presence, and IP history', async () => {
    const { network, device } = await seedPi();

    const res = await request(app).get(`/api/devices/${device.id}`).expect(200);
    const { data } = res.body;

    expect(data.device).toEqual({
      id: device.id,
      ipAddress: '192.168.1.21',
      macAddress: 'b8:27:eb:12:34:56',
      macIsRandom: false,
      hostname: 'raspberrypi.lan',
      vendor: 'Raspberry Pi Foundation',
      deviceType: 'computer',
      displayName: null,
      isTrusted: false,
      status: 'online',
      isGateway: false,
      isSelf: false,
      firstSeenAt: expect.any(String),
      lastSeenAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(data.network).toMatchObject({
      id: network.id,
      cidr: '192.168.1.0/24',
      interfaceName: 'en0',
      lastScan: { id: expect.any(String), finishedAt: expect.any(String) },
    });
    expect(data.presence).toEqual({
      statusSince: expect.any(String),
      timesSeen: 2,
      scansSinceFirstSeen: 3,
      lastLatencyMs: 2,
      averageLatencyMs: 3,
      latencySamples: 2,
    });
    // The device came back online 20 minutes ago.
    expect(Math.abs(new Date(data.presence.statusSince) - minutesAgo(20))).toBeLessThan(5_000);
    expect(data.ipHistory).toEqual([
      {
        ipAddress: '192.168.1.21',
        firstSeenAt: expect.any(String),
        lastSeenAt: expect.any(String),
        timesSeen: 1,
      },
      {
        ipAddress: '192.168.1.20',
        firstSeenAt: expect.any(String),
        lastSeenAt: expect.any(String),
        timesSeen: 1,
      },
    ]);
    expect(data.localInterface).toBeNull();
  });

  it('flags the gateway', async () => {
    const network = await insertNetwork({ gatewayMac: 'a4:83:e7:00:01:01' });
    const gateway = await insertDevice(network.id, {
      macAddress: 'a4:83:e7:00:01:01',
      ipAddress: '192.168.1.1',
    });

    const res = await request(app).get(`/api/devices/${gateway.id}`).expect(200);

    expect(res.body.data.device).toMatchObject({ isGateway: true, isSelf: false });
    expect(res.body.data.presence).toMatchObject({
      timesSeen: 0,
      statusSince: null,
      lastLatencyMs: null,
      averageLatencyMs: null,
    });
    expect(res.body.data.ipHistory).toEqual([]);
  });

  // Recognizing the NetScope host needs a real interface MAC on the machine running the tests.
  const ownMac = Object.values(os.networkInterfaces())
    .flat()
    .find((address) => !address.internal && address.mac !== '00:00:00:00:00:00')?.mac;

  it.skipIf(!ownMac)(
    'recognizes the machine NetScope runs on and shows its interface',
    async () => {
      const network = await insertNetwork();
      const self = await insertDevice(network.id, {
        macAddress: ownMac,
        ipAddress: '192.168.1.37',
      });

      const res = await request(app).get(`/api/devices/${self.id}`).expect(200);

      expect(res.body.data.device.isSelf).toBe(true);
      expect(res.body.data.localInterface).toEqual({
        name: expect.any(String),
        macAddress: ownMac.toLowerCase(),
        addresses: expect.arrayContaining([
          expect.objectContaining({ family: expect.stringMatching(/^IPv[46]$/) }),
        ]),
      });
    },
  );

  it('returns 404 for an unknown device', async () => {
    const res = await request(app).get(`/api/devices/${UNKNOWN_ID}`).expect(404);

    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Device not found.', details: { deviceId: UNKNOWN_ID } },
    });
  });

  it.each([
    ['a malformed id', '/api/devices/not-a-uuid', 'params.deviceId'],
    ['an unknown query parameter', `/api/devices/${UNKNOWN_ID}?expand=all`, 'query'],
  ])('rejects %s', async (_label, url, path) => {
    const res = await request(app).get(url).expect(400);

    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path })],
    });
  });
});

describe('GET /api/devices/:deviceId/events', () => {
  it('returns the timeline newest first, one page at a time', async () => {
    const { device, scans } = await seedPi();

    const first = await request(app).get(`/api/devices/${device.id}/events?limit=2`).expect(200);

    expect(first.body.data.map((event) => event.type)).toEqual(['updated', 'online']);
    expect(first.body.data[0]).toEqual({
      id: expect.any(String),
      type: 'updated',
      occurredAt: expect.any(String),
      ipAddress: '192.168.1.21',
      changes: { ipAddress: { from: '192.168.1.20', to: '192.168.1.21' } },
      scanId: scans[2].id,
    });
    expect(first.body.meta).toEqual({ limit: 2, nextCursor: first.body.data[1].id });

    const second = await request(app)
      .get(`/api/devices/${device.id}/events?limit=2&before=${first.body.meta.nextCursor}`)
      .expect(200);

    expect(second.body.data.map((event) => event.type)).toEqual(['offline', 'discovered']);
    expect(second.body.meta).toEqual({ limit: 2, nextCursor: null });
  });

  it('returns an empty page for a device without events', async () => {
    const network = await insertNetwork();
    const device = await insertDevice(network.id);

    const res = await request(app).get(`/api/devices/${device.id}/events`).expect(200);

    expect(res.body).toEqual({
      success: true,
      data: [],
      error: null,
      meta: { limit: 20, nextCursor: null },
    });
  });

  it('returns 404 for an unknown device', async () => {
    const res = await request(app).get(`/api/devices/${UNKNOWN_ID}/events`).expect(404);

    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('GET /api/devices/:deviceId/observations', () => {
  it('returns the scans that saw the device, newest first, one page at a time', async () => {
    const { device, scans } = await seedPi();

    const first = await request(app)
      .get(`/api/devices/${device.id}/observations?limit=1`)
      .expect(200);

    expect(first.body.data).toEqual([
      {
        id: expect.any(String),
        observedAt: expect.any(String),
        ipAddress: '192.168.1.21',
        hostname: null,
        latencyMs: 2,
        scanId: scans[2].id,
        triggeredBy: 'manual',
      },
    ]);
    expect(first.body.meta.nextCursor).toBe(first.body.data[0].id);

    const second = await request(app)
      .get(`/api/devices/${device.id}/observations?limit=1&before=${first.body.meta.nextCursor}`)
      .expect(200);

    expect(second.body.data).toEqual([
      expect.objectContaining({ ipAddress: '192.168.1.20', scanId: scans[0].id }),
    ]);
    expect(second.body.meta.nextCursor).toBeNull();
  });

  it('returns 404 for an unknown device', async () => {
    await request(app).get(`/api/devices/${UNKNOWN_ID}/observations`).expect(404);
  });

  it.each([
    ['a limit of 0', '?limit=0', 'query.limit'],
    ['a limit over 100', '?limit=101', 'query.limit'],
    ['a malformed cursor', '?before=abc', 'query.before'],
    ['an unknown parameter', '?sort=asc', 'query'],
  ])('rejects %s', async (_label, search, path) => {
    const res = await request(app)
      .get(`/api/devices/${UNKNOWN_ID}/observations${search}`)
      .expect(400);

    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path })],
    });
  });
});

describe('GET /api/devices/:deviceId/history', () => {
  it('returns online and offline periods, and which scans saw the device', async () => {
    const { device, scans } = await seedPi();

    const res = await request(app).get(`/api/devices/${device.id}/history`).expect(200);
    const { data } = res.body;

    expect(data.range.days).toBe(30);
    expect(new Date(data.range.to) - new Date(data.range.from)).toBe(30 * 24 * 60 * 60 * 1000);
    expect(data.status).toBe('online');
    // Seen at the first scan, missed by the second, back at the third (still online).
    expect(data.periods).toEqual([
      { status: 'online', from: expect.any(String), to: expect.any(String), scanId: scans[0].id },
      { status: 'offline', from: expect.any(String), to: expect.any(String), scanId: scans[1].id },
      { status: 'online', from: expect.any(String), to: null, scanId: scans[2].id },
    ]);
    expect(data.periods[0].to).toBe(data.periods[1].from);
    expect(data.scans.total).toBe(3);
    expect(data.scans.seen).toBe(2);
    expect(data.scans.items).toEqual([
      {
        id: scans[2].id,
        finishedAt: expect.any(String),
        triggeredBy: 'manual',
        seen: true,
        ipAddress: '192.168.1.21',
        latencyMs: 2,
      },
      {
        id: scans[1].id,
        finishedAt: expect.any(String),
        triggeredBy: 'manual',
        seen: false,
        ipAddress: null,
        latencyMs: null,
      },
      expect.objectContaining({ id: scans[0].id, seen: true, ipAddress: '192.168.1.20' }),
    ]);
  });

  it('starts at the requested range, with the status the device had then', async () => {
    const { device, scans } = await seedPi();
    // Move the history back in time: discovered 3 days ago, offline 2 days ago, back 1 hour ago.
    await query(
      `UPDATE device_events SET occurred_at = occurred_at - interval '3 days'
                 WHERE device_id = $1 AND type = 'discovered'`,
      [device.id],
    );
    await query(
      `UPDATE device_events SET occurred_at = occurred_at - interval '2 days'
                 WHERE device_id = $1 AND type = 'offline'`,
      [device.id],
    );

    const res = await request(app).get(`/api/devices/${device.id}/history?days=1`).expect(200);

    expect(res.body.data.range.days).toBe(1);
    expect(res.body.data.periods.map((period) => [period.status, period.scanId])).toEqual([
      ['offline', null],
      ['online', scans[2].id],
    ]);
    expect(res.body.data.periods[0].from).toBe(res.body.data.range.from);
  });

  it('returns 404 for an unknown device', async () => {
    const res = await request(app).get(`/api/devices/${UNKNOWN_ID}/history`).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it.each([
    ['0 days', '?days=0'],
    ['more than 90 days', '?days=91'],
    ['a fractional number of days', '?days=1.5'],
    ['an unknown parameter', '?from=2026-01-01'],
  ])('rejects %s', async (_label, search) => {
    const res = await request(app).get(`/api/devices/${UNKNOWN_ID}/history${search}`).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
