import { Router } from 'express';
import { devicesRouter } from './devices.routes.js';
import { healthRouter } from './health.routes.js';
import { scansRouter } from './scans.routes.js';

/**
 * Mounts every resource router under /api. Planned groups (added in their own steps):
 *   /network · /alerts (10) · /reports (11)
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/devices', devicesRouter);
apiRouter.use('/scans', scansRouter);
