import { randomUUID } from 'node:crypto';
import { ClientMessageTypes, EventTypes } from '@netscope/shared/events';
import { WebSocket, WebSocketServer } from 'ws';
import { createEvent } from '../events/eventBus.js';
import { logger } from '../utils/logger.js';
import { parseClientMessage } from './messages.js';

const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_CLIENTS = 100;
// A client this far behind is not reading; it is closed and resyncs over REST when it reconnects.
const MAX_BUFFERED_BYTES = 1024 * 1024;
const MAX_INVALID_MESSAGES = 5;
const CLOSE_TIMEOUT_MS = 1_000;

const CloseCodes = Object.freeze({
  GOING_AWAY: 1001,
  UNSUPPORTED_DATA: 1003,
  POLICY_VIOLATION: 1008,
  TRY_AGAIN_LATER: 1013,
});

/**
 * @typedef {object} WebSocketOptions
 * @property {string} path endpoint, e.g. "/ws"
 * @property {number} heartbeatIntervalMs
 * @property {string[]} allowedOrigins browser origins allowed to connect (CORS allowlist)
 * @property {import('../events/eventBus.js').EventBus} eventBus events to broadcast
 * @property {string} serverVersion
 * @property {() => object} [getConnectionState] extra state for system.connected (e.g. active scan)
 */

/**
 * Attaches the real-time endpoint to an existing HTTP server (same port as the API).
 *
 * - Every domain event published on the bus is broadcast to every connected client.
 * - Liveness: each heartbeat the server pings every client (protocol-level) and terminates those
 *   that did not answer the previous ping; it also sends `system.heartbeat`, which browsers can
 *   see, so clients can detect a dead connection on their side.
 * - Browser connections are only accepted from allowed origins (prevents cross-site WebSocket
 *   hijacking). Clients may send only small, validated text messages.
 * - A failing socket is logged and dropped; it never affects other clients or the process.
 *
 * Controllers and services never touch this module: they publish events on the bus.
 *
 * @param {import('node:http').Server} httpServer
 * @param {WebSocketOptions} options
 */
export function attachWebSocketServer(httpServer, options) {
  const { path, heartbeatIntervalMs, allowedOrigins, eventBus, serverVersion } = options;
  const log = logger.child({ component: 'websocket' });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
    clientTracking: false,
    perMessageDeflate: false,
  });
  /** @type {Map<WebSocket, { id: string, ws: WebSocket, isAlive: boolean, invalidMessages: number }>} */
  const clients = new Map();
  let closing = false;

  function isAllowedOrigin(request) {
    const { origin, host } = request.headers;
    // Non-browser clients send no Origin; hijacking attacks need a browser, which always does.
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    return Boolean(host) && (origin === `http://${host}` || origin === `https://${host}`);
  }

  function rejectUpgrade(socket, status, reason) {
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  function onUpgrade(request, socket, head) {
    socket.on('error', (error) => log.debug({ err: error }, 'Socket error during upgrade'));
    let pathname = null;
    try {
      pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    } catch {
      // Malformed request target: treated as an unknown path.
    }
    if (closing) return rejectUpgrade(socket, 503, 'Service Unavailable');
    if (pathname !== path) return rejectUpgrade(socket, 404, 'Not Found');
    if (!isAllowedOrigin(request)) {
      log.warn({ origin: request.headers.origin }, 'Rejected WebSocket from a disallowed origin');
      return rejectUpgrade(socket, 403, 'Forbidden');
    }
    if (clients.size >= MAX_CLIENTS) {
      log.warn({ clients: clients.size }, 'Rejected WebSocket: too many clients');
      return rejectUpgrade(socket, 503, 'Service Unavailable');
    }
    wss.handleUpgrade(request, socket, head, (ws) => onConnection(ws));
  }

  function send(client, payload) {
    const { ws } = client;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      log.warn(
        { connectionId: client.id, bufferedAmount: ws.bufferedAmount },
        'Closing slow client',
      );
      ws.close(CloseCodes.TRY_AGAIN_LATER, 'Client too slow');
      return;
    }
    ws.send(payload, (error) => {
      if (error) log.debug({ connectionId: client.id, err: error }, 'WebSocket send failed');
    });
  }

  function sendEvent(client, type, data) {
    send(client, JSON.stringify(createEvent(type, data)));
  }

  /** Serializes once, sends to everyone. */
  function broadcast(event) {
    if (clients.size === 0) return;
    const payload = JSON.stringify(event);
    for (const client of clients.values()) send(client, payload);
  }

  function onMessage(client, data, isBinary) {
    if (isBinary) {
      client.ws.close(CloseCodes.UNSUPPORTED_DATA, 'Binary messages are not supported');
      return;
    }
    const message = parseClientMessage(data.toString('utf8'));
    if (!message) {
      client.invalidMessages += 1;
      sendEvent(client, EventTypes.SYSTEM_ERROR, {
        code: 'INVALID_MESSAGE',
        message: 'Unsupported message. This socket only accepts {"type":"ping"}.',
      });
      if (client.invalidMessages >= MAX_INVALID_MESSAGES) {
        client.ws.close(CloseCodes.POLICY_VIOLATION, 'Too many invalid messages');
      }
      return;
    }
    if (message.type === ClientMessageTypes.PING) {
      sendEvent(client, EventTypes.SYSTEM_PONG, { id: message.id ?? null });
    }
  }

  function onConnection(ws) {
    const client = { id: randomUUID(), ws, isAlive: true, invalidMessages: 0 };
    clients.set(ws, client);
    log.info({ connectionId: client.id, clients: clients.size }, 'WebSocket client connected');

    ws.on('pong', () => {
      client.isAlive = true;
    });
    ws.on('message', (data, isBinary) => onMessage(client, data, isBinary));
    // Without an error listener a socket error would be an uncaught exception.
    ws.on('error', (error) => {
      log.warn({ connectionId: client.id, err: error }, 'WebSocket client error');
    });
    ws.on('close', (code) => {
      clients.delete(ws);
      log.info(
        { connectionId: client.id, code, clients: clients.size },
        'WebSocket client disconnected',
      );
    });

    let state = {};
    try {
      state = options.getConnectionState?.() ?? {};
    } catch (error) {
      log.error({ err: error }, 'Could not read connection state');
    }
    sendEvent(client, EventTypes.SYSTEM_CONNECTED, {
      connectionId: client.id,
      serverVersion,
      heartbeatIntervalMs,
      ...state,
    });
  }

  function heartbeat() {
    for (const client of clients.values()) {
      if (!client.isAlive) {
        log.info({ connectionId: client.id }, 'Terminating unresponsive WebSocket client');
        client.ws.terminate();
        continue;
      }
      client.isAlive = false;
      try {
        client.ws.ping();
      } catch {
        // The socket is already closing; the close handler removes it.
      }
    }
    broadcast(createEvent(EventTypes.SYSTEM_HEARTBEAT, {}));
  }

  httpServer.on('upgrade', onUpgrade);
  const unsubscribe = eventBus.subscribe(broadcast);
  const heartbeatTimer = setInterval(heartbeat, heartbeatIntervalMs);
  heartbeatTimer.unref();

  return {
    get clientCount() {
      return clients.size;
    },

    /** Stops accepting connections and closes every client with 1001 (going away). */
    async close() {
      if (closing) return;
      closing = true;
      clearInterval(heartbeatTimer);
      unsubscribe();
      for (const client of clients.values()) {
        client.ws.close(CloseCodes.GOING_AWAY, 'Server shutting down');
      }
      const deadline = Date.now() + CLOSE_TIMEOUT_MS;
      while (clients.size > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      for (const client of clients.values()) client.ws.terminate();
      httpServer.off('upgrade', onUpgrade);
      await new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}
