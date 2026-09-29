/**
 * JSDoc type definitions for the API contract (docs/API.md). The project uses JavaScript,
 * so these typedefs give editor autocompletion and documentation without a build step.
 * Import them in JSDoc with: @type {import('@/types/api').HealthStatus}
 */

/**
 * @template T
 * @typedef {object} ApiSuccess
 * @property {true} success
 * @property {T} data
 * @property {Record<string, unknown>} [meta]
 */

/**
 * @typedef {object} ApiFailure
 * @property {false} success
 * @property {{ code: string, message: string, details?: unknown }} error
 * @property {string} [requestId]
 */

/**
 * @typedef {object} HealthStatus
 * @property {'ok'} status
 * @property {string} service
 * @property {string} version
 * @property {'development' | 'test' | 'production'} environment
 * @property {number} uptimeSeconds
 * @property {string} timestamp ISO 8601
 */

export {};
