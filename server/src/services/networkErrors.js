import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';
import { NetworkError, NetworkErrorCodes } from '../network/index.js';

const STATUS_BY_CODE = {
  [NetworkErrorCodes.PLATFORM_NOT_SUPPORTED]: [501, ErrorCodes.PLATFORM_NOT_SUPPORTED],
  [NetworkErrorCodes.TOOL_UNAVAILABLE]: [503, ErrorCodes.TOOL_UNAVAILABLE],
  [NetworkErrorCodes.NO_DEFAULT_GATEWAY]: [503, ErrorCodes.NETWORK_UNAVAILABLE],
  [NetworkErrorCodes.NO_USABLE_INTERFACE]: [503, ErrorCodes.NETWORK_UNAVAILABLE],
  [NetworkErrorCodes.GATEWAY_UNRESOLVED]: [503, ErrorCodes.NETWORK_UNAVAILABLE],
  [NetworkErrorCodes.TARGET_NOT_ALLOWED]: [422, ErrorCodes.TARGET_NOT_ALLOWED],
};

/**
 * Maps a network-layer failure to an API error (its messages are written to be client-safe).
 * Returns null for anything that is not a NetworkError.
 *
 * @param {unknown} error
 * @param {string} fallbackCode API code for command failures, e.g. DISCOVERY_FAILED
 */
export function networkErrorToAppError(error, fallbackCode) {
  if (!(error instanceof NetworkError)) return null;
  const [statusCode, code] = STATUS_BY_CODE[error.code] ?? [503, fallbackCode];
  return new AppError(error.message, { statusCode, code, cause: error });
}
