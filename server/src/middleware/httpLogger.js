import { pinoHttp } from 'pino-http';
import { logger, serializeError } from '../utils/logger.js';

/**
 * Logs exactly one line per request on completion, and attaches a request-scoped
 * child logger as `req.log`. For unexpected errors the error handler sets `res.err`,
 * so the stack trace is logged here instead of being logged twice.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customLogLevel(req, res, err) {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
    err: serializeError,
  },
});
