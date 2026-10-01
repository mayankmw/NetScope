/** @typedef {import('./networks.repository.js').Executor} Executor */

/** An alert with its network's subnet and what identifies its device now. */
const ALERT_COLUMNS = `a.id, a.network_id, a.device_id, a.scan_id, a.type, a.severity, a.status,
  a.message, a.context, a.dedup_key, a.occurrences, a.created_at, a.last_occurred_at, a.read_at,
  a.resolved_at, a.updated_at, n.cidr AS network_cidr,
  d.ip_address AS device_ip_address, d.mac_address AS device_mac_address,
  d.mac_is_random AS device_mac_is_random, d.hostname AS device_hostname,
  d.display_name AS device_display_name, d.vendor AS device_vendor,
  d.device_type AS device_device_type, d.status AS device_status,
  d.mac_address = n.gateway_mac AS device_is_gateway`;

const ALERT_FROM = `alerts a
  JOIN networks n ON n.id = a.network_id
  LEFT JOIN devices d ON d.id = a.device_id`;

/**
 * Records one occurrence of an alert, deduplicated by its key:
 *
 * - an open (unread or read) alert with the same key exists → that alert is updated: one more
 *   occurrence, the latest time, message, and details; its state does not change (`merged`);
 * - the key's last alert was resolved less than `cooldownMs` ago → nothing is recorded
 *   (`suppressed`);
 * - otherwise a new unread alert is created (`created`).
 *
 * One statement, so it is safe even if two writers raced: the partial unique index on open keys
 * decides between creating and merging.
 *
 * @param {Executor} db
 * @param {import('../../services/alertRules.js').AlertCandidate} alert
 * @param {{ cooldownMs: number }} policy
 * @returns {Promise<{ id: string, outcome: 'created' | 'merged' } | { id: null, outcome: 'suppressed' }>}
 */
export async function recordAlert(db, alert, { cooldownMs }) {
  const { rows } = await db.query(
    `INSERT INTO alerts (network_id, device_id, scan_id, type, severity, message, context,
                         dedup_key)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8
     WHERE NOT EXISTS (
       SELECT 1 FROM alerts
       WHERE dedup_key = $8 AND status = 'resolved'
         AND resolved_at > now() - make_interval(secs => $9::double precision / 1000)
     )
     ON CONFLICT (dedup_key) WHERE status <> 'resolved' DO UPDATE SET
       occurrences      = alerts.occurrences + 1,
       last_occurred_at = now(),
       scan_id          = EXCLUDED.scan_id,
       severity         = EXCLUDED.severity,
       message          = EXCLUDED.message,
       context          = EXCLUDED.context
     RETURNING id, (xmax = 0) AS created`,
    [
      alert.networkId,
      alert.deviceId,
      alert.scanId,
      alert.type,
      alert.severity,
      alert.message,
      alert.context,
      alert.dedupKey,
      cooldownMs,
    ],
  );
  if (rows.length === 0) return { id: null, outcome: 'suppressed' };
  return { id: rows[0].id, outcome: rows[0].created ? 'created' : 'merged' };
}

/**
 * Alerts by id, in the given order.
 * @param {Executor} db
 * @param {string[]} ids
 */
export async function findAlertsByIds(db, ids) {
  if (ids.length === 0) return [];
  const { rows } = await db.query(
    `SELECT ${ALERT_COLUMNS} FROM ${ALERT_FROM}
     WHERE a.id = ANY ($1::uuid[])
     ORDER BY array_position($1::uuid[], a.id)`,
    [ids],
  );
  return rows;
}

/** @param {Executor} db @param {string} alertId */
export async function findAlertById(db, alertId) {
  const [row] = await findAlertsByIds(db, [alertId]);
  return row ?? null;
}

/**
 * One page of alerts, newest first (by when each was first raised). Every filter is optional;
 * `statuses` matches any of them. `before` is the id of the last alert of the previous page; the
 * keyset is (created_at, id).
 *
 * @param {Executor} db
 * @param {{ statuses?: string[] | null, type?: string | null, deviceId?: string | null,
 *           before?: string | null, limit: number }} options
 */
export async function listAlerts(
  db,
  { statuses = null, type = null, deviceId = null, before = null, limit },
) {
  const { rows } = await db.query(
    `SELECT ${ALERT_COLUMNS} FROM ${ALERT_FROM}
     WHERE ($1::text[] IS NULL OR a.status = ANY ($1))
       AND ($2::text IS NULL OR a.type = $2)
       AND ($3::uuid IS NULL OR a.device_id = $3)
       AND ($4::uuid IS NULL
            OR (a.created_at, a.id) < (SELECT created_at, id FROM alerts WHERE id = $4))
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $5`,
    [statuses, type, deviceId, before, limit],
  );
  return rows;
}

/**
 * How many alerts are in each state.
 * @param {Executor} db
 * @returns {Promise<{ unread: number, read: number, resolved: number }>}
 */
export async function countAlertsByStatus(db) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE status = 'unread')::int   AS unread,
            count(*) FILTER (WHERE status = 'read')::int     AS read,
            count(*) FILTER (WHERE status = 'resolved')::int AS resolved
     FROM alerts`,
  );
  return rows[0];
}

/**
 * Moves alerts to `status`, keeping read_at / resolved_at consistent: reading sets read_at once;
 * "unread" clears it; resolving also marks as read; reopening clears resolved_at. Only alerts
 * currently in one of `from` (default: any other state) change.
 *
 * @param {Executor} db
 * @param {{ ids?: string[] | null, from?: string[] | null,
 *           status: 'unread' | 'read' | 'resolved' }} change `ids` null = every alert
 * @returns {Promise<string[]>} ids of the alerts that changed
 */
export async function setAlertStatus(db, { ids = null, from = null, status }) {
  const { rows } = await db.query(
    `UPDATE alerts SET
       status      = $3,
       read_at     = CASE WHEN $3 = 'unread' THEN NULL ELSE COALESCE(read_at, now()) END,
       resolved_at = CASE WHEN $3 = 'resolved' THEN COALESCE(resolved_at, now()) ELSE NULL END
     WHERE ($1::uuid[] IS NULL OR id = ANY ($1))
       AND ($2::text[] IS NULL OR status = ANY ($2))
       AND status <> $3
     RETURNING id`,
    [ids, from, status],
  );
  return rows.map((row) => row.id);
}

/** @param {Executor} db @param {string} alertId */
export async function alertExists(db, alertId) {
  const { rows } = await db.query('SELECT EXISTS (SELECT 1 FROM alerts WHERE id = $1) AS found', [
    alertId,
  ]);
  return rows[0].found;
}
