import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';

/** Catches requests that matched no route and forwards a 404 to the error handler. */
export function notFound(req, res, next) {
  next(
    new AppError('The requested resource was not found.', {
      statusCode: 404,
      code: ErrorCodes.NOT_FOUND,
      details: { method: req.method, path: req.path },
    }),
  );
}
