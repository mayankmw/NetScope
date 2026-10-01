import http from 'node:http';
import { EventTypes } from '@netscope/shared/events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createApp } from '../../src/app.js';
import { EventBus } from '../../src/events/eventBus.js';
import { attachWebSocketServer } from '../../src/websocket/wsManager.js';

const HEARTBEAT_MS = 100;
const ALLOWED_ORIGIN = 'http://localhost:5173';

let server;
let realtime;
let bus;
let baseUrl;
const sockets = [];

beforeEach(async () => {
  bus = new EventBus();
  server = http.createServer(createApp());
  realtime = attachWebSocketServer(server, {
    path: '/ws',
    heartbeatIntervalMs: HEARTBEAT_MS,
    allowedOrigins: [ALLOWED_ORIGIN],
    eventBus: bus,
    serverVersion: '0.0.0-test',
    getConnectionState: () => ({ activeDiscovery: null }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `ws://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await realtime.close();
  await new Promise((resolve) => server.close(resolve));
});

/** Opens a client that records every event it receives. */
function connect({ path = '/ws', origin = ALLOWED_ORIGIN, autoPong = true } = {}) {
  const socket = new WebSocket(`${baseUrl}${path}`, { origin, autoPong });
  sockets.push(socket);
  socket.events = [];
  socket.on('message', (data) => socket.events.push(JSON.parse(data.toString())));
  return socket;
}

function waitFor(predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for condition'));
      }
    }, 10);
  });
}

const eventOf = (socket, type) => () => socket.events.find((event) => event.type === type);

function rejectionStatus(socket) {
  return new Promise((resolve) => {
    socket.on('unexpected-response', (_request, response) => resolve(response.statusCode));
    socket.on('error', () => {});
  });
}

function closeCode(socket) {
  return new Promise((resolve) => socket.on('close', (code) => resolve(code)));
}

describe('WebSocket server', () => {
  it('greets each client with system.connected', async () => {
    const socket = connect();

    const hello = await waitFor(eventOf(socket, EventTypes.SYSTEM_CONNECTED));

    expect(hello).toEqual({
      v: 1,
      id: expect.any(String),
      type: 'system.connected',
      timestamp: expect.any(String),
      data: {
        connectionId: expect.any(String),
        serverVersion: '0.0.0-test',
        heartbeatIntervalMs: HEARTBEAT_MS,
        activeDiscovery: null,
      },
    });
    expect(realtime.clientCount).toBe(1);
  });

  it('broadcasts every published event to every client, once', async () => {
    const clients = [connect(), connect(), connect()];
    await Promise.all(clients.map((socket) => waitFor(eventOf(socket, 'system.connected'))));

    const published = bus.publish(EventTypes.DEVICE_OFFLINE, {
      networkId: 'n1',
      device: { id: 'd1' },
    });

    for (const socket of clients) {
      await waitFor(eventOf(socket, EventTypes.DEVICE_OFFLINE));
      expect(socket.events.filter((event) => event.id === published.id)).toEqual([published]);
    }
  });

  it('accepts connections without an Origin header (non-browser clients)', async () => {
    const socket = connect({ origin: undefined });

    await waitFor(eventOf(socket, EventTypes.SYSTEM_CONNECTED));
  });

  it('rejects browsers from other origins with 403', async () => {
    const socket = connect({ origin: 'https://evil.example' });

    expect(await rejectionStatus(socket)).toBe(403);
    expect(realtime.clientCount).toBe(0);
  });

  it('rejects other paths with 404', async () => {
    const socket = connect({ path: '/not-ws' });

    expect(await rejectionStatus(socket)).toBe(404);
  });

  it('answers ping, and rejects anything else with system.error', async () => {
    const socket = connect();
    await waitFor(eventOf(socket, EventTypes.SYSTEM_CONNECTED));

    socket.send(JSON.stringify({ type: 'ping', id: 'abc' }));
    const pong = await waitFor(eventOf(socket, EventTypes.SYSTEM_PONG));
    expect(pong.data).toEqual({ id: 'abc' });

    socket.send(JSON.stringify({ type: 'discover' }));
    const error = await waitFor(eventOf(socket, EventTypes.SYSTEM_ERROR));
    expect(error.data.code).toBe('INVALID_MESSAGE');
  });

  it('disconnects a client that keeps sending invalid messages', async () => {
    const socket = connect();
    await waitFor(eventOf(socket, EventTypes.SYSTEM_CONNECTED));
    const closed = closeCode(socket);

    for (let index = 0; index < 5; index += 1) socket.send('not json');

    expect(await closed).toBe(1008);
  });

  it('closes on binary frames', async () => {
    const socket = connect();
    await waitFor(eventOf(socket, EventTypes.SYSTEM_CONNECTED));
    const closed = closeCode(socket);

    socket.send(Buffer.from([1, 2, 3]));

    expect(await closed).toBe(1003);
  });

  it('sends heartbeats and terminates clients that stop answering pings', async () => {
    const healthy = connect();
    const stale = connect({ autoPong: false });
    const staleClosed = closeCode(stale);

    await waitFor(eventOf(healthy, EventTypes.SYSTEM_HEARTBEAT));
    expect(await staleClosed).toBe(1006); // terminated without a closing handshake
    await waitFor(() => realtime.clientCount === 1);
    expect(healthy.readyState).toBe(WebSocket.OPEN);
  });

  it('closes every client with 1001 on shutdown', async () => {
    const socket = connect();
    await waitFor(eventOf(socket, EventTypes.SYSTEM_CONNECTED));
    const closed = closeCode(socket);

    await realtime.close();

    expect(await closed).toBe(1001);
    expect(realtime.clientCount).toBe(0);
  });
});
