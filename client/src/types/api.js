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
 * @property {string} [updatedAt] ISO 8601; orders real-time updates
 */

/**
 * @typedef {object} DevicePresence
 * @property {string | null} statusSince when the current status began
 * @property {number} timesSeen discovery scans that saw the device
 * @property {number} scansSinceFirstSeen completed discoveries of its network since first seen
 * @property {number | null} lastLatencyMs ping reply time in the latest scan that saw it
 * @property {number | null} averageLatencyMs over the most recent ping replies
 * @property {number} latencySamples
 */

/**
 * @typedef {object} LocalInterface the NetScope host's own interface (device.isSelf)
 * @property {string} name e.g. "en0"
 * @property {string} macAddress
 * @property {Array<{ family: 'IPv4' | 'IPv6', address: string, cidr: string | null }>} addresses
 */

/**
 * @typedef {object} DeviceDetails GET /api/devices/:deviceId
 * @property {Device & { isGateway: boolean, isSelf: boolean, updatedAt: string }} device
 * @property {Network} network
 * @property {DevicePresence} presence
 * @property {Array<{ ipAddress: string, firstSeenAt: string, lastSeenAt: string, timesSeen: number }>} ipHistory
 * @property {LocalInterface | null} localInterface
 */

/**
 * @typedef {object} DeviceEvent one entry of a device's timeline
 * @property {string} id also the pagination cursor
 * @property {'discovered' | 'online' | 'offline' | 'updated'} type
 * @property {string} occurredAt
 * @property {string} ipAddress the device's IP at the time
 * @property {Record<string, { from: unknown, to: unknown }>} changes 'updated' only
 * @property {string | null} scanId
 */

/**
 * @typedef {object} Observation a discovery scan that saw the device
 * @property {string} id also the pagination cursor
 * @property {string} observedAt
 * @property {string} ipAddress
 * @property {string | null} hostname
 * @property {number | null} latencyMs null when the device did not answer ping
 * @property {string} scanId
 * @property {'manual' | 'schedule'} triggeredBy
 */

/**
 * @template T
 * @typedef {object} Page
 * @property {T[]} items
 * @property {string | null} nextCursor null on the last page
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
