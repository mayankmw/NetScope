/** @typedef {import('./networks.repository.js').Executor} Executor */

/** Name of the partial unique index that allows only one queued/running scan. */
export const SINGLE_ACTIVE_SCAN_CONSTRAINT = 'scans_single_active_idx';

/**
 * Inserts a running discovery scan. Fails with a unique violation on
 * SINGLE_ACTIVE_SCAN_CONSTRAINT when another scan is already queued or running.
 *
 * @param {Executor} db
 * @param {{ networkId: string, target: string, triggeredBy: 'manual' | 'schedule', params: object }} scan
 */
export async function createRunningDiscoveryScan(db, { networkId, target, triggeredBy, params }) {
  const { rows } = await db.query(
    `INSERT INTO scans (network_id, type, status, triggered_by, target, params, started_at)
     VALUES ($1, 'discovery', 'running', $2, $3, $4, now())
     RETURNING id, network_id, type, status, triggered_by, target, started_at`,
    [networkId, triggeredBy, target, params],
  );
  return rows[0];
}

/**
 * Inserts a running port scan of one device. Fails with a unique violation on
 * SINGLE_ACTIVE_SCAN_CONSTRAINT when another scan (of any type) is already queued or running.
 *
 * @param {Executor} db
 * @param {{ networkId: string, deviceId: string, target: string,
 *           triggeredBy: 'manual' | 'schedule', params: object }} scan
 */
export async function createRunningPortScan(
  db,
  { networkId, deviceId, target, triggeredBy, params },
) {
  const { rows } = await db.query(
    `INSERT INTO scans (network_id, type, status, triggered_by, target, target_device_id, params,
                        started_at)
     VALUES ($1, 'port', 'running', $2, $3, $4, $5, now())
     RETURNING id, network_id, target_device_id, type, status, triggered_by, target, params,
               started_at`,
    [networkId, triggeredBy, target, deviceId, params],
  );
  return rows[0];
}

/**
 * @param {Executor} db
 * @param {string} scanId
 * @param {{ summary?: object }} [result] outcome counts to keep with the scan
 */
export async function completeScan(db, scanId, { summary = null } = {}) {
  const { rows } = await db.query(
    `UPDATE scans SET status = 'completed', finished_at = now(), summary = $2
     WHERE id = $1 AND status = 'running'
     RETURNING id, status, started_at, finished_at, summary`,
    [scanId, summary],
  );
  return rows[0];
}

/**
 * @param {Executor} db
 * @param {string} scanId
 * @param {{ code: string, message: string }} error client-safe code and message
 */
export async function failScan(db, scanId, { code, message }) {
  await db.query(
    `UPDATE scans SET status = 'failed', error_code = $2, error_message = left($3, 1000),
                      finished_at = now()
     WHERE id = $1 AND status IN ('queued', 'running')`,
    [scanId, code, message],
  );
}

/** @param {Executor} db @param {string} scanId */
export async function cancelScan(db, scanId) {
  await db.query(
    `UPDATE scans SET status = 'cancelled', finished_at = now()
     WHERE id = $1 AND status IN ('queued', 'running')`,
    [scanId],
  );
}

/**
 * Marks scans left queued/running by a previous process as failed. NetScope runs as a single
 * process, so at startup any active scan belongs to a process that no longer exists — and
 * would otherwise block new scans forever.
 *
 * @param {Executor} db
 * @returns {Promise<string[]>} ids of the scans that were closed
 */
export async function failInterruptedScans(db) {
  const { rows } = await db.query(
    `UPDATE scans SET status = 'failed', error_code = 'INTERRUPTED',
                      error_message = 'The server stopped while this scan was running.',
                      finished_at = now()
     WHERE status IN ('queued', 'running')
     RETURNING id`,
  );
  return rows.map((row) => row.id);
}

const PORT_SCAN_COLUMNS = `id, status, triggered_by, target, params, summary, error_code, error_message,
  started_at, finished_at, created_at`;

/**
 * A device's most recent port scan (any status) and its most recent completed one; either may be
 * null, and they are the same scan when the latest one completed.
 *
 * @param {Executor} db
 * @param {string} deviceId
 * @returns {Promise<{ latest: Record<string, any> | null, lastCompleted: Record<string, any> | null }>}
 */
export async function findDevicePortScans(db, deviceId) {
  const { rows } = await db.query(
    `(SELECT 'latest' AS which, ${PORT_SCAN_COLUMNS} FROM scans
      WHERE target_device_id = $1 AND type = 'port'
      ORDER BY created_at DESC LIMIT 1)
     UNION ALL
     (SELECT 'lastCompleted' AS which, ${PORT_SCAN_COLUMNS} FROM scans
      WHERE target_device_id = $1 AND type = 'port' AND status = 'completed'
      ORDER BY finished_at DESC LIMIT 1)`,
    [deviceId],
  );
  return {
    latest: rows.find((row) => row.which === 'latest') ?? null,
    lastCompleted: rows.find((row) => row.which === 'lastCompleted') ?? null,
  };
}

/**
 * Scan history columns: the scan, its network's subnet, and, for a port scan, what identifies the
 * device it checked (its current name and address).
 */
const HISTORY_COLUMNS = `s.id, s.network_id, s.type, s.status, s.triggered_by, s.target,
  s.target_device_id, s.summary, s.error_code, s.error_message, s.started_at, s.finished_at,
  s.created_at, n.cidr AS network_cidr,
  d.ip_address AS device_ip_address, d.mac_address AS device_mac_address,
  d.hostname AS device_hostname, d.display_name AS device_display_name,
  d.vendor AS device_vendor, d.device_type AS device_device_type,
  d.mac_address = n.gateway_mac AS device_is_gateway`;

const HISTORY_FROM = `scans s
  LEFT JOIN networks n ON n.id = s.network_id
  LEFT JOIN devices d ON d.id = s.target_device_id`;

/**
 * One page of the scan history, newest first. Every filter is optional. `before` is the id of
 * the last scan of the previous page; the keyset is (created_at, id), compared in SQL so no
 * precision is lost. An unknown `before` yields an empty page.
 *
 * @param {Executor} db
 * @param {{ type?: 'discovery' | 'port', status?: string, networkId?: string, deviceId?: string,
 *           before?: string, limit: number }} options
 */
export async function listScans(
  db,
  { type = null, status = null, networkId = null, deviceId = null, before = null, limit },
) {
  const { rows } = await db.query(
    `SELECT ${HISTORY_COLUMNS}
     FROM ${HISTORY_FROM}
     WHERE ($1::text IS NULL OR s.type = $1)
       AND ($2::text IS NULL OR s.status = $2)
       AND ($3::uuid IS NULL OR s.network_id = $3)
       AND ($4::uuid IS NULL OR s.target_device_id = $4)
       AND ($5::uuid IS NULL
            OR (s.created_at, s.id) < (SELECT created_at, id FROM scans WHERE id = $5))
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT $6`,
    [type, status, networkId, deviceId, before, limit],
  );
  return rows;
}

/**
 * One scan with its parameters, or null.
 * @param {Executor} db
 * @param {string} scanId
 */
export async function findScanById(db, scanId) {
  const { rows } = await db.query(
    `SELECT ${HISTORY_COLUMNS}, s.params, n.interface_name AS network_interface_name
     FROM ${HISTORY_FROM}
     WHERE s.id = $1`,
    [scanId],
  );
  return rows[0] ?? null;
}

/**
 * The scans just before and after this one in its own history: discoveries of the same network,
 * or port scans of the same device. Same order as the scan history list.
 *
 * @param {Executor} db
 * @param {{ id: string, type: 'discovery' | 'port', network_id: string | null,
 *           target_device_id: string | null }} scan
 * @returns {Promise<{ previous: { id: string, created_at: Date } | null,
 *                     next: { id: string, created_at: Date } | null }>}
 */
export async function findAdjacentScans(db, scan) {
  const [scope, scopeId] =
    scan.type === 'port'
      ? ['target_device_id', scan.target_device_id]
      : ['network_id', scan.network_id];
  if (!scopeId) return { previous: null, next: null };

  // `scope` is one of two fixed column names above, never request input.
  const { rows } = await db.query(
    `WITH current AS (SELECT created_at, id FROM scans WHERE id = $1)
     (SELECT 'previous' AS which, s.id, s.created_at FROM scans s, current c
      WHERE s.${scope} = $2 AND s.type = $3 AND (s.created_at, s.id) < (c.created_at, c.id)
      ORDER BY s.created_at DESC, s.id DESC LIMIT 1)
     UNION ALL
     (SELECT 'next' AS which, s.id, s.created_at FROM scans s, current c
      WHERE s.${scope} = $2 AND s.type = $3 AND (s.created_at, s.id) > (c.created_at, c.id)
      ORDER BY s.created_at, s.id LIMIT 1)`,
    [scan.id, scopeId, scan.type],
  );
  const pick = (which) => {
    const row = rows.find((candidate) => candidate.which === which);
    return row ? { id: row.id, created_at: row.created_at } : null;
  };
  return { previous: pick('previous'), next: pick('next') };
}
