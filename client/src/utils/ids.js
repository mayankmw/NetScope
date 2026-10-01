const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a UUID string (the format of every NetScope id). */
export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}
