import * as discoveryService from '../services/discovery.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/** POST /api/devices/discover — runs a discovery and returns the normalized devices. */
export async function discoverDevices(req, res) {
  const result = await discoveryService.discoverDevices({
    triggeredBy: 'manual',
    requestId: req.id,
  });
  sendSuccess(res, result);
}
