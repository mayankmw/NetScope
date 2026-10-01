import { z } from 'zod';

/**
 * GET /api/scans: the scan history, newest first, with optional filters and cursor pagination.
 * `before` is the `nextCursor` of the previous page (a scan id).
 */
export const listScansSchemas = {
  query: z.strictObject({
    type: z.enum(['discovery', 'port']).optional(),
    status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']).optional(),
    networkId: z.uuid().optional(),
    deviceId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    before: z.uuid({ error: 'Expected a cursor returned by a previous page' }).optional(),
  }),
};

/** GET /api/scans/:scanId */
export const getScanSchemas = {
  params: z.strictObject({ scanId: z.uuid() }),
  query: z.strictObject({}),
};
