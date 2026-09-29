import pino from 'pino';
import { config } from '../config/index.js';

// Properties some libraries attach to errors that are huge or reveal internals. The pg driver,
// for example, attaches the whole client (connection parameters, socket state) to errors.
const OMITTED_ERROR_FIELDS = ['client', 'connection', 'socket'];

/**
 * pino's standard error serializer (type, message, stack, cause, own properties) minus
 * OMITTED_ERROR_FIELDS. Also accepts an error pino-http has already serialized.
 * @param {unknown} error
 */
export function serializeError(error) {
  if (!error || typeof error !== 'object') return error;
  const serialized = error instanceof Error ? pino.stdSerializers.err(error) : { ...error };
  for (const field of OMITTED_ERROR_FIELDS) delete serialized[field];
  return serialized;
}

/**
 * Application-wide structured logger.
 * - Production: newline-delimited JSON on stdout (ship to any log collector).
 * - Development: human-readable output via pino-pretty (a devDependency).
 */
export const logger = pino({
  level: config.log.level,
  base: { service: config.app.name },
  serializers: { err: serializeError },
  // Defence in depth: code never logs these, but if an object carrying them is ever logged,
  // the values are masked.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      '*.password',
      'connectionString',
      '*.connectionString',
      'databaseUrl',
      '*.databaseUrl',
      'database.url',
    ],
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
