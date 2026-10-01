import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { scanRateLimit } from '../../src/middleware/rateLimit.js';

/** A stand-in scan endpoint: 202 when accepted, 409 when "a scan is already running". */
function appWithLimit(limit) {
  const app = express();
  app.post('/scan', scanRateLimit({ name: 'port-scan', limit, windowMs: 60_000 }), (req, res) =>
    res.status(req.query.busy ? 409 : 202).json({ success: true, data: {}, error: null }),
  );
  app.use(errorHandler);
  return app;
}

describe('scanRateLimit', () => {
  it('allows `limit` scans per window, then answers 429 RATE_LIMITED with Retry-After', async () => {
    const app = appWithLimit(2);

    const first = await request(app).post('/scan').expect(202);
    expect(first.headers['ratelimit-policy']).toMatch(/^"port-scan"; q=2; w=60;/);
    expect(first.headers.ratelimit).toMatch(/^"port-scan"; r=1; t=\d+$/);
    await request(app).post('/scan').expect(202);
    const refused = await request(app).post('/scan').expect(429);

    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(refused.body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: 'RATE_LIMITED',
        message: expect.stringMatching(/^Too many scans started\. Try again in \d+ s\.$/),
        details: { retryAfterSeconds: expect.any(Number), limit: 2, windowSeconds: 60 },
      },
    });
  });

  it('does not count refused requests, such as "a scan is already running"', async () => {
    const app = appWithLimit(1);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app).post('/scan?busy=1').expect(409);
    }
    await request(app).post('/scan').expect(202);
    await request(app).post('/scan').expect(429);
  });
});
