/**
 * Human labels for the device_types codes seeded by the database (server migration).
 * Unknown codes (added later on the server) fall back to a formatted version of the code.
 */
export const DEVICE_TYPE_LABELS = Object.freeze({
  unknown: 'Unknown',
  router: 'Router',
  access_point: 'Access point',
  switch: 'Switch',
  computer: 'Computer',
  phone: 'Phone',
  tablet: 'Tablet',
  tv: 'TV / streaming',
  speaker: 'Speaker',
  printer: 'Printer',
  camera: 'Camera',
  iot: 'Smart home',
  game_console: 'Game console',
  nas: 'Storage',
  server: 'Server',
  other: 'Other',
});

/** @param {string} code */
export function deviceTypeLabel(code) {
  if (DEVICE_TYPE_LABELS[code]) return DEVICE_TYPE_LABELS[code];
  const text = String(code ?? 'unknown').replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
