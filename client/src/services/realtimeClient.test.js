import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeClient, resolveSocketUrl } from './realtimeClient';

/** Minimal stand-in for the browser WebSocket, driven by the test. */
class FakeSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.closedWith = null;
    FakeSocket.instances.push(this);
  }

  close(code, reason) {
    this.closedWith = { code, reason };
  }

  // Test controls
  serverOpens() {
    this.onopen?.();
  }

  serverSends(event) {
    this.onmessage?.({ data: typeof event === 'string' ? event : JSON.stringify(event) });
  }

  serverDrops() {
    this.onclose?.({ code: 1006 });
  }
}

const latest = () => FakeSocket.instances.at(-1);
let sequence = 0;
const event = (type, data = {}) => ({
  v: 1,
  id: `event-${(sequence += 1)}`,
  type,
  timestamp: new Date().toISOString(),
  data,
});

function setup() {
  const client = new RealtimeClient({
    url: 'ws://localhost:5173/ws',
    createSocket: (url) => new FakeSocket(url),
    random: () => 1, // no jitter: delays are exactly the backoff ceiling
  });
  const events = [];
  const statuses = [];
  client.onEvent((received) => events.push(received));
  client.onStatus((info) => statuses.push(info));
  return { client, events, statuses };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RealtimeClient', () => {
  it('connects, reports status, and delivers events', () => {
    const { client, events, statuses } = setup();

    client.connect();
    vi.advanceTimersByTime(0); // the socket opens on the next tick
    expect(latest().url).toBe('ws://localhost:5173/ws');
    expect(client.status).toBe('connecting');

    latest().serverOpens();
    const discovered = event('device.discovered', { device: { id: 'd1' } });
    latest().serverSends(discovered);

    expect(statuses.at(-1)).toMatchObject({ status: 'open', isReconnect: false });
    expect(events).toEqual([discovered]);
    client.disconnect();
  });

  it('drops duplicate events, heartbeats, and malformed messages', () => {
    const { client, events } = setup();
    client.connect();
    vi.advanceTimersByTime(0); // the socket opens on the next tick
    latest().serverOpens();

    const offline = event('device.offline');
    latest().serverSends(offline);
    latest().serverSends(offline);
    latest().serverSends(event('system.heartbeat'));
    latest().serverSends('not json');
    latest().serverSends({ type: 'device.updated' }); // no id

    expect(events).toEqual([offline]);
    client.disconnect();
  });

  it('reconnects with exponential backoff, capped at 30 s', () => {
    const { client, statuses } = setup();
    client.connect();
    vi.advanceTimersByTime(0); // the socket opens on the next tick
    latest().serverOpens();

    const delays = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      latest().serverDrops();
      const { nextRetryAt } = statuses.at(-1);
      delays.push(nextRetryAt - Date.now());
      vi.advanceTimersByTime(nextRetryAt - Date.now());
    }

    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(FakeSocket.instances).toHaveLength(8);
    client.disconnect();
  });

  it('marks a successful reconnection and resets the backoff', () => {
    const { client, statuses } = setup();
    client.connect();
    vi.advanceTimersByTime(0); // the socket opens on the next tick
    latest().serverOpens();
    latest().serverDrops();
    vi.advanceTimersByTime(1000);
    latest().serverOpens();

    expect(statuses.at(-1)).toMatchObject({ status: 'open', isReconnect: true, attempt: 0 });

    latest().serverDrops();
    expect(statuses.at(-1).nextRetryAt - Date.now()).toBe(1000);
    client.disconnect();
  });

  it('treats a silent connection as dead after two missed heartbeats', () => {
    const { client, statuses } = setup();
    client.connect();
    vi.advanceTimersByTime(0); // the socket opens on the next tick
    latest().serverOpens();
    latest().serverSends(event('system.connected', { heartbeatIntervalMs: 5000 }));
    const silent = latest();

    vi.advanceTimersByTime(5000 * 2 + 10_000 - 1);
    expect(silent.closedWith).toBeNull();

    vi.advanceTimersByTime(1);
    expect(silent.closedWith).toEqual({ code: 4000, reason: 'Heartbeat timeout' });
    expect(statuses.at(-1).status).toBe('reconnecting');
    client.disconnect();
  });

  it('heartbeats keep the connection alive', () => {
    const { client } = setup();
    client.connect();
    vi.advanceTimersByTime(0); // the socket opens on the next tick
    latest().serverOpens();
    latest().serverSends(event('system.connected', { heartbeatIntervalMs: 5000 }));
    const socket = latest();

    for (let tick = 0; tick < 10; tick += 1) {
      vi.advanceTimersByTime(5000);
      socket.serverSends(event('system.heartbeat'));
    }

    expect(socket.closedWith).toBeNull();
    client.disconnect();
  });

  it('creates no socket when unmounted in the same tick (React StrictMode)', () => {
    const { client } = setup();

    client.connect();
    client.disconnect();
    client.connect();
    vi.advanceTimersByTime(0);

    expect(FakeSocket.instances).toHaveLength(1);
    client.disconnect();
  });

  it('lets a socket that is still connecting finish its handshake before closing it', () => {
    const { client } = setup();
    client.connect();
    vi.advanceTimersByTime(0);
    const socket = latest();
    socket.readyState = 0; // CONNECTING

    client.disconnect();
    expect(socket.closedWith).toBeNull();

    socket.serverOpens();
    expect(socket.closedWith).toEqual({ code: 1000, reason: 'Client closed' });
    expect(client.status).toBe('idle');
  });

  it('stops reconnecting after disconnect', () => {
    const { client } = setup();
    client.connect();
    vi.advanceTimersByTime(0); // the socket opens on the next tick
    latest().serverOpens();
    const socket = latest();

    client.disconnect();
    socket.serverDrops();
    vi.advanceTimersByTime(60_000);

    expect(socket.closedWith).toEqual({ code: 1000, reason: 'Client closed' });
    expect(FakeSocket.instances).toHaveLength(1);
    expect(client.status).toBe('idle');
  });

  it('reconnects immediately when the browser comes back online', () => {
    const { client } = setup();
    client.connect();
    vi.advanceTimersByTime(0); // the socket opens on the next tick
    latest().serverOpens();
    latest().serverDrops();

    window.dispatchEvent(new Event('online'));

    expect(FakeSocket.instances).toHaveLength(2);
    client.disconnect();
  });

  it('keeps delivering when one listener throws', () => {
    const { client, events } = setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    client.onEvent(() => {
      throw new Error('listener bug');
    });
    client.connect();
    vi.advanceTimersByTime(0); // the socket opens on the next tick
    latest().serverOpens();

    latest().serverSends(event('device.online'));
    latest().serverSends(event('device.offline'));

    expect(events.map((received) => received.type)).toEqual(['device.online', 'device.offline']);
    consoleError.mockRestore();
    client.disconnect();
  });
});

describe('resolveSocketUrl', () => {
  it('uses the page origin, upgrading to wss on https', () => {
    expect(resolveSocketUrl('/ws', { protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/ws',
    );
    expect(resolveSocketUrl('/ws', { protocol: 'https:', host: 'netscope.lan' })).toBe(
      'wss://netscope.lan/ws',
    );
    expect(resolveSocketUrl('ws://10.0.0.5:4000/ws')).toBe('ws://10.0.0.5:4000/ws');
  });
});
