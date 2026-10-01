import { rateLimit } from 'express-rate-limit';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';

/**
 * Limits how often a client may start scans. Each limiter counts on its own (discovery and port
 * scans have separate budgets), per client IP, in a sliding window held in memory: NetScope is a
 * single process.
 *
 * Only accepted requests count: a 409 "a scan is already running" or a validation error does
 * not use up the budget. Responses carry the standard `RateLimit` / `RateLimit-Policy` headers;
 * a refusal is 429 RATE_LIMITED with `Retry-After`, in the usual error envelope.
 *
 * @param {{ name: string, limit: number, windowMs: number }} options
 */
export function scanRateLimit({ name, limit, windowMs }) {
  return rateLimit({
    windowMs,
    limit,
    identifier: name,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipFailedRequests: true,
    handler(req, res, next) {
      const retryAfterSeconds = Number(res.getHeader('Retry-After')) || Math.ceil(windowMs / 1000);
      next(
        new AppError(`Too many scans started. Try again in ${retryAfterSeconds} s.`, {
          statusCode: 429,
          code: ErrorCodes.RATE_LIMITED,
          details: { retryAfterSeconds, limit, windowSeconds: Math.round(windowMs / 1000) },
        }),
      );
    },
  });
}
