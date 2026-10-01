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

/**
 * One device with `is_gateway`, or null.
 *
 * @param {Executor} db
 * @param {string} deviceId
 */
export async function findDeviceById(db, deviceId) {
  const { rows } = await db.query(
    `SELECT d.*, d.mac_address = n.gateway_mac AS is_gateway
     FROM devices d
     JOIN networks n ON n.id = d.network_id
     WHERE d.id = $1`,
    [deviceId],
  );
  return rows[0] ?? null;
}

/** @param {Executor} db @param {string} deviceId */
export async function deviceExists(db, deviceId) {
  const { rows } = await db.query('SELECT EXISTS (SELECT 1 FROM devices WHERE id = $1) AS found', [
    deviceId,
  ]);
  return rows[0].found;
}

/** Recent observations averaged for the response time shown on the details page. */
const LATENCY_SAMPLE_SIZE = 20;

/**
 * Presence summary of a device:
 * - times_seen: discovery scans that saw it;
 * - scans_since_first_seen: completed discoveries of its network since it first appeared
 *   (including the one that found it), so times_seen / scans_since_first_seen is its availability;
 * - last_latency_ms: ping reply time in the latest scan that saw it (null: no ping reply);
 * - average_latency_ms / latency_samples: over its most recent ping replies;
 * - status_since: when its current status began (latest discovered/online/offline event).
 *
 * @param {Executor} db
 * @param {string} deviceId
 */
export async function getDevicePresence(db, deviceId) {
  const { rows } = await db.query(
    `SELECT
       (SELECT count(*)::int FROM device_observations o WHERE o.device_id = d.id) AS times_seen,
       (SELECT count(*)::int FROM scans s
        WHERE s.network_id = d.network_id AND s.type = 'discovery' AND s.status = 'completed'
          AND s.finished_at >= d.first_seen_at) AS scans_since_first_seen,
       latest.latency_ms AS last_latency_ms,
       recent.average_ms AS average_latency_ms,
       recent.samples AS latency_samples,
       (SELECT e.occurred_at FROM device_events e
        WHERE e.device_id = d.id AND e.type IN ('discovered', 'online', 'offline')
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT 1) AS status_since
     FROM devices d
     LEFT JOIN LATERAL (
       SELECT o.latency_ms FROM device_observations o
       WHERE o.device_id = d.id
       ORDER BY o.observed_at DESC, o.id DESC
       LIMIT 1
     ) latest ON true
     LEFT JOIN LATERAL (
       SELECT avg(r.latency_ms) AS average_ms, count(r.latency_ms)::int AS samples
       FROM (
         SELECT o.latency_ms FROM device_observations o
         WHERE o.device_id = d.id AND o.latency_ms IS NOT NULL
         ORDER BY o.observed_at DESC, o.id DESC
         LIMIT $2
       ) r
     ) recent ON true
     WHERE d.id = $1`,
    [deviceId, LATENCY_SAMPLE_SIZE],
  );
  return rows[0] ?? null;
}

/**
 * Every IP address a device has been seen at, most recently used first.
 *
 * @param {Executor} db
 * @param {string} deviceId
 * @param {{ limit?: number }} [options]
 */
export async function listDeviceIpHistory(db, deviceId, { limit = 10 } = {}) {
  const { rows } = await db.query(
    `SELECT ip_address,
            min(observed_at) AS first_seen_at,
            max(observed_at) AS last_seen_at,
            count(*)::int AS times_seen
     FROM device_observations
     WHERE device_id = $1
     GROUP BY ip_address
     ORDER BY max(observed_at) DESC
     LIMIT $2`,
    [deviceId, limit],
  );
  return rows;
}

/**
 * One page of a device's discovery history (the scans that saw it), newest first. `before` is
 * the id of the last observation of the previous page; the keyset is (observed_at, id).
 *
 * @param {Executor} db
 * @param {{ deviceId: string, before?: string, limit: number }} options
 */
export async function listDeviceObservations(db, { deviceId, before = null, limit }) {
  const { rows } = await db.query(
    `SELECT o.id, o.scan_id, o.ip_address, o.hostname, o.latency_ms, o.observed_at,
            s.triggered_by
     FROM device_observations o
     JOIN scans s ON s.id = o.scan_id
     WHERE o.device_id = $1
       AND ($2::bigint IS NULL
            OR (o.observed_at, o.id) < (SELECT observed_at, id FROM device_observations WHERE id = $2))
     ORDER BY o.observed_at DESC, o.id DESC
     LIMIT $3`,
    [deviceId, before, limit],
  );
  return rows;
}

/**
 * After a discovery's upserts: how many devices the network knows, and how many of them this
 * scan did not find (known before the scan, not seen by it).
 *
 * @param {Executor} db
 * @param {{ networkId: string, seenDeviceIds: string[] }} options
 * @returns {Promise<{ known: number, missing: number }>}
 */
export async function countKnownAndMissing(db, { networkId, seenDeviceIds }) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS known,
            count(*) FILTER (WHERE NOT (id = ANY ($2::uuid[])))::int AS missing
     FROM devices
     WHERE network_id = $1`,
    [networkId, seenDeviceIds],
  );
  return rows[0];
}

/**
 * The devices a discovery scan found, ordered by the address it found them at: the device as it
 * is now (`d.*`, for its name and identity) plus what the scan observed (`observed_*`).
 *
 * @param {Executor} db
 * @param {string} scanId
 */
export async function listDevicesFoundByScan(db, scanId) {
  const { rows } = await db.query(
    `SELECT d.*, d.mac_address = n.gateway_mac AS is_gateway,
            o.ip_address AS observed_ip_address, o.hostname AS observed_hostname,
            o.latency_ms AS observed_latency_ms
     FROM device_observations o
     JOIN devices d ON d.id = o.device_id
     JOIN networks n ON n.id = d.network_id
     WHERE o.scan_id = $1
     ORDER BY o.ip_address`,
    [scanId],
  );
  return rows;
}

/**
 * The devices a discovery scan did not find although the network knew them (first seen before
 * the scan started), each with where and when it was last seen before that scan.
 *
 * @param {Executor} db
 * @param {string} scanId
 */
export async function listDevicesMissedByScan(db, scanId) {
  const { rows } = await db.query(
    `WITH scan AS (SELECT id, network_id, started_at FROM scans WHERE id = $1)
     SELECT d.*, d.mac_address = n.gateway_mac AS is_gateway,
            last_seen.observed_at AS last_seen_before_at,
            last_seen.ip_address AS last_seen_before_ip_address
     FROM scan
     JOIN devices d ON d.network_id = scan.network_id AND d.first_seen_at < scan.started_at
     JOIN networks n ON n.id = d.network_id
     LEFT JOIN LATERAL (
       SELECT o.observed_at, o.ip_address FROM device_observations o
       WHERE o.device_id = d.id AND o.observed_at < scan.started_at
       ORDER BY o.observed_at DESC, o.id DESC
       LIMIT 1
     ) last_seen ON true
     WHERE NOT EXISTS (
       SELECT 1 FROM device_observations o WHERE o.scan_id = scan.id AND o.device_id = d.id
     )
     ORDER BY d.ip_address`,
    [scanId],
  );
  return rows;
}

/**
 * A device's presence in the completed discoveries of its network since `since`, newest first:
 * whether each scan saw it, and its address and ping time if so. At most `limit` scans; every
 * row also carries the totals over the whole period (`total_scans`, `total_seen`).
 *
 * @param {Executor} db
 * @param {{ deviceId: string, networkId: string, since: Date, limit: number }} options
 */
export async function listPresenceScans(db, { deviceId, networkId, since, limit }) {
  const { rows } = await db.query(
    `SELECT s.id, s.finished_at, s.triggered_by,
            o.id IS NOT NULL AS seen, o.ip_address, o.latency_ms,
            count(*) OVER ()::int AS total_scans,
            count(o.id) OVER ()::int AS total_seen
     FROM scans s
     LEFT JOIN device_observations o ON o.scan_id = s.id AND o.device_id = $1
     WHERE s.network_id = $2 AND s.type = 'discovery' AND s.status = 'completed'
       AND s.finished_at >= $3
     ORDER BY s.finished_at DESC, s.id DESC
     LIMIT $4`,
    [deviceId, networkId, since, limit],
  );
  return rows;
}
