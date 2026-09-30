import { Router } from 'express';
import { devicesRouter } from './devices.routes.js';
import { healthRouter } from './health.routes.js';

/**
 * Mounts every resource router under /api. Planned groups (added in their own steps):
 *   /scans (7, 9) · /network (4, 8) · /alerts (10) · /reports (11)
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/devices', devicesRouter);
