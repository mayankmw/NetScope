/** @typedef {import('./networks.repository.js').Executor} Executor */

/**
 * Every port ever found open on a device (the current-state table for ports).
 * @param {Executor} db
 * @param {string} deviceId
 */
export async function listDevicePorts(db, deviceId) {
  const { rows } = await db.query(
    'SELECT * FROM device_ports WHERE device_id = $1 ORDER BY protocol, port',
    [deviceId],
  );
  return rows;
}

/**
 * Records a port found open: creates it the first time (first_seen_at), otherwise moves
 * last_seen_at. Service details only replace what was known when this scan identified them.
 * Returns the row plus `inserted` (first time this port was seen open).
 *
 * @param {Executor} db
 * @param {{ deviceId: string, protocol: 'tcp', port: number, service: string | null,
 *           product: string | null, version: string | null }} port
 */
export async function upsertOpenPort(db, { deviceId, protocol, port, service, product, version }) {
  const { rows } = await db.query(
    `INSERT INTO device_ports (device_id, protocol, port, service_name, service_product,
                               service_version)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (device_id, protocol, port) DO UPDATE SET
       service_name    = COALESCE(EXCLUDED.service_name, device_ports.service_name),
       service_product = COALESCE(EXCLUDED.service_product, device_ports.service_product),
       service_version = COALESCE(EXCLUDED.service_version, device_ports.service_version),
       last_seen_at    = now()
     RETURNING *, (xmax = 0) AS inserted`,
    [deviceId, protocol, port, service, product, version],
  );
  return rows[0];
}

/**
 * Records what one scan saw on known ports, in one statement.
 *
 * @param {Executor} db
 * @param {{ scanId: string, results: Array<{ devicePortId: string, state: 'open' | 'closed' | 'filtered',
 *           service: string | null, product: string | null, version: string | null }> }} input
 */
export async function insertPortResults(db, { scanId, results }) {
  if (results.length === 0) return;
  await db.query(
    `INSERT INTO port_scan_results (scan_id, device_port_id, state, service_name, service_product,
                                    service_version)
     SELECT $1, r.device_port_id, r.state, r.service_name, r.service_product, r.service_version
     FROM unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[])
          AS r(device_port_id, state, service_name, service_product, service_version)`,
    [
      scanId,
      results.map((result) => result.devicePortId),
      results.map((result) => result.state),
      results.map((result) => result.service),
      results.map((result) => result.product),
      results.map((result) => result.version),
    ],
  );
}

/**
 * What a scan saw on each known port: open ports first, then by port number.
 * @param {Executor} db
 * @param {string} scanId
 */
export async function listPortResults(db, scanId) {
  const { rows } = await db.query(
    `SELECT p.port, p.protocol, r.state,
            COALESCE(r.service_name, p.service_name) AS service_name,
            r.service_product, r.service_version,
            p.first_seen_at, p.last_seen_at
     FROM port_scan_results r
     JOIN device_ports p ON p.id = r.device_port_id
     WHERE r.scan_id = $1
     ORDER BY r.state <> 'open', p.port`,
    [scanId],
  );
  return rows;
}
