import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';
import * as healthService from '../services/health.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * GET /api/health
 * 200 when every check is up; 503 (with the full report in error.details) otherwise, so
 * monitors can rely on the status code alone.
 */
export async function getHealth(req, res) {
  const health = await healthService.getHealth();

  if (health.status !== 'ok') {
    throw new AppError('The database is unavailable.', {
      statusCode: 503,
      code: ErrorCodes.DATABASE_UNAVAILABLE,
      details: health,
    });
  }

  sendSuccess(res, health);
}
