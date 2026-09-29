import { apiClient } from './apiClient';

/**
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<import('@/types/api').HealthStatus>}
 */
export function getHealth(options) {
  return apiClient.get('/health', options);
}
