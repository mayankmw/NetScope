import { env } from '@/config/env';

const DEFAULT_TIMEOUT_MS = 10_000;

/** Error codes produced by the client itself, when no API error envelope is available. */
export const ClientErrorCodes = Object.freeze({
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  SERVER_UNAVAILABLE: 'SERVER_UNAVAILABLE',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
});

const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** Every failed request rejects with an ApiError, whatever the cause. */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code: string, details?: unknown, requestId?: string, cause?: unknown }} options
   */
  constructor(message, { status = 0, code, details, requestId, cause }) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

async function readJson(response) {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toApiError(response, payload) {
  const requestId = payload?.requestId ?? response.headers.get('X-Request-Id') ?? undefined;

  if (payload?.success === false && payload.error) {
    return new ApiError(payload.error.message, {
      status: response.status,
      code: payload.error.code,
      details: payload.error.details,
      requestId,
    });
  }

  // No API envelope. A gateway status means a proxy in front of the API (the Vite dev proxy
  // or a production reverse proxy) could not reach it; anything else means the API misbehaved.
  if (GATEWAY_STATUSES.has(response.status)) {
    return new ApiError('The NetScope server is not reachable.', {
      status: response.status,
      code: ClientErrorCodes.SERVER_UNAVAILABLE,
      requestId,
    });
  }
  return new ApiError(`Unexpected response from server (HTTP ${response.status}).`, {
    status: response.status,
    code: ClientErrorCodes.INVALID_RESPONSE,
    requestId,
  });
}

/**
 * Sends a JSON request to the NetScope API and unwraps the response envelope.
 * Resolves with `data` on success; rejects with ApiError otherwise. If the caller's
 * `signal` aborts, the native AbortError is rethrown so callers can ignore it.
 *
 * @param {string} path Path relative to the API base, e.g. "/health".
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal, timeoutMs?: number }} [options]
 */
async function request(
  path,
  { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combinedSignal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeoutSignal.aborted) {
      throw new ApiError('The server took too long to respond.', {
        code: ClientErrorCodes.TIMEOUT,
        cause: error,
      });
    }
    throw new ApiError('Unable to reach the NetScope server.', {
      code: ClientErrorCodes.NETWORK_ERROR,
      cause: error,
    });
  }

  if (response.status === 204) return null;

  const payload = await readJson(response);
  if (!response.ok || payload?.success !== true) {
    throw toApiError(response, payload);
  }
  return payload.data;
}

export const apiClient = Object.freeze({
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
});
