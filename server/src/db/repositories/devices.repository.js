/** @typedef {import('./networks.repository.js').Executor} Executor */

/**
 * Inserts or updates a device seen by discovery, matching on (network_id, mac_address).
 *
 * - A known MAC with a new IP updates the same row (DHCP renewal); the old IP is returned as
 *   `previous_ip_address` so the change can be reported.
 * - Scans never erase data: hostname and vendor keep their old values when this scan found none.
 * - The inferred device type only fills in "unknown"; a type set by the user is never replaced.
 * - User-owned fields (display_name, notes, is_trusted) are never touched.
 * - first_seen_at is set only on insert; last_seen_at moves to now().
 *
 * Also returns the row's previous values (previous_*), so callers can tell exactly what changed.
 *
 * @param {Executor} db
 * @param {string} networkId
 * @param {import('../../network/discovery/normalizeDevices.js').DiscoveredDevice} device
 */
export async function upsertDiscoveredDevice(db, networkId, device) {
  const { rows } = await db.query(
    `WITH previous AS (
       SELECT ip_address, hostname, vendor, device_type, status
       FROM devices WHERE network_id = $1 AND mac_address = $2
     ),
     upserted AS (
       INSERT INTO devices (network_id, mac_address, ip_address, hostname, vendor, device_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'online')
       ON CONFLICT (network_id, mac_address) DO UPDATE SET
         ip_address   = EXCLUDED.ip_address,
         hostname     = COALESCE(EXCLUDED.hostname, devices.hostname),
         vendor       = COALESCE(EXCLUDED.vendor, devices.vendor),
         device_type  = CASE WHEN devices.device_type = 'unknown'
                             THEN EXCLUDED.device_type ELSE devices.device_type END,
         status       = 'online',
         last_seen_at = now()
       RETURNING *
     )
     SELECT upserted.*,
            previous.ip_address  AS previous_ip_address,
            previous.hostname    AS previous_hostname,
            previous.vendor      AS previous_vendor,
            previous.device_type AS previous_device_type,
            previous.status      AS previous_status,
            previous.ip_address IS NULL AS is_new
     FROM upserted LEFT JOIN previous ON true`,
    [
      networkId,
      device.macAddress,
      device.ipAddress,
      device.hostname,
      device.vendor,
      device.deviceType,
    ],
  );
  return rows[0];
}

/**
 * Marks devices that were online but not seen by this scan as offline. Only devices whose last
 * known IP is inside the swept range are affected: a device outside it was not probed.
 *
 * @param {Executor} db
 * @param {{ networkId: string, sweptRange: string, seenDeviceIds: string[] }} options
 * @returns {Promise<Array<Record<string, any>>>} the devices that went offline (full rows)
 */
export async function markUnseenDevicesOffline(db, { networkId, sweptRange, seenDeviceIds }) {
  const { rows } = await db.query(
    `UPDATE devices SET status = 'offline'
     WHERE network_id = $1
       AND status = 'online'
       AND ip_address << $2::cidr
       AND NOT (id = ANY ($3::uuid[]))
     RETURNING *`,
    [networkId, sweptRange, seenDeviceIds],
  );
  return rows;
}

/**
 * Records that a device was seen by a discovery scan (presence and IP history).
 *
 * @param {Executor} db
 * @param {{ scanId: string, deviceId: string, ipAddress: string, hostname: string | null, latencyMs: number | null }} observation
 */
export async function insertObservation(db, { scanId, deviceId, ipAddress, hostname, latencyMs }) {
  await db.query(
    `INSERT INTO device_observations (scan_id, device_id, ip_address, hostname, latency_ms)
     VALUES ($1, $2, $3, $4, $5)`,
    [scanId, deviceId, ipAddress, hostname, latencyMs],
  );
}

/**
 * Every device known on a network, online and offline, ordered by IP.
 *
 * @param {Executor} db
 * @param {string} networkId
 */
export async function listDevicesByNetwork(db, networkId) {
  const { rows } = await db.query(
    `SELECT d.*, d.mac_address = n.gateway_mac AS is_gateway
     FROM devices d
     JOIN networks n ON n.id = d.network_id
     WHERE d.network_id = $1
     ORDER BY d.ip_address`,
    [networkId],
  );
  return rows;
}
