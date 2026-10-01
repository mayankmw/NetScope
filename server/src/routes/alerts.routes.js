import { Router } from 'express';
import * as alertsController from '../controllers/alerts.controller.js';
import { validate } from '../middleware/validate.js';
import {
  alertSummarySchemas,
  changeAllAlertsSchemas,
  getAlertSchemas,
  listAlertsSchemas,
  updateAlertSchemas,
} from '../validators/alerts.validators.js';

/** Alerts raised by discovery: read them and change their state. */
export const alertsRouter = Router();

alertsRouter.get('/', validate(listAlertsSchemas), alertsController.listAlerts);
alertsRouter.get('/summary', validate(alertSummarySchemas), alertsController.getAlertSummary);
alertsRouter.post('/read-all', validate(changeAllAlertsSchemas), alertsController.markAllRead);
alertsRouter.post('/resolve-all', validate(changeAllAlertsSchemas), alertsController.resolveAll);
alertsRouter.get('/:alertId', validate(getAlertSchemas), alertsController.getAlert);
alertsRouter.patch('/:alertId', validate(updateAlertSchemas), alertsController.updateAlert);
