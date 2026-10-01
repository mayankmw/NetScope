import * as deviceEventsRepository from '../db/repositories/deviceEvents.repository.js';
import * as devicesRepository from '../db/repositories/devices.repository.js';
import * as networksRepository from '../db/repositories/networks.repository.js';
import { db } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';
import * as network from '../network/index.js';
import { toDeviceDto, toDeviceEventDto, toNetworkDto, toObservationDto } from './dto.js';

function deviceNotFound(deviceId) {
  return new AppError('Device not found.', {
    statusCode: 404,
    code: ErrorCodes.NOT_FOUND,
    details: { deviceId },
  });
}

/**
 * Lists the devices of one network (default: the most recently seen network).
 * Returns `{ network: null, devices: [] }` before the first discovery.
 *
 * The whole inventory is returned at once: a network holds at most ~1,000 devices (sweeps are
 * capped at a /22), so filtering and sorting happen in the client without pagination.
 *
 * @param {{ networkId?: string }} [options]
 */
export async function listDevices({ networkId } = {}) {
  const networkRow = await networksRepository.findNetwork(db, { networkId });

  if (!networkRow) {
    if (networkId) {
      throw new AppError('Network not found.', {
        statusCode: 404,
        code: ErrorCodes.NOT_FOUND,
        details: { networkId },
      });
    }
    return { network: null, devices: [] };
  }

  const rows = await devicesRepository.listDevicesByNetwork(db, networkRow.id);
  const localMacs = network.listLocalMacAddresses();
  return {
    network: toNetworkDto(networkRow),
    devices: rows.map((row) => ({
      ...toDeviceDto(row),
      isGateway: row.is_gateway,
      // The machine NetScope runs on (its MAC belongs to one of this machine's interfaces).
      isSelf: localMacs.has(row.mac_address),
    })),
  };
}

/**
 * Everything the details page shows about one device, apart from its paginated histories:
 * the device, its network, presence, the IP addresses it has used, and, when the device is the
 * machine NetScope runs on, that machine's interface.
 *
 * @param {string} deviceId
 */
export async function getDeviceDetails(deviceId) {
  const device = await devicesRepository.findDeviceById(db, deviceId);
  if (!device) throw deviceNotFound(deviceId);

  const [networkRow, presence, ipHistory] = await Promise.all([
    networksRepository.findNetwork(db, { networkId: device.network_id }),
    devicesRepository.getDevicePresence(db, deviceId),
    devicesRepository.listDeviceIpHistory(db, deviceId),
  ]);
  const localInterface = network.findLocalInterface(device.mac_address);

  return {
    device: {
      ...toDeviceDto(device),
      isGateway: device.is_gateway,
      isSelf: localInterface !== null,
    },
    network: toNetworkDto(networkRow),
    presence: {
      statusSince: presence.status_since,
      timesSeen: presence.times_seen,
      scansSinceFirstSeen: presence.scans_since_first_seen,
      lastLatencyMs: presence.last_latency_ms,
      averageLatencyMs: presence.average_latency_ms,
      latencySamples: presence.latency_samples,
    },
    ipHistory: ipHistory.map((row) => ({
      ipAddress: row.ip_address,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      timesSeen: row.times_seen,
    })),
    localInterface,
  };
}

/**
 * Reads one page (`limit` + 1 rows tells whether another page exists).
 * @returns {Promise<{ items: object[], nextCursor: string | null }>}
 */
async function readPage(deviceId, { limit, before }, listRows, toDto) {
  const [exists, rows] = await Promise.all([
    devicesRepository.deviceExists(db, deviceId),
    listRows(db, { deviceId, before, limit: limit + 1 }),
  ]);
  if (!exists) throw deviceNotFound(deviceId);

  const page = rows.slice(0, limit);
  return {
    items: page.map(toDto),
    nextCursor: rows.length > limit ? page.at(-1).id : null,
  };
}

/**
 * A device's timeline, newest first: discovered, online, offline, and attribute changes.
 * @param {string} deviceId
 * @param {{ limit: number, before?: string }} page
 */
export function listDeviceEvents(deviceId, page) {
  return readPage(deviceId, page, deviceEventsRepository.listDeviceEvents, toDeviceEventDto);
}

/**
 * A device's discovery history, newest first: each scan that saw it, with its IP then.
 * @param {string} deviceId
 * @param {{ limit: number, before?: string }} page
 */
export function listDeviceObservations(deviceId, page) {
  return readPage(deviceId, page, devicesRepository.listDeviceObservations, toObservationDto);
}
