/**
 * Failure raised by the network layer. The layer knows nothing about HTTP: the discovery
 * service maps these codes to API errors.
 */
export class NetworkError extends Error {
  /**
   * @param {string} code One of NetworkErrorCodes.
   * @param {string} message Safe to show to API clients.
   * @param {{ cause?: unknown, details?: Record<string, unknown> }} [options]
   */
  constructor(code, message, { cause, details } = {}) {
    super(message, { cause });
    this.name = 'NetworkError';
    this.code = code;
    this.details = details;
  }
}

export const NetworkErrorCodes = Object.freeze({
  PLATFORM_NOT_SUPPORTED: 'PLATFORM_NOT_SUPPORTED',
  TOOL_UNAVAILABLE: 'TOOL_UNAVAILABLE',
  COMMAND_TIMEOUT: 'COMMAND_TIMEOUT',
  COMMAND_ABORTED: 'COMMAND_ABORTED',
  COMMAND_FAILED: 'COMMAND_FAILED',
  OUTPUT_TOO_LARGE: 'OUTPUT_TOO_LARGE',
  NO_USABLE_INTERFACE: 'NO_USABLE_INTERFACE',
  NO_DEFAULT_GATEWAY: 'NO_DEFAULT_GATEWAY',
  GATEWAY_UNRESOLVED: 'GATEWAY_UNRESOLVED',
  TARGET_NOT_ALLOWED: 'TARGET_NOT_ALLOWED',
});
