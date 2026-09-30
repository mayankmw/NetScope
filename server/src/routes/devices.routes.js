import { Router } from 'express';
import * as devicesController from '../controllers/devices.controller.js';
import { validate } from '../middleware/validate.js';
import { discoverDevicesSchemas, listDevicesSchemas } from '../validators/devices.validators.js';

export const devicesRouter = Router();

devicesRouter.get('/', validate(listDevicesSchemas), devicesController.listDevices);
devicesRouter.post(
  '/discover',
  validate(discoverDevicesSchemas),
  devicesController.discoverDevices,
);
