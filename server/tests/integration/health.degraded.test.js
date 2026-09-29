import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

// Simulate PostgreSQL being unreachable without stopping the real server.
vi.mock('../../src/db/pool.js', () => ({
  checkDatabaseConnection: vi.fn(async () => {
    throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    });
  }),
}));

const app = createApp();

describe('GET /api/health when PostgreSQL is down', () => {
  it('returns 503 DATABASE_UNAVAILABLE with the health report in details', async () => {
    const res = await request(app).get('/api/health').expect(503);

    expect(res.body).toEqual({
      success: false,
      data: null,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database is unavailable.',
        details: expect.objectContaining({
          status: 'degraded',
          checks: { api: { status: 'up' }, database: { status: 'down' } },
        }),
        requestId: res.headers['x-request-id'],
      },
    });
  });

  it('does not leak the driver error to the client', async () => {
    const res = await request(app).get('/api/health').expect(503);

    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(res.body)).not.toContain('5432');
  });
});
