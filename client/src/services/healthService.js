import { ApiError, apiClient } from './apiClient';

/** A 503 from /health still carries a full health report (in error.details). */
function isHealthReport(value) {
  return typeof value?.status === 'string' && value?.checks?.api?.status === 'up';
}

/**
 * Fetches the server's health report. Resolves with the report both when everything is up
 * (`status: 'ok'`, HTTP 200) and when a dependency is down (`status: 'degraded'`, HTTP 503).
 * Rejects only when the API itself cannot be reached or answers unexpectedly.
 *
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<import('@/types/api').HealthStatus>}
 */
export async function getHealth(options) {
  try {
    return await apiClient.get('/health', options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 503 && isHealthReport(error.details)) {
      return error.details;
    }
    throw error;
  }
}
