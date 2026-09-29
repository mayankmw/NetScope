/**
 * Every API response uses one envelope, so clients can handle them uniformly:
 *
 *   success: { success: true,  data,       error: null }                       (+ meta when paginated)
 *   failure: { success: false, data: null, error: { code, message, details?, requestId } }
 *
 * See docs/API.md for the full contract.
 */

/**
 * @param {import('express').Response} res
 * @param {unknown} data
 * @param {{ statusCode?: number, meta?: Record<string, unknown> }} [options]
 */
export function sendSuccess(res, data, { statusCode = 200, meta } = {}) {
  const body = { success: true, data, error: null };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

/**
 * @param {{ code: string, message: string, details?: unknown, requestId?: string }} error
 */
export function buildErrorBody({ code, message, details, requestId }) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  error.requestId = requestId;
  return { success: false, data: null, error };
}
