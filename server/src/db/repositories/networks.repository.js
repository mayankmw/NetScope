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
