import * as alertsService from '../services/alerts.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/** GET /api/alerts — one page of alerts. */
export async function listAlerts(req, res) {
  const { limit } = req.validated.query;
  const { items, nextCursor } = await alertsService.listAlerts(req.validated.query);
  sendSuccess(res, items, { meta: { limit, nextCursor } });
}

/** GET /api/alerts/summary — counts by state and the alert rules' settings. */
export async function getAlertSummary(req, res) {
  sendSuccess(res, await alertsService.getAlertSummary());
}

/** GET /api/alerts/:alertId */
export async function getAlert(req, res) {
  sendSuccess(res, await alertsService.getAlert(req.validated.params.alertId));
}

/** PATCH /api/alerts/:alertId — mark unread, read, or resolved. */
export async function updateAlert(req, res) {
  sendSuccess(
    res,
    await alertsService.updateAlertStatus(req.validated.params.alertId, req.validated.body),
  );
}

/** POST /api/alerts/read-all */
export async function markAllRead(req, res) {
  sendSuccess(res, await alertsService.markAllRead());
}

/** POST /api/alerts/resolve-all */
export async function resolveAll(req, res) {
  sendSuccess(res, await alertsService.resolveAll());
}
