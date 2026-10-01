/**
 * @typedef {{ query: (text: string, params?: unknown[]) => Promise<import('pg').QueryResult> }} Executor
 */

/**
 * Records a sighting of a network, creating it the first time. A network is identified by its
 * gateway MAC and subnet.
 *
 * @param {Executor} db
 * @param {{ cidr: string, gatewayIp: string, gatewayMac: string, interfaceName: string }} network
 */
export async function upsertNetwork(db, { cidr, gatewayIp, gatewayMac, interfaceName }) {
  const { rows } = await db.query(
    `INSERT INTO networks (cidr, gateway_ip, gateway_mac, interface_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (gateway_mac, cidr) DO UPDATE SET
       gateway_ip     = EXCLUDED.gateway_ip,
       interface_name = EXCLUDED.interface_name,
       last_seen_at   = now()
     RETURNING id, name, cidr, gateway_ip, gateway_mac, interface_name, first_seen_at, last_seen_at`,
    [cidr, gatewayIp, gatewayMac, interfaceName],
  );
  return rows[0];
}

/**
 * A network with its most recent completed discovery scan. Without `networkId`, returns the
 * network seen most recently: the one this machine is on, or was last on.
 *
 * @param {Executor} db
 * @param {{ networkId?: string | null }} [options]
 */
export async function findNetwork(db, { networkId = null } = {}) {
  const { rows } = await db.query(
    `SELECT n.id, n.name, n.cidr, n.gateway_ip, n.gateway_mac, n.interface_name,
            n.first_seen_at, n.last_seen_at,
            s.id AS last_scan_id, s.finished_at AS last_scan_finished_at
     FROM networks n
     LEFT JOIN LATERAL (
       SELECT id, finished_at FROM scans
       WHERE network_id = n.id AND type = 'discovery' AND status = 'completed'
       ORDER BY finished_at DESC
       LIMIT 1
     ) s ON true
     WHERE $1::uuid IS NULL OR n.id = $1::uuid
     ORDER BY n.last_seen_at DESC
     LIMIT 1`,
    [networkId],
  );
  return rows[0] ?? null;
}

/**
 * The recorded network with this identity (gateway MAC + subnet), or null if discovery has never
 * seen it.
 *
 * @param {Executor} db
 * @param {{ gatewayMac: string, cidr: string }} identity
 */
export async function findNetworkByIdentity(db, { gatewayMac, cidr }) {
  const { rows } = await db.query(
    'SELECT id, cidr, gateway_ip, gateway_mac FROM networks WHERE gateway_mac = $1 AND cidr = $2',
    [gatewayMac, cidr],
  );
  return rows[0] ?? null;
}
