import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool, query } from '../../src/db/pool.js';
import { insertDevice, insertNetwork, insertScan, resetDatabase } from '../helpers/db.js';

const app = createApp();

beforeEach(() => resetDatabase());
afterAll(() => closePool());

async function seedHomeNetwork() {
  const network = await insertNetwork({ gatewayMac: 'a4:83:e7:00:01:01' });
  await insertDevice(network.id, {
    macAddress: 'b8:27:eb:12:34:56',
    ipAddress: '192.168.1.20',
    deviceType: 'computer',
  });
  await insertDevice(network.id, { macAddress: 'a4:83:e7:00:01:01', ipAddress: '192.168.1.1' });
  const offline = await insertDevice(network.id, {
    macAddress: 'da:a1:19:00:00:99',
    ipAddress: '192.168.1.9',
  });
  await query("UPDATE devices SET status = 'offline' WHERE id = $1", [offline.id]);
  await insertScan({
    networkId: network.id,
    status: 'completed',
    startedAt: new Date(Date.now() - 2000),
    finishedAt: new Date(),
  });
  return network;
}

describe('GET /api/devices', () => {
  it('returns no network and no devices before the first discovery', async () => {
    const res = await request(app).get('/api/devices').expect(200);

    expect(res.body).toEqual({ success: true, data: { network: null, devices: [] }, error: null });
  });

  it('lists every device of the current network, online and offline, ordered by IP', async () => {
    const network = await seedHomeNetwork();

    const res = await request(app).get('/api/devices').expect(200);
    const { data } = res.body;

    expect(data.network).toEqual({
      id: network.id,
      name: null,
      cidr: '192.168.1.0/24',
      interfaceName: 'en0',
      gatewayIpAddress: '192.168.1.1',
      gatewayMacAddress: 'a4:83:e7:00:01:01',
      firstSeenAt: expect.any(String),
      lastSeenAt: expect.any(String),
      lastScan: { id: expect.any(String), finishedAt: expect.any(String) },
    });
    expect(
      data.devices.map((device) => [device.ipAddress, device.status, device.isGateway]),
    ).toEqual([
      ['192.168.1.1', 'online', true],
      ['192.168.1.9', 'offline', false],
      ['192.168.1.20', 'online', false],
    ]);
    expect(data.devices[2]).toEqual({
      id: expect.any(String),
      ipAddress: '192.168.1.20',
      macAddress: 'b8:27:eb:12:34:56',
      macIsRandom: false,
      hostname: null,
      vendor: null,
      deviceType: 'computer',
      displayName: null,
      isTrusted: false,
      status: 'online',
      isGateway: false,
      firstSeenAt: expect.any(String),
      lastSeenAt: expect.any(String),
    });
  });

  it('defaults to the most recently seen network', async () => {
    await seedHomeNetwork();
    const office = await insertNetwork({
      cidr: '10.0.0.0/24',
      gatewayIp: '10.0.0.1',
      gatewayMac: 'a4:83:e7:00:00:02',
    });
    await query("UPDATE networks SET last_seen_at = now() + interval '1 minute' WHERE id = $1", [
      office.id,
    ]);

    const res = await request(app).get('/api/devices').expect(200);

    expect(res.body.data.network).toMatchObject({ id: office.id, lastScan: null });
    expect(res.body.data.devices).toEqual([]);
  });

  it('selects a network by id', async () => {
    const network = await seedHomeNetwork();

    const res = await request(app).get(`/api/devices?networkId=${network.id}`).expect(200);

    expect(res.body.data.devices).toHaveLength(3);
  });

  it('returns 404 for an unknown network', async () => {
    const res = await request(app)
      .get('/api/devices?networkId=6f1c1c9e-6a4b-4a70-8a3c-0b3f7d0d8f55')
      .expect(404);

    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each([
    ['a malformed networkId', '?networkId=not-a-uuid', 'query.networkId'],
    ['an unknown parameter', '?sort=ip', 'query'],
  ])('rejects %s', async (_label, search, path) => {
    const res = await request(app).get(`/api/devices${search}`).expect(400);

    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path })],
    });
  });
});
