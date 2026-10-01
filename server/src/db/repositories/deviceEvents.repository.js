/** @typedef {import('./networks.repository.js').Executor} Executor */

/**
 * @typedef {object} DeviceEventRecord
 * @property {string} deviceId
 * @property {'discovered' | 'online' | 'offline' | 'updated'} type
 * @property {string} ipAddress the device's IP when it happened
 * @property {Record<string, { from: unknown, to: unknown }>} changes empty unless type is 'updated'
 */

/**
 * Appends events to device timelines, in the given order, in one statement.
 *
 * @param {Executor} db
 * @param {{ scanId: string, events: DeviceEventRecord[] }} input
 */
export async function insertDeviceEvents(db, { scanId, events }) {
  if (events.length === 0) return;
  await db.query(
    `INSERT INTO device_events (device_id, scan_id, type, ip_address, changes)
     SELECT e.device_id, $1, e.type, e.ip_address, e.changes
     FROM unnest($2::uuid[], $3::text[], $4::inet[], $5::jsonb[])
          WITH ORDINALITY AS e(device_id, type, ip_address, changes, position)
     ORDER BY e.position`,
    [
      scanId,
      events.map((event) => event.deviceId),
      events.map((event) => event.type),
      events.map((event) => event.ipAddress),
      events.map((event) => JSON.stringify(event.changes)),
    ],
  );
}

/**
 * One page of a device's timeline, newest first. `before` is the id of the last event of the
 * previous page; the keyset is (occurred_at, id), compared in SQL so no precision is lost.
 *
 * @param {Executor} db
 * @param {{ deviceId: string, before?: string, limit: number }} options
 */
export async function listDeviceEvents(db, { deviceId, before = null, limit }) {
  const { rows } = await db.query(
    `SELECT e.id, e.scan_id, e.type, e.ip_address, e.changes, e.occurred_at
     FROM device_events e
     WHERE e.device_id = $1
       AND ($2::bigint IS NULL
            OR (e.occurred_at, e.id) < (SELECT occurred_at, id FROM device_events WHERE id = $2))
     ORDER BY e.occurred_at DESC, e.id DESC
     LIMIT $3`,
    [deviceId, before, limit],
  );
  return rows;
}

/**
 * Everything one discovery scan recorded on device timelines, in the order it happened.
 * @param {Executor} db
 * @param {string} scanId
 */
export async function listEventsByScan(db, scanId) {
  const { rows } = await db.query(
    `SELECT id, device_id, type, ip_address, changes, occurred_at
     FROM device_events
     WHERE scan_id = $1
     ORDER BY occurred_at, id`,
    [scanId],
  );
  return rows;
}

/**
 * A device's status events (discovered, online, offline) from `from` on, oldest first, preceded
 * by the last one before `from`, which gives the status the period starts with.
 *
 * @param {Executor} db
 * @param {{ deviceId: string, from: Date }} options
 */
export async function listStatusEvents(db, { deviceId, from }) {
  const { rows } = await db.query(
    `(SELECT id, type, occurred_at, scan_id FROM device_events
      WHERE device_id = $1 AND type IN ('discovered', 'online', 'offline') AND occurred_at < $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT 1)
     UNION ALL
     (SELECT id, type, occurred_at, scan_id FROM device_events
      WHERE device_id = $1 AND type IN ('discovered', 'online', 'offline') AND occurred_at >= $2
      ORDER BY occurred_at, id)`,
    [deviceId, from],
  );
  return rows;
}
