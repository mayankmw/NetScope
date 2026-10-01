import { z } from 'zod';

/** GET /api/devices[?networkId=<uuid>] */
export const listDevicesSchemas = {
  query: z.strictObject({
    networkId: z.uuid().optional(),
  }),
};

/**
 * POST /api/devices/discover takes no input. The scanned range always comes from the host's own
 * network configuration, never from the request, so any field sent is rejected.
 */
export const discoverDevicesSchemas = {
  body: z.strictObject({}),
};

const deviceParams = z.strictObject({ deviceId: z.uuid() });

/** GET /api/devices/:deviceId */
export const getDeviceSchemas = {
  params: deviceParams,
  query: z.strictObject({}),
};

/**
 * GET /api/devices/:deviceId/events and /observations: cursor pagination.
 * `before` is the `nextCursor` of the previous page (an id, so a positive integer).
 */
export const listDeviceHistorySchemas = {
  params: deviceParams,
  query: z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    before: z
      .string()
      .regex(/^[1-9]\d{0,18}$/, 'Expected a cursor returned by a previous page')
      .optional(),
  }),
};

/** GET /api/devices/:deviceId/history[?days=30]: presence over the last 1–90 days. */
export const getDeviceHistorySchemas = {
  params: deviceParams,
  query: z.strictObject({
    days: z.coerce.number().int().min(1).max(90).default(30),
  }),
};

/**
 * POST /api/devices/:deviceId/scan takes no input besides the id: the target is the device's
 * known address, and the ports and nmap options are fixed on the server. Any field is rejected.
 */
export const startPortScanSchemas = {
  params: deviceParams,
  query: z.strictObject({}),
  body: z.strictObject({}),
};

/** GET /api/devices/:deviceId/ports */
export const getDevicePortsSchemas = {
  params: deviceParams,
  query: z.strictObject({}),
};
