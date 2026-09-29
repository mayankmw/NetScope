import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/db/pool.js';

const app = createApp();

afterAll(() => closePool());

describe('GET /api/health', () => {
  it('reports the API and database as up in the success envelope', async () => {
    const res = await request(app).get('/api/health').expect('Content-Type', /json/).expect(200);

    expect(res.body).toEqual({
      success: true,
      data: {
        status: 'ok',
        service: 'netscope-server',
        version: expect.any(String),
        environment: 'test',
        uptimeSeconds: expect.any(Number),
        timestamp: expect.any(String),
        checks: {
          api: { status: 'up' },
          database: { status: 'up', latencyMs: expect.any(Number) },
        },
      },
      error: null,
    });
    expect(Number.isNaN(Date.parse(res.body.data.timestamp))).toBe(false);
  });

  it('never exposes database credentials or connection details', async () => {
    const res = await request(app).get('/api/health').expect(200);
    const body = JSON.stringify(res.body);
    const databaseUrl = new URL(process.env.DATABASE_URL);

    expect(body).not.toContain(process.env.DATABASE_URL);
    expect(body).not.toContain(databaseUrl.host);
    if (databaseUrl.password) {
      expect(body).not.toContain(decodeURIComponent(databaseUrl.password));
    }
  });

  it('assigns a request ID when the caller does not send one', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a safe caller-supplied request ID', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'trace-abc_123');

    expect(res.headers['x-request-id']).toBe('trace-abc_123');
  });

  it('replaces an unsafe caller-supplied request ID', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'bad id <script>');

    expect(res.headers['x-request-id']).not.toBe('bad id <script>');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('error handling', () => {
  it('returns a NOT_FOUND envelope for unknown API routes', async () => {
    const res = await request(app).get('/api/does-not-exist').expect(404);

    expect(res.body).toEqual({
      success: false,
      data: null,
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String),
        details: { method: 'GET', path: '/api/does-not-exist' },
        requestId: res.headers['x-request-id'],
      },
    });
  });

  it('returns INVALID_JSON for a malformed JSON body', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'INVALID_JSON' },
    });
  });

  it('returns PAYLOAD_TOO_LARGE for an oversized body', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(200 * 1024) }))
      .expect(413);

    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
