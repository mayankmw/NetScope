import * as healthService from '../services/health.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/** GET /api/health */
export function getHealth(req, res) {
  sendSuccess(res, healthService.getHealth());
}
