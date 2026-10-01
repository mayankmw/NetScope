import { Router } from 'express';
import * as scansController from '../controllers/scans.controller.js';
import { validate } from '../middleware/validate.js';
import { getScanSchemas, listScansSchemas } from '../validators/scans.validators.js';

/** Scan history (read-only). Scans are started from /api/devices. */
export const scansRouter = Router();

scansRouter.get('/', validate(listScansSchemas), scansController.listScans);
scansRouter.get('/:scanId', validate(getScanSchemas), scansController.getScan);
