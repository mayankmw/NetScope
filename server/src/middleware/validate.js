import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';

const PARTS = ['params', 'query', 'body'];

/**
 * Validates request parts against zod schemas. On success the parsed values are available as
 * `req.validated.{params,query,body}` (Express 5 makes `req.query` read-only, so parsed values
 * are not written back). On failure responds 400 VALIDATION_ERROR with per-field details.
 *
 * @param {{ params?: import('zod').ZodType, query?: import('zod').ZodType, body?: import('zod').ZodType }} schemas
 */
export function validate(schemas) {
  return function validateRequest(req, res, next) {
    const validated = {};
    const details = [];

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      // A request without a body has req.body === undefined in Express 5.
      const input = part === 'body' ? (req.body ?? {}) : req[part];
      const result = schema.safeParse(input);
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ path: [part, ...issue.path].join('.'), message: issue.message });
        }
      }
    }

    if (details.length > 0) {
      return next(
        new AppError('Request validation failed.', {
          statusCode: 400,
          code: ErrorCodes.VALIDATION_ERROR,
          details,
        }),
      );
    }

    req.validated = validated;
    next();
  };
}
