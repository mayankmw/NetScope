/**
 * Every API response uses one envelope so clients can handle them uniformly:
 *
 *   success: { success: true,  data, meta? }
 *   failure: { success: false, error: { code, message, details? }, requestId }
 *
 * See docs/API.md for the full contract.
 */

/**
 * @param {import('express').Response} res
 * @param {unknown} data
 * @param {{ statusCode?: number, meta?: Record<string, unknown> }} [options]
 */
export function sendSuccess(res, data, { statusCode = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

/**
 * @param {{ code: string, message: string, details?: unknown, requestId?: string }} error
 */
export function buildErrorBody({ code, message, details, requestId }) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return { success: false, error, requestId };
}
