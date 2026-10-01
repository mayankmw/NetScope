import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The OS-facing parts of the network layer are replaced by a scripted network, as in
// discovery.test.js. Discovery, alert rules, deduplication, and SQL are real.
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
    pingSweep: vi.fn(async () => scenario.current.ping()),
    isToolAvailable: vi.fn(async () => false),
    nmapHostDiscovery: vi.fn(async () => []),
    lookupHostnames: vi.fn(async () => new Map(Object.entries(scenario.current.hostnames))),
  };
});

const { createApp } = await import('../../src/app.js');
const { closePool, query } = await import('../../src/db/pool.js');
const { insertAlert, insertDevice, insertNetwork, resetDatabase } =
  await import('../helpers/db.js');
const { eventBus } = await import('../../src/events/eventBus.js');

const app = createApp();
const UNKNOWN_ID = '6f1c1c9e-6a4b-4a70-8a3c-0b3f7d0d8f55';

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
const GATEWAY = { ip: '192.168.50.1', mac: NETWORK.gatewayMac };
const PI = { ip: '192.168.50.20', mac: 'b8:27:eb:12:34:56', hostname: 'raspberrypi.lan' };
const PLUG = { ip: '192.168.50.77', mac: '24:6f:28:00:00:77' };

/** A network where exactly `devices` answer (plus this computer, which discovery adds itself). */
function network(devices, { localMac = NETWORK.localMac } = {}) {
  return {
    detectNetwork: () => ({ ...NETWORK, localMac }),
    ping: () => ({
      responders: devices.map((device) => ({ ipAddress: device.ip, latencyMs: 3 })),
      probed: 253,
      errors: 0,
    }),
    arp: () =>
      devices.map((device) => ({
        ipAddress: device.ip,
        macAddress: device.mac,
        interfaceName: 'en0',
      })),
    hostnames: Object.fromEntries(
      devices.filter((device) => device.hostname).map((device) => [device.ip, device.hostname]),
    ),
  };
}

async function discover(devices, options) {
  scenario.current = network(devices, options);
  events = [];
  const res = await request(app).post('/api/devices/discover').expect(200);
  return res.body.data;
}

const classifications = (data) =>
  Object.fromEntries(data.devices.map((device) => [device.ipAddress, device.classification]));
const alertEvents = () => events.filter((event) => event.type.startsWith('alert'));
const deviceId = (data, mac) => data.devices.find((device) => device.macAddress === mac).id;
const listAlerts = async (search = '') =>
  (await request(app).get(`/api/alerts${search}`).expect(200)).body.data;

let events = [];
const unsubscribe = eventBus.subscribe((event) => events.push(event));

beforeEach(async () => {
  await resetDatabase();
  events = [];
});

afterAll(async () => {
  unsubscribe();
  await closePool();
});

describe('alerts raised by discovery', () => {
  it('records the first scan of a network as its baseline, without alerts', async () => {
    const data = await discover([GATEWAY, PI]);

    expect(Object.values(classifications(data))).toEqual(['new', 'new', 'new']);
    expect(data.alerts).toEqual({ created: [], updated: [] });
    expect(alertEvents()).toEqual([]);
    expect(await listAlerts()).toEqual([]);
  });

  it('newly discovered device: one warning, announced live, never repeated', async () => {
    await discover([GATEWAY, PI]);

    const data = await discover([GATEWAY, PI, PLUG]);

    expect(classifications(data)).toEqual({
      '192.168.50.1': 'known',
      '192.168.50.20': 'known',
      '192.168.50.37': 'known',
      '192.168.50.77': 'new',
    });
    const plugId = deviceId(data, PLUG.mac);
    expect(data.alerts.created).toEqual([
      {
        id: expect.any(String),
        type: 'new_device',
        severity: 'warning',
        status: 'unread',
        message:
          'New device on the network: Espressif Inc. device at 192.168.50.77 (MAC 24:6f:28:00:00:77).',
        network: { id: data.network.id, cidr: '192.168.50.0/24' },
        device: expect.objectContaining({ id: plugId, ipAddress: '192.168.50.77' }),
        scanId: data.scan.id,
        context: expect.objectContaining({ macAddress: PLUG.mac, vendor: 'Espressif Inc.' }),
        occurrences: 1,
        createdAt: expect.any(String),
        lastOccurredAt: expect.any(String),
        readAt: null,
        resolvedAt: null,
        updatedAt: expect.any(String),
      },
    ]);
    expect(events.map((event) => event.type)).toEqual([
      'discovery.started',
      'device.discovered',
      'alert.created',
      'discovery.completed',
    ]);
    // As clients receive it (JSON).
    expect(JSON.parse(JSON.stringify(alertEvents()[0].data))).toEqual({
      alert: data.alerts.created[0],
      counts: { unread: 1, read: 0, resolved: 0 },
    });

    // Seen again: it is a known device now.
    const again = await discover([GATEWAY, PI, PLUG]);
    expect(classifications(again)['192.168.50.77']).toBe('known');
    expect(alertEvents()).toEqual([]);
    expect(await listAlerts()).toHaveLength(1);
  });

  it('known device: no alert when nothing changed', async () => {
    await discover([GATEWAY, PI]);

    const data = await discover([GATEWAY, PI]);

    expect(Object.values(classifications(data))).toEqual(['known', 'known', 'known']);
    expect(data.alerts).toEqual({ created: [], updated: [] });
    expect(alertEvents()).toEqual([]);
  });

  it('device changing IP: one alert, and repeats update it instead of adding more', async () => {
    await discover([GATEWAY, PI]);

    const moved = await discover([GATEWAY, { ...PI, ip: '192.168.50.21' }]);
    expect(classifications(moved)['192.168.50.21']).toBe('ip_changed');
    expect(moved.alerts.created).toEqual([
      expect.objectContaining({
        type: 'ip_changed',
        severity: 'info',
        message: 'raspberrypi.lan moved from 192.168.50.20 to 192.168.50.21.',
      }),
    ]);

    const movedAgain = await discover([GATEWAY, { ...PI, ip: '192.168.50.22' }]);
    expect(movedAgain.alerts.created).toEqual([]);
    expect(alertEvents().map((event) => [event.type, event.data.reason])).toEqual([
      ['alert.updated', 'repeated'],
    ]);
    const [alert] = await listAlerts();
    expect(alert).toMatchObject({
      id: moved.alerts.created[0].id,
      status: 'unread',
      occurrences: 2,
      message: 'raspberrypi.lan moved from 192.168.50.21 to 192.168.50.22.',
      context: { ipAddress: '192.168.50.22', previousIpAddress: '192.168.50.21' },
    });
    expect(new Date(alert.lastOccurredAt) > new Date(alert.createdAt)).toBe(true);
  });

  it('device returning online: no alert after a short absence', async () => {
    await discover([GATEWAY, PI]);
    await discover([GATEWAY]); // the Pi went offline

    const back = await discover([GATEWAY, PI]);

    expect(classifications(back)['192.168.50.20']).toBe('returned');
    expect(back.alerts).toEqual({ created: [], updated: [] });
  });

  it('device returning online: an alert after a long absence, with its new address', async () => {
    const first = await discover([GATEWAY, PI]);
    await discover([GATEWAY]);
    // Last seen three days ago.
    await query(
      `UPDATE devices SET first_seen_at = now() - interval '4 days',
                          last_seen_at = now() - interval '3 days'
       WHERE id = $1`,
      [deviceId(first, PI.mac)],
    );

    const back = await discover([GATEWAY, { ...PI, ip: '192.168.50.21' }]);

    expect(classifications(back)['192.168.50.21']).toBe('returned');
    expect(back.alerts.created).toEqual([
      expect.objectContaining({
        type: 'device_returned',
        severity: 'info',
        message:
          'raspberrypi.lan is back online at 192.168.50.21 after 3 days away (it was at 192.168.50.20).',
      }),
    ]);
  });

  it('keeps a resolved alert quiet for the cooldown, then raises it again', async () => {
    await discover([GATEWAY, PI]);
    const moved = await discover([GATEWAY, { ...PI, ip: '192.168.50.21' }]);
    const alertId = moved.alerts.created[0].id;
    await request(app).patch(`/api/alerts/${alertId}`).send({ status: 'resolved' }).expect(200);

    const quiet = await discover([GATEWAY, { ...PI, ip: '192.168.50.22' }]);
    expect(quiet.alerts).toEqual({ created: [], updated: [] });
    expect(await listAlerts('?status=open')).toEqual([]);

    // The cooldown (24 h by default) has passed.
    await query(`UPDATE alerts SET resolved_at = now() - interval '2 days' WHERE id = $1`, [
      alertId,
    ]);
    const again = await discover([GATEWAY, { ...PI, ip: '192.168.50.23' }]);
    expect(again.alerts.created).toEqual([expect.objectContaining({ type: 'ip_changed' })]);
    expect(again.alerts.created[0].id).not.toBe(alertId);
  });

  it('never alerts about the computer NetScope runs on', async () => {
    await discover([GATEWAY, PI]);

    // This computer joined with another network adapter (a new MAC).
    const data = await discover([GATEWAY, PI], { localMac: 'da:a1:19:00:00:99' });

    expect(classifications(data)['192.168.50.37']).toBe('new');
    expect(data.alerts.created).toEqual([]);
  });
});

/** A network with a gateway and a phone, and three alerts: unread, read, resolved (oldest). */
async function seedAlerts() {
  const net = await insertNetwork({ cidr: '192.168.50.0/24', gatewayIp: '192.168.50.1' });
  const phone = await insertDevice(net.id, {
    macAddress: 'da:a1:19:00:00:09',
    ipAddress: '192.168.50.9',
  });
  const at = (minutes) => new Date(Date.now() - minutes * 60_000);
  const resolved = await insertAlert({
    networkId: net.id,
    deviceId: phone.id,
    type: 'ip_changed',
    severity: 'info',
    status: 'resolved',
    createdAt: at(30),
  });
  const read = await insertAlert({
    networkId: net.id,
    deviceId: phone.id,
    type: 'device_returned',
    severity: 'info',
    status: 'read',
    createdAt: at(20),
  });
  const unread = await insertAlert({ networkId: net.id, deviceId: phone.id, createdAt: at(10) });
  return { net, phone, alerts: { unread, read, resolved } };
}

const ids = (items) => items.map((item) => item.id);

describe('GET /api/alerts', () => {
  it('lists alerts newest first, with filters and cursor pages', async () => {
    const { phone, alerts } = await seedAlerts();

    expect(ids(await listAlerts())).toEqual([alerts.unread.id, alerts.read.id, alerts.resolved.id]);
    expect(ids(await listAlerts('?status=open'))).toEqual([alerts.unread.id, alerts.read.id]);
    expect(ids(await listAlerts('?status=unread'))).toEqual([alerts.unread.id]);
    expect(ids(await listAlerts('?status=resolved'))).toEqual([alerts.resolved.id]);
    expect(ids(await listAlerts('?type=device_returned'))).toEqual([alerts.read.id]);
    expect(await listAlerts(`?deviceId=${phone.id}`)).toHaveLength(3);
    expect(await listAlerts(`?deviceId=${UNKNOWN_ID}`)).toEqual([]);

    const first = await request(app).get('/api/alerts?limit=2').expect(200);
    expect(first.body.meta).toEqual({ limit: 2, nextCursor: alerts.read.id });
    const second = await request(app)
      .get(`/api/alerts?limit=2&before=${first.body.meta.nextCursor}`)
      .expect(200);
    expect(ids(second.body.data)).toEqual([alerts.resolved.id]);
    expect(second.body.meta.nextCursor).toBeNull();
  });

  it.each([
    ['an unknown status', 'status=done'],
    ['an unknown type', 'type=new_open_port'],
    ['a malformed cursor', 'before=12'],
    ['an unknown parameter', 'sort=severity'],
  ])('rejects %s with 400', async (_, search) => {
    const res = await request(app).get(`/api/alerts?${search}`).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/alerts/summary', () => {
  it('counts alerts by state and describes the rules', async () => {
    await seedAlerts();

    const res = await request(app).get('/api/alerts/summary').expect(200);

    expect(res.body.data).toEqual({
      counts: { unread: 1, read: 1, resolved: 1 },
      policy: { returnAfterMs: 86_400_000, cooldownMs: 86_400_000 },
    });
  });
});

describe('PATCH /api/alerts/:alertId', () => {
  const patch = (alertId, body) => request(app).patch(`/api/alerts/${alertId}`).send(body);

  it('moves an alert between unread, read, and resolved, and announces it', async () => {
    const { alerts } = await seedAlerts();
    const id = alerts.unread.id;

    const read = await patch(id, { status: 'read' }).expect(200);
    expect(read.body.data).toMatchObject({ id, status: 'read', readAt: expect.any(String) });
    expect(events.at(-1)).toMatchObject({
      type: 'alert.updated',
      data: { reason: 'status', alert: { id, status: 'read' }, counts: { unread: 0, read: 2 } },
    });

    const unread = await patch(id, { status: 'unread' }).expect(200);
    expect(unread.body.data).toMatchObject({ status: 'unread', readAt: null });

    const resolved = await patch(id, { status: 'resolved' }).expect(200);
    expect(resolved.body.data).toMatchObject({
      status: 'resolved',
      readAt: expect.any(String),
      resolvedAt: expect.any(String),
    });

    // Reopened.
    const reopened = await patch(id, { status: 'read' }).expect(200);
    expect(reopened.body.data).toMatchObject({ status: 'read', resolvedAt: null });

    // No change, no event.
    events = [];
    await patch(id, { status: 'read' }).expect(200);
    expect(events).toEqual([]);
  });

  it('refuses to reopen an alert while a newer one for the same change is open', async () => {
    const { net, phone } = await seedAlerts();
    const old = await insertAlert({
      networkId: net.id,
      deviceId: phone.id,
      status: 'resolved',
      dedupKey: 'new_device:x',
    });
    await insertAlert({ networkId: net.id, deviceId: phone.id, dedupKey: 'new_device:x' });

    const res = await patch(old.id, { status: 'read' }).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 404 for an unknown alert and 400 for an invalid state', async () => {
    await patch(UNKNOWN_ID, { status: 'read' }).expect(404);
    const res = await patch(UNKNOWN_ID, { status: 'acknowledged' }).expect(400);
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'body.status' })]);
    await request(app).get(`/api/alerts/${UNKNOWN_ID}`).expect(404);
  });
});

describe('POST /api/alerts/read-all and /resolve-all', () => {
  it('marks every unread alert read, then resolves every open one', async () => {
    const { alerts } = await seedAlerts();

    const read = await request(app).post('/api/alerts/read-all').expect(200);
    expect(read.body.data).toEqual({ updated: 1, counts: { unread: 0, read: 2, resolved: 1 } });
    expect(events.at(-1)).toMatchObject({
      type: 'alerts.updated',
      data: { ids: [alerts.unread.id], status: 'read' },
    });

    const resolved = await request(app).post('/api/alerts/resolve-all').expect(200);
    expect(resolved.body.data).toEqual({ updated: 2, counts: { unread: 0, read: 0, resolved: 3 } });

    await request(app).post('/api/alerts/read-all').send({ deviceId: UNKNOWN_ID }).expect(400);
  });
});
