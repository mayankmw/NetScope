import { Router } from 'express';
import * as devicesController from '../controllers/devices.controller.js';
import { validate } from '../middleware/validate.js';
import {
  discoverDevicesSchemas,
  getDeviceSchemas,
  listDeviceHistorySchemas,
  listDevicesSchemas,
} from '../validators/devices.validators.js';

export const devicesRouter = Router();

devicesRouter.get('/', validate(listDevicesSchemas), devicesController.listDevices);
devicesRouter.post(
  '/discover',
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
