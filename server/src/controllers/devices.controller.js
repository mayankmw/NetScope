import * as devicesService from '../services/devices.service.js';
import * as discoveryService from '../services/discovery.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/** GET /api/devices — the device inventory of the current (or given) network. */
export async function listDevices(req, res) {
  sendSuccess(res, await devicesService.listDevices(req.validated.query));
}

/** POST /api/devices/discover — runs a discovery and returns the normalized devices. */
export async function discoverDevices(req, res) {
  const result = await discoveryService.discoverDevices({
    triggeredBy: 'manual',
    requestId: req.id,
  });
  sendSuccess(res, result);
}
