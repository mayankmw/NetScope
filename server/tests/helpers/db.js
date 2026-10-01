import { query } from '../../src/db/pool.js';

/** Empties every data table (lookup tables such as device_types keep their seed rows). */
export async function resetDatabase() {
  await query(
    `TRUNCATE alerts, port_scan_results, device_ports, device_events, device_observations, scans,
              devices, networks
     RESTART IDENTITY`,
  );
}

/** Inserts a network with sensible defaults. */
export async function insertNetwork(overrides = {}) {
  const { rows } = await query(
    `INSERT INTO networks (cidr, gateway_ip, gateway_mac, interface_name)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      overrides.cidr ?? '192.168.1.0/24',
      overrides.gatewayIp ?? '192.168.1.1',
      overrides.gatewayMac ?? 'a4:83:e7:00:00:01',
      overrides.interfaceName ?? 'en0',
    ],
  );
  return rows[0];
}

/** Inserts a device on the given network with sensible defaults. */
export async function insertDevice(networkId, overrides = {}) {
  const { rows } = await query(
    `INSERT INTO devices (network_id, mac_address, ip_address, device_type)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      networkId,
      overrides.macAddress ?? 'a4:83:e7:12:34:56',
      overrides.ipAddress ?? '192.168.1.20',
      overrides.deviceType ?? 'unknown',
    ],
  );
  return rows[0];
}

/** Inserts a scan with sensible defaults (a queued discovery scan). */
export async function insertScan(overrides = {}) {
  const { rows } = await query(
    `INSERT INTO scans (network_id, type, status, target, target_device_id, started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      overrides.networkId ?? null,
      overrides.type ?? 'discovery',
      overrides.status ?? 'queued',
      overrides.target ?? '192.168.1.0/24',
      overrides.targetDeviceId ?? null,
      overrides.startedAt ?? null,
      overrides.finishedAt ?? null,
    ],
  );
  return rows[0];
}

/** Records that a scan saw a device. */
export async function insertObservation({
  scanId,
  deviceId,
  ipAddress,
  latencyMs = null,
  observedAt,
}) {
  const { rows } = await query(
    `INSERT INTO device_observations (scan_id, device_id, ip_address, latency_ms, observed_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, now()))
     RETURNING *`,
    [scanId, deviceId, ipAddress, latencyMs, observedAt ?? null],
  );
  return rows[0];
}

/** Appends an event to a device's timeline. */
export async function insertDeviceEvent({
  deviceId,
  scanId = null,
  type,
  ipAddress = '192.168.1.20',
  changes = {},
  occurredAt,
}) {
  const { rows } = await query(
    `INSERT INTO device_events (device_id, scan_id, type, ip_address, changes, occurred_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
     RETURNING *`,
    [deviceId, scanId, type, ipAddress, changes, occurredAt ?? null],
  );
  return rows[0];
}
