/**
 * Real-time event contract, shared by the server (publisher) and the client (consumer).
 * Documented in docs/API.md (section 7, WebSocket). Never rename or reuse a type: add new ones.
 *
 * Every event has the same envelope:
 *   { v: 1, id: "<uuid>", type: "<domain>.<event>", timestamp: "<ISO 8601>", data: { … } }
 */

export const EVENT_VERSION = 1;

export const EventTypes = Object.freeze({
  // Connection lifecycle (server → one client)
  SYSTEM_CONNECTED: 'system.connected',
  SYSTEM_HEARTBEAT: 'system.heartbeat',
  SYSTEM_PONG: 'system.pong',
  SYSTEM_ERROR: 'system.error',

  // Discovery runs (server → all clients)
  DISCOVERY_STARTED: 'discovery.started',
  DISCOVERY_COMPLETED: 'discovery.completed',
  DISCOVERY_FAILED: 'discovery.failed',

  // Device changes (server → all clients)
  DEVICE_DISCOVERED: 'device.discovered',
  DEVICE_UPDATED: 'device.updated',
  DEVICE_ONLINE: 'device.online',
  DEVICE_OFFLINE: 'device.offline',

  // Port scans of one device (server → all clients)
  PORT_SCAN_STARTED: 'portscan.started',
  PORT_SCAN_COMPLETED: 'portscan.completed',
  PORT_SCAN_FAILED: 'portscan.failed',

  // Alerts (server → all clients)
  ALERT_CREATED: 'alert.created',
  ALERT_UPDATED: 'alert.updated',
  ALERTS_UPDATED: 'alerts.updated',
});

/** Messages a client may send. Anything else is rejected. */
export const ClientMessageTypes = Object.freeze({
  PING: 'ping',
});
