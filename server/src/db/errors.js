import pg from 'pg';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';

// Socket-level failures while reaching PostgreSQL.
const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
]);

// Errors raised by pg / pg-pool without a code.
const CONNECTION_ERROR_MESSAGES = [
  'timeout exceeded when trying to connect',
  'Connection terminated',
];

/**
 * SQLSTATEs meaning "the database cannot be used right now" rather than "this query is wrong":
 * class 08 connection exception, class 28 invalid authorization (bad credentials),
 * 3D000 database does not exist, 53300 too many connections, 57P01–57P03 server shutting down.
 * @param {string} code
 */
function isUnavailableSqlState(code) {
  return (
    code.startsWith('08') ||
    code.startsWith('28') ||
    ['3D000', '53300', '57P01', '57P02', '57P03'].includes(code)
  );
}

function unavailable(cause, message = 'The database is unavailable.') {
  return new AppError(message, {
    statusCode: 503,
    code: ErrorCodes.DATABASE_UNAVAILABLE,
    cause,
  });
}

/**
 * Translates a driver error into a client-safe AppError, or returns null when the error is a
 * programming error (bad SQL, violated CHECK) that should surface as a 500.
 * The original error is kept as `cause`, so it is logged but never sent to the client.
 *
 * @param {unknown} error
 * @returns {AppError | null}
 */
export function toAppError(error) {
  if (error instanceof pg.DatabaseError) {
    if (error.code === '23505') {
      return new AppError('The request conflicts with existing data.', {
        statusCode: 409,
        code: ErrorCodes.CONFLICT,
        cause: error,
      });
    }
    if (error.code === '57014') {
      return unavailable(error, 'The database took too long to respond.');
    }
    if (error.code && isUnavailableSqlState(error.code)) {
      return unavailable(error);
    }
    return null;
  }

  if (error instanceof Error) {
    const isNetworkError = NETWORK_ERROR_CODES.has(/** @type {any} */ (error).code);
    const isConnectionError = CONNECTION_ERROR_MESSAGES.some((text) =>
      error.message.startsWith(text),
    );
    if (isNetworkError || isConnectionError) return unavailable(error);
  }

  return null;
}
