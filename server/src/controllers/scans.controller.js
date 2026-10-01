import * as scansService from '../services/scans.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/** GET /api/scans — the scan history, one page. */
export async function listScans(req, res) {
  const { limit } = req.validated.query;
  const { items, nextCursor } = await scansService.listScans(req.validated.query);
  sendSuccess(res, items, { meta: { limit, nextCursor } });
}

/** GET /api/scans/:scanId — one scan with its results. */
export async function getScan(req, res) {
  sendSuccess(res, await scansService.getScanDetails(req.validated.params.scanId));
}
