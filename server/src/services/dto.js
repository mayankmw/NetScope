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
