import pino from 'pino';
import { config } from '../config/index.js';

/**
 * Application-wide structured logger.
 * - Production: newline-delimited JSON on stdout (ship to any log collector).
 * - Development: human-readable output via pino-pretty (a devDependency).
 */
export const logger = pino({
  level: config.log.level,
  base: { service: config.app.name },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
  ...(config.isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        singleLine: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname,service',
      },
    },
  }),
});
