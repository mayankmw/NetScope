import { EventTypes } from '@netscope/shared/events';
import { env } from '@/config/env';

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const DEFAULT_HEARTBEAT_MS = 30_000;
// No traffic for two heartbeats plus this margin means the connection is dead.
const WATCHDOG_GRACE_MS = 10_000;
const DEDUPE_WINDOW = 500;
const NORMAL_CLOSURE = 1000;
const CONNECTING = 0; // WebSocket.CONNECTING

/**
 * @typedef {'idle' | 'connecting' | 'open' | 'reconnecting'} ConnectionStatus
 * @typedef {{ status: ConnectionStatus, attempt: number, nextRetryAt: number | null, isReconnect: boolean }} StatusInfo
 */

/**
 * Browser side of the real-time channel: one socket, automatic reconnection, and liveness.
 *
 * - Reconnects with exponential backoff and jitter (1 s → 30 s), immediately when the browser
 *   comes back online or the tab becomes visible.
 * - A watchdog closes the socket if no message (heartbeats included) arrives in time: browsers
 *   may not notice a silently dropped connection (sleep, Wi-Fi change) for minutes.
 * - Drops events it has already delivered (by `id`) and malformed messages.
 * - Listener errors are contained: one failing listener never breaks the connection.
 *
 * It knows nothing about stores or React; useRealtime() connects it to the app.
 */
export class RealtimeClient {
  #url;
  #createSocket;
  #random;
  #socket = null;
  #wanted = false;
  #hasConnected = false;
  #attempt = 0;
  #retryTimer = null;
  #watchdogTimer = null;
  #heartbeatMs = DEFAULT_HEARTBEAT_MS;
  #seen = new Set();
  #seenOrder = [];
  #eventListeners = new Set();
  #statusListeners = new Set();
  /** @type {StatusInfo} */
  #info = { status: 'idle', attempt: 0, nextRetryAt: null, isReconnect: false };

  /**
   * @param {{ url: string, createSocket?: (url: string) => WebSocket, random?: () => number }} options
   */
  constructor({ url, createSocket = (target) => new WebSocket(target), random = Math.random }) {
    this.#url = url;
    this.#createSocket = createSocket;
    this.#random = random;
  }

  get status() {
    return this.#info.status;
  }

  /** Starts connecting (idempotent). */
  connect() {
    if (this.#wanted) return;
    this.#wanted = true;
    window.addEventListener('online', this.#reconnectNow);
    document.addEventListener('visibilitychange', this.#onVisibilityChange);
    this.#setStatus({ status: 'connecting', attempt: 0, nextRetryAt: null, isReconnect: false });
    // Open on the next tick. In development, React StrictMode mounts, unmounts, and remounts
    // components immediately; a disconnect() in between cancels this timer, so no socket is
    // created only to be closed mid-handshake.
    this.#retryTimer = setTimeout(() => this.#open(), 0);
  }

  /** Closes the connection and stops reconnecting. */
  disconnect() {
    this.#wanted = false;
    window.removeEventListener('online', this.#reconnectNow);
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
    clearTimeout(this.#retryTimer);
    clearTimeout(this.#watchdogTimer);
    this.#discardSocket(NORMAL_CLOSURE, 'Client closed');
    this.#attempt = 0;
    this.#hasConnected = false;
    this.#setStatus({ status: 'idle', attempt: 0, nextRetryAt: null, isReconnect: false });
  }

  /** @param {(event: object) => void} listener @returns {() => void} unsubscribe */
  onEvent(listener) {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  /** Called immediately with the current status. @param {(info: StatusInfo) => void} listener */
  onStatus(listener) {
    this.#statusListeners.add(listener);
    listener(this.#info);
    return () => this.#statusListeners.delete(listener);
  }

  #open() {
    clearTimeout(this.#retryTimer);
    this.#setStatus({
      status: this.#hasConnected ? 'reconnecting' : 'connecting',
      attempt: this.#attempt,
      nextRetryAt: null,
      isReconnect: this.#hasConnected,
    });

    let socket;
    try {
      socket = this.#createSocket(this.#url);
    } catch {
      this.#scheduleReconnect();
      return;
    }
    this.#socket = socket;

    // Handlers ignore events from a socket that has been replaced or discarded.
    socket.onopen = () => {
      if (socket !== this.#socket) return;
      const isReconnect = this.#hasConnected;
      this.#hasConnected = true;
      this.#attempt = 0;
      this.#setStatus({ status: 'open', attempt: 0, nextRetryAt: null, isReconnect });
      this.#armWatchdog();
    };
    socket.onmessage = (message) => {
      if (socket !== this.#socket) return;
      this.#armWatchdog();
      this.#handleMessage(message.data);
    };
    socket.onclose = () => {
      if (socket !== this.#socket) return;
      this.#socket = null;
      clearTimeout(this.#watchdogTimer);
      if (this.#wanted) this.#scheduleReconnect();
    };
    // An error is always followed by close, which handles reconnection.
    socket.onerror = () => {};
  }

  #scheduleReconnect() {
    this.#attempt += 1;
    const ceiling = Math.min(MAX_RETRY_MS, INITIAL_RETRY_MS * 2 ** (this.#attempt - 1));
    // "Equal jitter": half fixed, half random, so many tabs do not reconnect in lockstep.
    const delay = Math.round(ceiling / 2 + (this.#random() * ceiling) / 2);
    this.#setStatus({
      status: 'reconnecting',
      attempt: this.#attempt,
      nextRetryAt: Date.now() + delay,
      isReconnect: this.#hasConnected,
    });
    this.#retryTimer = setTimeout(() => this.#open(), delay);
  }

  #armWatchdog() {
    clearTimeout(this.#watchdogTimer);
    this.#watchdogTimer = setTimeout(
      () => {
        this.#discardSocket(4000, 'Heartbeat timeout');
        if (this.#wanted) this.#scheduleReconnect();
      },
      this.#heartbeatMs * 2 + WATCHDOG_GRACE_MS,
    );
  }

  #discardSocket(code, reason) {
    const socket = this.#socket;
    this.#socket = null;
    if (!socket) return;
    if (socket.readyState === CONNECTING) {
      // Closing mid-handshake makes the browser log an error; finish the handshake, then close.
      socket.onmessage = null;
      socket.onclose = null;
      socket.onopen = () => socket.close(code, reason);
      return;
    }
    try {
      socket.close(code, reason);
    } catch {
      // Already closed.
    }
  }

  #handleMessage(raw) {
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof event?.type !== 'string' || typeof event.id !== 'string') return;

    if (event.type === EventTypes.SYSTEM_CONNECTED) {
      const interval = Number(event.data?.heartbeatIntervalMs);
      if (Number.isFinite(interval) && interval > 0) {
        this.#heartbeatMs = interval;
        this.#armWatchdog();
      }
    }
    // Heartbeats only keep the watchdog quiet (re-armed above); listeners never see them.
    if (event.type === EventTypes.SYSTEM_HEARTBEAT) return;
    if (this.#isDuplicate(event.id)) return;

    for (const listener of this.#eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Real-time event listener failed', error);
      }
    }
  }

  #isDuplicate(id) {
    if (this.#seen.has(id)) return true;
    this.#seen.add(id);
    this.#seenOrder.push(id);
    if (this.#seenOrder.length > DEDUPE_WINDOW) this.#seen.delete(this.#seenOrder.shift());
    return false;
  }

  #setStatus(info) {
    this.#info = info;
    for (const listener of this.#statusListeners) {
      try {
        listener(info);
      } catch (error) {
        console.error('Real-time status listener failed', error);
      }
    }
  }

  #reconnectNow = () => {
    if (!this.#wanted || this.#socket) return;
    this.#attempt = 0;
    this.#open();
  };

  #onVisibilityChange = () => {
    if (document.visibilityState === 'visible') this.#reconnectNow();
  };
}

/** ws:// or wss:// URL for the API's WebSocket path on the page's own origin. */
export function resolveSocketUrl(path = env.wsPath, location = window.location) {
  if (/^wss?:\/\//.test(path)) return path;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}${path}`;
}

/** The app's real-time connection. */
export const realtimeClient = new RealtimeClient({ url: resolveSocketUrl() });
