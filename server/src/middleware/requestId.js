import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Accept a caller-supplied ID (e.g. from a reverse proxy) only if it is short and plain,
// so it cannot be used to inject content into logs or response headers.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Assigns every request a correlation ID (`req.id`), echoed in the `X-Request-Id`
 * response header, included in every log line, and returned in error bodies.
 */
export function requestId() {
  return function requestIdMiddleware(req, res, next) {
    const incoming = req.get(REQUEST_ID_HEADER);
    req.id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, req.id);
    next();
  };
}
