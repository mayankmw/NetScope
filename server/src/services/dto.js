/**
 * Maps database rows to API objects. Every endpoint that returns a device or a network uses
 * these, so the API shape is defined in exactly one place (snake_case → camelCase).
 */

/**
 * @param {Record<string, any>} row a `devices` row
 */
export function toDeviceDto(row) {
  return {
    id: row.id,
    ipAddress: row.ip_address,
    macAddress: row.mac_address,
    macIsRandom: row.mac_is_random,
    hostname: row.hostname,
    vendor: row.vendor,
    deviceType: row.device_type,
    displayName: row.display_name,
    isTrusted: row.is_trusted,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    // Lets clients discard a real-time event that is older than data they already have.
    updatedAt: row.updated_at,
  };
}

/**
 * @param {Record<string, any>} row a `networks` row, optionally with last_scan_* columns
 */
export function toNetworkDto(row) {
  return {
    id: row.id,
    name: row.name,
    cidr: row.cidr,
    interfaceName: row.interface_name,
    gatewayIpAddress: row.gateway_ip,
    gatewayMacAddress: row.gateway_mac,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastScan: row.last_scan_id
      ? { id: row.last_scan_id, finishedAt: row.last_scan_finished_at }
      : null,
  };
}

/**
 * @param {Record<string, any>} row a `device_events` row
 */
export function toDeviceEventDto(row) {
  return {
    id: row.id,
    type: row.type,
    occurredAt: row.occurred_at,
    ipAddress: row.ip_address,
    changes: row.changes,
    scanId: row.scan_id,
  };
}

/**
 * @param {Record<string, any>} row a `device_observations` row with the scan's `triggered_by`
 */
export function toObservationDto(row) {
  return {
    id: row.id,
    observedAt: row.observed_at,
    ipAddress: row.ip_address,
    hostname: row.hostname,
    latencyMs: row.latency_ms,
    scanId: row.scan_id,
    triggeredBy: row.triggered_by,
  };
}

/** Milliseconds between a scan's start and finish; null until it has both. */
function scanDurationMs(row) {
  if (!row.started_at || !row.finished_at) return null;
  return new Date(row.finished_at) - new Date(row.started_at);
}

/**
 * @param {Record<string, any>} row a port `scans` row
 */
export function toPortScanDto(row) {
  return {
    id: row.id,
    status: row.status,
    triggeredBy: row.triggered_by,
    ipAddress: row.target,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    durationMs: scanDurationMs(row),
    error: row.error_code ? { code: row.error_code, message: row.error_message } : null,
    summary: row.summary ?? null,
  };
}

/**
 * A scan of either type, as the scan history lists it.
 * @param {Record<string, any>} row a `scans` row joined as in scansRepository.listScans
 */
export function toScanDto(row) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    triggeredBy: row.triggered_by,
    // The swept subnet (discovery) or the device's address (port scan).
    target: row.target,
    network: row.network_id ? { id: row.network_id, cidr: row.network_cidr } : null,
    // Port scans: the device that was checked, as it is now.
    device: row.target_device_id
      ? {
          id: row.target_device_id,
          ipAddress: row.device_ip_address,
          macAddress: row.device_mac_address,
          hostname: row.device_hostname,
          displayName: row.device_display_name,
          vendor: row.device_vendor,
          deviceType: row.device_device_type,
          isGateway: row.device_is_gateway ?? false,
        }
      : null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    durationMs: scanDurationMs(row),
    error: row.error_code ? { code: row.error_code, message: row.error_message } : null,
    summary: row.summary ?? null,
  };
}

/**
 * @param {Record<string, any>} row a `port_scan_results` row joined with its `device_ports` row
 * @param {Record<string, any>} scan the scan the result belongs to
 */
export function toPortDto(row, scan) {
  return {
    port: row.port,
    protocol: row.protocol,
    state: row.state,
    service: row.service_name,
    product: row.service_product,
    version: row.service_version,
    firstSeenOpenAt: row.first_seen_at,
    lastSeenOpenAt: row.last_seen_at,
    // First found open by this scan.
    isNew: new Date(row.first_seen_at) >= new Date(scan.started_at),
  };
}
