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
 * @property {null} error
 * @property {Record<string, unknown>} [meta]
 */

/**
 * @typedef {object} ApiErrorBody
 * @property {string} code
 * @property {string} message
 * @property {unknown} [details]
 * @property {string} [requestId]
 */

/**
 * @typedef {object} ApiFailure
 * @property {false} success
 * @property {null} data
 * @property {ApiErrorBody} error
 */

/**
 * @typedef {object} HealthCheck
 * @property {'up' | 'down'} status
 * @property {number} [latencyMs]
 */

/**
 * @typedef {object} HealthStatus
 * @property {'ok' | 'degraded'} status
 * @property {string} service
 * @property {string} version
 * @property {'development' | 'test' | 'production'} environment
 * @property {number} uptimeSeconds
 * @property {string} timestamp ISO 8601
 * @property {{ api: HealthCheck, database: HealthCheck }} checks
 */

export {};
