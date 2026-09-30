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

/**
 * @typedef {object} Device
 * @property {string} id
 * @property {string} ipAddress
 * @property {string} macAddress
 * @property {boolean} macIsRandom
 * @property {string | null} hostname
 * @property {string | null} vendor
 * @property {string} deviceType device_types code, e.g. "router"
 * @property {string | null} displayName
 * @property {boolean} isTrusted
 * @property {'online' | 'offline'} status
 * @property {boolean} [isGateway]
 * @property {string} firstSeenAt ISO 8601
 * @property {string} lastSeenAt ISO 8601
 */

/**
 * @typedef {object} Network
 * @property {string} id
 * @property {string | null} name
 * @property {string} cidr
 * @property {string} interfaceName
 * @property {string} gatewayIpAddress
 * @property {string} gatewayMacAddress
 * @property {string} firstSeenAt
 * @property {string} lastSeenAt
 * @property {{ id: string, finishedAt: string } | null} lastScan
 */

/**
 * @typedef {object} DeviceList
 * @property {Network | null} network null before the first discovery
 * @property {Device[]} devices
 */

/**
 * @typedef {object} DiscoverySummary
 * @property {number} devicesFound
 * @property {number} newDevices
 * @property {number} ipChanges
 * @property {number} wentOffline
 * @property {number} unresolvedHosts
 */

/**
 * @typedef {object} DiscoveryResult
 * @property {{ id: string, status: string, durationMs: number, finishedAt: string }} scan
 * @property {object} network
 * @property {DiscoverySummary} summary
 * @property {Record<string, { status: string }>} sources
 * @property {Array<Device & { isNew: boolean, previousIpAddress: string | null }>} devices
 * @property {string[]} unresolvedHosts
 */

export {};
