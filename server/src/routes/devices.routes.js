import { Router } from 'express';
import { config } from '../config/index.js';
import * as devicesController from '../controllers/devices.controller.js';
import { scanRateLimit } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
  discoverDevicesSchemas,
  getDeviceHistorySchemas,
  getDevicePortsSchemas,
  getDeviceSchemas,
  listDeviceHistorySchemas,
  listDevicesSchemas,
  startPortScanSchemas,
} from '../validators/devices.validators.js';

export const devicesRouter = Router();

// Endpoints that start a scan are rate limited, each with its own budget.
const discoveryRateLimit = scanRateLimit({ name: 'discovery', ...config.scan.rateLimit });
const portScanRateLimit = scanRateLimit({ name: 'port-scan', ...config.scan.rateLimit });

devicesRouter.get('/', validate(listDevicesSchemas), devicesController.listDevices);
devicesRouter.post(
  '/discover',
  discoveryRateLimit,
  validate(discoverDevicesSchemas),
  devicesController.discoverDevices,
);
devicesRouter.get('/:deviceId', validate(getDeviceSchemas), devicesController.getDevice);
devicesRouter.get(
  '/:deviceId/events',
  validate(listDeviceHistorySchemas),
  devicesController.listDeviceEvents,
);
devicesRouter.get(
  '/:deviceId/observations',
  validate(listDeviceHistorySchemas),
  devicesController.listDeviceObservations,
);
devicesRouter.get(
  '/:deviceId/history',
  validate(getDeviceHistorySchemas),
  devicesController.getDeviceHistory,
);
devicesRouter.post(
  '/:deviceId/scan',
  portScanRateLimit,
  validate(startPortScanSchemas),
  devicesController.startPortScan,
);
devicesRouter.get(
  '/:deviceId/ports',
  validate(getDevicePortsSchemas),
  devicesController.getDevicePorts,
);
