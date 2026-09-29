import { Router } from 'express';
import * as healthController from '../controllers/health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', healthController.getHealth);
