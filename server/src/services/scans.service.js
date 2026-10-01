import * as deviceEventsRepository from '../db/repositories/deviceEvents.repository.js';
import * as devicesRepository from '../db/repositories/devices.repository.js';
import * as portsRepository from '../db/repositories/ports.repository.js';
import * as scansRepository from '../db/repositories/scans.repository.js';
import { db } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';
import * as network from '../network/index.js';
import { toDeviceDto, toPortDto, toScanDto } from './dto.js';

/**
 * The scan history: every discovery and port scan that ran, newest first, with what it found.
 * Read-only: scans are started by POST /api/devices/discover and POST /api/devices/:id/scan.
 *
 * @param {{ type?: 'discovery' | 'port', status?: string, networkId?: string, deviceId?: string,
 *           before?: string, limit: number }} filters
 * @returns {Promise<{ items: object[], nextCursor: string | null }>}
 */
export async function listScans(filters) {
  const { limit } = filters;
  // One extra row tells whether another page exists.
  const rows = await scansRepository.listScans(db, { ...filters, limit: limit + 1 });
  const page = rows.slice(0, limit);
  return {
    items: page.map(toScanDto),
    nextCursor: rows.length > limit ? page.at(-1).id : null,
  };
}

/**
 * What a completed discovery found: each device it saw (with the address, name, and ping time it
 * had then, and what changed), and each known device it did not see.
 */
async function discoveryResults(scan) {
  const [found, missed, events] = await Promise.all([
    devicesRepository.listDevicesFoundByScan(db, scan.id),
    devicesRepository.listDevicesMissedByScan(db, scan.id),
    deviceEventsRepository.listEventsByScan(db, scan.id),
  ]);

  const eventsByDevice = Map.groupBy(events, (event) => event.device_id);
  const eventsOf = (deviceId) => eventsByDevice.get(deviceId) ?? [];
  const localMacs = network.listLocalMacAddresses();
  const toDevice = (row) => ({
    ...toDeviceDto(row),
    isGateway: row.is_gateway,
    isSelf: localMacs.has(row.mac_address),
  });

  return {
    found: found.map((row) => {
      const deviceEvents = eventsOf(row.id);
      return {
        device: toDevice(row),
        ipAddress: row.observed_ip_address,
        hostname: row.observed_hostname,
        latencyMs: row.observed_latency_ms,
        isNew: deviceEvents.some((event) => event.type === 'discovered'),
        backOnline: deviceEvents.some((event) => event.type === 'online'),
        // What this scan saw change: { field: { from, to } }.
        changes: Object.assign(
          {},
          ...deviceEvents.filter((event) => event.type === 'updated').map((event) => event.changes),
        ),
      };
    }),
    missing: missed.map((row) => ({
      device: toDevice(row),
      // Online until this scan; otherwise it was already offline before it.
      wentOffline: eventsOf(row.id).some((event) => event.type === 'offline'),
      lastSeenAt: row.last_seen_before_at,
      lastIpAddress: row.last_seen_before_ip_address,
    })),
  };
}

/** What a completed port scan saw: its open ports, and ports open before that no longer are. */
async function portResults(scan) {
  const rows = await portsRepository.listPortResults(db, scan.id);
  return { ports: rows.map((row) => toPortDto(row, scan)) };
}

/**
 * One scan in detail: the scan with its parameters, its neighbours in the history (discoveries of
 * the same network, or port scans of the same device), and, once completed, its results.
 *
 * @param {string} scanId
 */
export async function getScanDetails(scanId) {
  const row = await scansRepository.findScanById(db, scanId);
  if (!row) {
    throw new AppError('Scan not found.', {
      statusCode: 404,
      code: ErrorCodes.NOT_FOUND,
      details: { scanId },
    });
  }

  const loadResults =
    row.status !== 'completed' ? null : row.type === 'port' ? portResults : discoveryResults;
  const [adjacent, results] = await Promise.all([
    scansRepository.findAdjacentScans(db, row),
    loadResults ? loadResults(row) : null,
  ]);
  const toLink = (scan) => (scan ? { id: scan.id, createdAt: scan.created_at } : null);

  const dto = toScanDto(row);
  return {
    scan: {
      ...dto,
      network: dto.network && { ...dto.network, interfaceName: row.network_interface_name },
      // The exact settings it ran with, recorded for auditing.
      params: row.params,
    },
    previous: toLink(adjacent.previous),
    next: toLink(adjacent.next),
    results,
  };
}
