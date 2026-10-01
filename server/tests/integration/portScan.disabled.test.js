import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

// An operator turned port scanning off. The config is read when the app is imported.
vi.stubEnv('PORT_SCAN_ENABLED', 'false');

const { createApp } = await import('../../src/app.js');
const { closePool } = await import('../../src/db/pool.js');
const { insertDevice, insertNetwork, resetDatabase } = await import('../helpers/db.js');

const app = createApp();

afterAll(async () => {
  vi.unstubAllEnvs();
  await closePool();
});

describe('with PORT_SCAN_ENABLED=false', () => {
  it('refuses to start a port scan, before looking anything up', async () => {
    const res = await request(app)
      .post('/api/devices/6f1c1c9e-6a4b-4a70-8a3c-0b3f7d0d8f55/scan')
      .expect(403);

    expect(res.body.error).toMatchObject({ code: 'PORT_SCAN_DISABLED' });
  });

  it('still shows earlier results, and tells clients scanning is off', async () => {
    await resetDatabase();
    const network = await insertNetwork();
    const device = await insertDevice(network.id);

    const res = await request(app).get(`/api/devices/${device.id}/ports`).expect(200);

    expect(res.body.data).toMatchObject({ profile: { enabled: false }, scan: null });
  });
});
