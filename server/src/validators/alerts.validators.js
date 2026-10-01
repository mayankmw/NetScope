import { z } from 'zod';

const ALERT_TYPES = ['new_device', 'device_returned', 'ip_changed'];

/**
 * GET /api/alerts: newest first, cursor pagination. `status=open` is unread and read together.
 * `before` is the `nextCursor` of the previous page (an alert id).
 */
export const listAlertsSchemas = {
  query: z.strictObject({
    status: z.enum(['open', 'unread', 'read', 'resolved']).optional(),
    type: z.enum(ALERT_TYPES).optional(),
    deviceId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    before: z.uuid({ error: 'Expected a cursor returned by a previous page' }).optional(),
  }),
};

/** GET /api/alerts/summary */
export const alertSummarySchemas = {
  query: z.strictObject({}),
};

const alertParams = z.strictObject({ alertId: z.uuid() });

/** GET /api/alerts/:alertId */
export const getAlertSchemas = {
  params: alertParams,
  query: z.strictObject({}),
};

/** PATCH /api/alerts/:alertId { status } */
export const updateAlertSchemas = {
  params: alertParams,
  query: z.strictObject({}),
  body: z.strictObject({ status: z.enum(['unread', 'read', 'resolved']) }),
};

/** POST /api/alerts/read-all and /resolve-all take no input. */
export const changeAllAlertsSchemas = {
  query: z.strictObject({}),
  body: z.strictObject({}),
};
