import * as devicesRepository from '../db/repositories/devices.repository.js';
import * as networksRepository from '../db/repositories/networks.repository.js';
import { db } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';
import { toDeviceDto, toNetworkDto } from './dto.js';

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
  const network = await networksRepository.findNetwork(db, { networkId });

  if (!network) {
    if (networkId) {
      throw new AppError('Network not found.', {
        statusCode: 404,
        code: ErrorCodes.NOT_FOUND,
        details: { networkId },
      });
    }
    return { network: null, devices: [] };
  }

  const rows = await devicesRepository.listDevicesByNetwork(db, network.id);
  return {
    network: toNetworkDto(network),
    devices: rows.map((row) => ({ ...toDeviceDto(row), isGateway: row.is_gateway })),
  };
}
