import { config } from '../config/index.js';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';
import { buildErrorBody } from '../utils/apiResponse.js';

const GENERIC_MESSAGE = 'An unexpected error occurred.';

/**
 * Maps errors raised by Express's body parser to client errors.
 * @param {any} err
 * @returns {AppError | null}
 */
function fromBodyParserError(err) {
  switch (err?.type) {
    case 'entity.parse.failed':
      return new AppError('Request body contains invalid JSON.', {
        statusCode: 400,
        code: ErrorCodes.INVALID_JSON,
      });
    case 'entity.too.large':
      return new AppError('Request body is too large.', {
        statusCode: 413,
        code: ErrorCodes.PAYLOAD_TOO_LARGE,
      });
    default:
      if (err?.expose && err.status >= 400 && err.status < 500) {
        return new AppError(err.message, { statusCode: err.status, code: ErrorCodes.BAD_REQUEST });
      }
      return null;
  }
}

/** Internals are never sent to clients, except in local development for debugging. */
function clientMessage(appError, err) {
  if (appError) return appError.message;
  if (config.isDevelopment && err?.message) return err.message;
  return GENERIC_MESSAGE;
}

/**
 * Central error handler: the only place that turns errors into HTTP responses.
 * Express 5 forwards rejected promises from async handlers here automatically.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    // Too late for a clean response; Express's default handler closes the connection.
    return next(err);
  }

  const appError = err instanceof AppError ? err : fromBodyParserError(err);

  if (!appError) {
    // Unexpected error = bug. pino-http logs `res.err` (with stack) on the request's log line.
    res.err = err;
  }

  res.status(appError?.statusCode ?? 500).json(
    buildErrorBody({
      code: appError?.code ?? ErrorCodes.INTERNAL_ERROR,
      message: clientMessage(appError, err),
      details: appError?.details,
      requestId: req.id,
    }),
  );
}
