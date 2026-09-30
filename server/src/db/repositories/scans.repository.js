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

/** @param {Executor} db @param {string} scanId */
export async function completeScan(db, scanId) {
  const { rows } = await db.query(
    `UPDATE scans SET status = 'completed', finished_at = now()
     WHERE id = $1 AND status = 'running'
     RETURNING id, status, started_at, finished_at`,
    [scanId],
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
