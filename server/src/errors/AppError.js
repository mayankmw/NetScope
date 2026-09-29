import { ErrorCodes } from './errorCodes.js';

/**
 * An expected, "operational" error whose message is safe to show to API clients
 * (e.g. validation failures, missing resources). Anything that is not an AppError is
 * treated as a bug: logged in full and returned to the client as a generic 500.
 */
export class AppError extends Error {
  /**
   * @param {string} message Client-safe description of the problem.
   * @param {object} [options]
   * @param {number} [options.statusCode=500]
   * @param {string} [options.code=ErrorCodes.INTERNAL_ERROR]
   * @param {unknown} [options.details] Structured, client-safe context (e.g. field errors).
   * @param {unknown} [options.cause] Underlying error, kept for logs only.
   */
  constructor(
    message,
    { statusCode = 500, code = ErrorCodes.INTERNAL_ERROR, details, cause } = {},
  ) {
    super(message, { cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
