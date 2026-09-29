import { Router } from 'express';
import { healthRouter } from './health.routes.js';

/**
 * Mounts every resource router under /api. Planned groups (added in their own steps):
 *   /devices (3–6) · /scans (3, 7, 9) · /network (3, 8) · /alerts (10) · /reports (11)
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
