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
 * @typedef {object} PortScan one port scan of a device
 * @property {string} id
 * @property {'queued' | 'running' | 'completed' | 'failed' | 'cancelled'} status
 * @property {'manual' | 'schedule'} triggeredBy
 * @property {string} ipAddress the address that was scanned
 * @property {string} startedAt
 * @property {string | null} finishedAt
 * @property {number | null} durationMs
 * @property {{ code: string, message: string } | null} error
 * @property {PortScanSummary | null} summary
 */

/**
 * @typedef {object} PortScanSummary
 * @property {number} portsChecked
 * @property {number} open
 * @property {number} closed
 * @property {number} filtered no answer (firewalled, or the device is offline)
 * @property {number[]} openPorts
 * @property {number[]} newlyOpen open now, never seen open before
 * @property {number[]} noLongerOpen open in the previous scan, not now
 */

/**
 * @typedef {object} DevicePort a port in the latest completed scan
 * @property {number} port
 * @property {'tcp'} protocol
 * @property {'open' | 'closed' | 'filtered'} state
 * @property {string | null} service e.g. "http", "ssl/http"
 * @property {string | null} product e.g. "nginx" (version detection)
 * @property {string | null} version e.g. "1.27.5"
 * @property {string} firstSeenOpenAt
 * @property {string} lastSeenOpenAt
 * @property {boolean} isNew first found open by that scan
 */

/**
 * @typedef {object} DevicePorts GET /api/devices/:deviceId/ports
 * @property {{ name: string, protocol: 'tcp', ports: number[], serviceDetection: 'light' | 'off',
 *              timeoutMs: number, enabled: boolean }} profile what every scan checks
 * @property {PortScan | null} scan the latest scan, whatever its status
 * @property {{ scanId: string, startedAt: string, finishedAt: string, summary: PortScanSummary,
 *              ports: DevicePort[] } | null} results from the latest completed scan
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
 * @typedef {object} DiscoverySummary outcome of a completed discovery (also kept on the scan)
 * @property {number} devicesFound
 * @property {number} newDevices found for the first time
 * @property {number} backOnline offline before, found again
 * @property {number} wentOffline online before, not found
 * @property {number} missingDevices known before the scan, not found by it
 * @property {number} knownDevices known after the scan (found + missing)
 * @property {number} ipChanges
 * @property {number | null} unresolvedHosts null for scans recorded before Step 9
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

/**
 * @typedef {object} Scan one entry of the scan history (GET /api/scans)
 * @property {string} id
 * @property {'discovery' | 'port'} type
 * @property {'queued' | 'running' | 'completed' | 'failed' | 'cancelled'} status
 * @property {'manual' | 'schedule'} triggeredBy
 * @property {string} target swept subnet (discovery) or the device's address (port scan)
 * @property {{ id: string, cidr: string, interfaceName?: string } | null} network
 * @property {{ id: string, ipAddress: string, macAddress: string, hostname: string | null,
 *             displayName: string | null, vendor: string | null, deviceType: string,
 *             isGateway: boolean } | null} device port scans: the device checked, as it is now
 * @property {string} createdAt
 * @property {string | null} startedAt
 * @property {string | null} finishedAt
 * @property {number | null} durationMs
 * @property {{ code: string, message: string } | null} error
 * @property {DiscoverySummary | PortScanSummary | null} summary once completed
 */

/**
 * @typedef {object} ScanFoundDevice a device a discovery found
 * @property {Device & { isGateway: boolean, isSelf: boolean }} device as it is now
 * @property {string} ipAddress where the scan found it
 * @property {string | null} hostname the name the scan resolved
 * @property {number | null} latencyMs
 * @property {boolean} isNew first found by this scan
 * @property {boolean} backOnline offline before this scan
 * @property {Record<string, { from: unknown, to: unknown }>} changes what this scan saw change
 */

/**
 * @typedef {object} ScanMissingDevice a known device a discovery did not find
 * @property {Device & { isGateway: boolean, isSelf: boolean }} device as it is now
 * @property {boolean} wentOffline online until this scan (else already offline)
 * @property {string | null} lastSeenAt last seen before this scan
 * @property {string | null} lastIpAddress
 */

/**
 * @typedef {object} ScanDetails GET /api/scans/:scanId
 * @property {Scan & { params: Record<string, unknown> }} scan
 * @property {{ id: string, createdAt: string } | null} previous older scan of the same network
 *   (discovery) or device (port scan)
 * @property {{ id: string, createdAt: string } | null} next
 * @property {{ found: ScanFoundDevice[], missing: ScanMissingDevice[] }
 *          | { ports: DevicePort[] } | null} results null until completed
 */

/**
 * @typedef {object} PresencePeriod
 * @property {'online' | 'offline'} status
 * @property {string} from
 * @property {string | null} to null: ongoing
 * @property {string | null} scanId the scan that saw the change (null: began before the range)
 */

/**
 * @typedef {object} DeviceHistory GET /api/devices/:deviceId/history
 * @property {{ from: string, to: string, days: number }} range
 * @property {string} firstSeenAt
 * @property {'online' | 'offline'} status
 * @property {PresencePeriod[]} periods oldest first
 * @property {{ total: number, seen: number, items: Array<{ id: string, finishedAt: string,
 *             triggeredBy: 'manual' | 'schedule', seen: boolean, ipAddress: string | null,
 *             latencyMs: number | null }> }} scans completed discoveries since first seen in the
 *   range, newest first (at most 100 listed)
 */

export {};
