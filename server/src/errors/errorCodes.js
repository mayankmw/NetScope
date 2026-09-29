/**
 * Stable, machine-readable error codes returned in `error.code`.
 * Clients branch on these, never on human-readable messages. Add codes here as
 * features land; never rename or reuse an existing code.
 */
export const ErrorCodes = Object.freeze({
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_JSON: 'INVALID_JSON',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
});
