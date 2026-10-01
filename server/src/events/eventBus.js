import { randomUUID } from 'node:crypto';
import { EVENT_VERSION } from '@netscope/shared/events';
import { logger } from '../utils/logger.js';

/**
 * Builds an event in the shared envelope. The unique `id` lets clients drop duplicates.
 * @param {string} type one of EventTypes
 * @param {object} [data]
 */
export function createEvent(type, data = {}) {
  return {
    v: EVENT_VERSION,
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    data,
  };
}

/**
 * In-process publish/subscribe for domain events.
 *
 * Services publish facts ("device went offline") without knowing who listens; the WebSocket
 * layer is one subscriber. A subscriber that throws (or rejects) is logged and isolated: it can
 * never break the publisher or the other subscribers.
 */
export class EventBus {
  #listeners = new Set();

  /**
   * @param {string} type
   * @param {object} data
   * @returns {object} the published event
   */
  publish(type, data) {
    const event = createEvent(type, data);
    for (const listener of this.#listeners) {
      try {
        const result = listener(event);
        if (typeof result?.then === 'function') {
          result.catch((error) => this.#reportListenerError(error, event));
        }
      } catch (error) {
        this.#reportListenerError(error, event);
      }
    }
    return event;
  }

  /**
   * @param {(event: object) => void | Promise<void>} listener
   * @returns {() => void} unsubscribe
   */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  get listenerCount() {
    return this.#listeners.size;
  }

  #reportListenerError(error, event) {
    logger.error({ err: error, eventType: event.type, eventId: event.id }, 'Event listener failed');
  }
}

/** The application's event bus. */
export const eventBus = new EventBus();
