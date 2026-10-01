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

/** GET /api/devices/:deviceId — one device with its network, presence, and IP history. */
export async function getDevice(req, res) {
  sendSuccess(res, await devicesService.getDeviceDetails(req.validated.params.deviceId));
}

/** GET /api/devices/:deviceId/events — the device's timeline, one page. */
export async function listDeviceEvents(req, res) {
  const { limit } = req.validated.query;
  const { items, nextCursor } = await devicesService.listDeviceEvents(
    req.validated.params.deviceId,
    req.validated.query,
  );
  sendSuccess(res, items, { meta: { limit, nextCursor } });
}

/** GET /api/devices/:deviceId/observations — the device's discovery history, one page. */
export async function listDeviceObservations(req, res) {
  const { limit } = req.validated.query;
  const { items, nextCursor } = await devicesService.listDeviceObservations(
    req.validated.params.deviceId,
    req.validated.query,
  );
  sendSuccess(res, items, { meta: { limit, nextCursor } });
}
