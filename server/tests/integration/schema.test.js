import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getMigrationStatus } from '../../src/db/migrator.js';
import { closePool, query, withTransaction } from '../../src/db/pool.js';
import { insertDevice, insertNetwork, insertScan, resetDatabase } from '../helpers/db.js';

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';

beforeEach(() => resetDatabase());
afterAll(() => closePool());

describe('migrations', () => {
  it('has applied every migration', async () => {
    const { pending, applied } = await getMigrationStatus(query);

    expect(pending).toEqual([]);
    expect(applied.length).toBeGreaterThan(0);
  });

  it('seeds the device type lookup', async () => {
    const { rows } = await query('SELECT code FROM device_types ORDER BY sort_order');

    expect(rows.map((row) => row.code)).toEqual(
      expect.arrayContaining(['unknown', 'router', 'phone', 'computer', 'other']),
    );
  });
});

describe('networks', () => {
  it('rejects a gateway outside the subnet', async () => {
    await expect(
      insertNetwork({ cidr: '192.168.1.0/24', gatewayIp: '10.0.0.1' }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint: 'networks_gateway_in_cidr' });
  });

  it('allows the same subnet behind different gateways', async () => {
    await insertNetwork({ gatewayMac: 'a4:83:e7:00:00:01' });

    await expect(insertNetwork({ gatewayMac: 'a4:83:e7:00:00:02' })).resolves.toBeDefined();
  });
});

describe('devices: identity', () => {
  it('identifies a device by MAC within a network', async () => {
    const network = await insertNetwork();
    await insertDevice(network.id, { macAddress: 'a4:83:e7:12:34:56', ipAddress: '192.168.1.20' });

    // Same MAC, new IP (DHCP renewal) must update the device, never create a second one.
    await expect(
      insertDevice(network.id, { macAddress: 'a4:83:e7:12:34:56', ipAddress: '192.168.1.99' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('allows the same MAC on a different network', async () => {
    const home = await insertNetwork({ gatewayMac: 'a4:83:e7:00:00:01' });
    const office = await insertNetwork({
      cidr: '10.0.0.0/24',
      gatewayIp: '10.0.0.1',
      gatewayMac: 'a4:83:e7:00:00:02',
    });

    await insertDevice(home.id);
    await expect(insertDevice(office.id, { ipAddress: '10.0.0.20' })).resolves.toBeDefined();
  });

  it('normalizes MAC address formatting', async () => {
    const network = await insertNetwork();
    const device = await insertDevice(network.id, { macAddress: 'A4-83-E7-AB-CD-EF' });

    expect(device.mac_address).toBe('a4:83:e7:ab:cd:ef');
  });

  it('flags randomized (locally administered) MAC addresses', async () => {
    const network = await insertNetwork();
    const vendorMac = await insertDevice(network.id, { macAddress: 'a4:83:e7:12:34:56' });
    const randomMac = await insertDevice(network.id, {
      macAddress: 'da:a1:19:12:34:56',
      ipAddress: '192.168.1.21',
    });

    expect(vendorMac.mac_is_random).toBe(false);
    expect(randomMac.mac_is_random).toBe(true);
  });

  it('rejects a subnet in place of a host IP', async () => {
    const network = await insertNetwork();

    await expect(insertDevice(network.id, { ipAddress: '192.168.1.0/24' })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it('rejects an unknown device type', async () => {
    const network = await insertNetwork();

    await expect(insertDevice(network.id, { deviceType: 'toaster' })).rejects.toMatchObject({
      code: FOREIGN_KEY_VIOLATION,
    });
  });

  it('maintains updated_at on update', async () => {
    const network = await insertNetwork();
    const device = await insertDevice(network.id);

    const { rows } = await query(
      "UPDATE devices SET display_name = 'Living room TV' WHERE id = $1 RETURNING *",
      [device.id],
    );

    expect(rows[0].updated_at.getTime()).toBeGreaterThan(device.updated_at.getTime());
    expect(rows[0].created_at).toEqual(device.created_at);
  });

  it('removes a network’s devices and history when the network is deleted', async () => {
    const network = await insertNetwork();
    const device = await insertDevice(network.id);
    const scan = await insertScan({ networkId: network.id });
    await query(
      'INSERT INTO device_observations (scan_id, device_id, ip_address) VALUES ($1, $2, $3)',
      [scan.id, device.id, '192.168.1.20'],
    );

    await query('DELETE FROM networks WHERE id = $1', [network.id]);

    const { rows } = await query(
      `SELECT (SELECT count(*) FROM devices)::int AS devices,
              (SELECT count(*) FROM device_observations)::int AS observations`,
    );
    expect(rows[0]).toEqual({ devices: 0, observations: 0 });
  });
});

describe('scans', () => {
  it('allows only one queued or running scan at a time', async () => {
    const running = await insertScan({ status: 'running', startedAt: new Date() });

    await expect(insertScan({ status: 'queued' })).rejects.toMatchObject({ code: 'CONFLICT' });

    await query("UPDATE scans SET status = 'completed', finished_at = now() WHERE id = $1", [
      running.id,
    ]);
    await expect(insertScan({ status: 'queued' })).resolves.toBeDefined();
  });

  it('requires a target device for port scans', async () => {
    await expect(insertScan({ type: 'port', target: '192.168.1.20' })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: 'scans_port_scan_has_device',
    });
  });

  it('requires finished_at exactly when a scan has finished', async () => {
    await expect(insertScan({ status: 'completed', startedAt: new Date() })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: 'scans_finished_when_done',
    });
  });

  it('requires the history counts in a discovery summary', async () => {
    await expect(
      insertScan({
        status: 'completed',
        startedAt: new Date(),
        finishedAt: new Date(),
        summary: { devicesFound: 3 },
      }),
    ).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: 'scans_discovery_summary_counts',
    });
    await expect(
      insertScan({
        status: 'completed',
        startedAt: new Date(),
        finishedAt: new Date(),
        summary: { devicesFound: 3, newDevices: 0, missingDevices: 1 },
      }),
    ).resolves.toBeDefined();
  });

  it('records each device at most once per scan', async () => {
    const network = await insertNetwork();
    const device = await insertDevice(network.id);
    const scan = await insertScan({ networkId: network.id });
    const observe = () =>
      query(
        'INSERT INTO device_observations (scan_id, device_id, ip_address) VALUES ($1, $2, $3)',
        [scan.id, device.id, '192.168.1.20'],
      );

    await observe();
    await expect(observe()).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('withTransaction', () => {
  it('commits when the work succeeds', async () => {
    await withTransaction((client) =>
      client.query(
        `INSERT INTO networks (cidr, gateway_ip, gateway_mac, interface_name)
         VALUES ('192.168.1.0/24', '192.168.1.1', 'a4:83:e7:00:00:01', 'en0')`,
      ),
    );

    const { rows } = await query('SELECT count(*)::int AS count FROM networks');
    expect(rows[0].count).toBe(1);
  });

  it('rolls back everything when the work fails', async () => {
    await expect(
      withTransaction(async (client) => {
        await client.query(
          `INSERT INTO networks (cidr, gateway_ip, gateway_mac, interface_name)
           VALUES ('192.168.1.0/24', '192.168.1.1', 'a4:83:e7:00:00:01', 'en0')`,
        );
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');

    const { rows } = await query('SELECT count(*)::int AS count FROM networks');
    expect(rows[0].count).toBe(0);
  });
});
