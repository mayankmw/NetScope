import { z } from 'zod';

/**
 * POST /api/devices/discover takes no input. The scanned range always comes from the host's own
 * network configuration, never from the request, so any field sent is rejected.
 */
export const discoverDevicesSchemas = {
  body: z.strictObject({}),
};
