import { ClientMessageTypes } from '@netscope/shared/events';
import { z } from 'zod';

/**
 * The only messages a client may send. The WebSocket is a push channel: state changes go through
 * the validated REST API, never through the socket.
 */
const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal(ClientMessageTypes.PING),
    id: z.string().max(64).optional(),
  }),
]);

/**
 * Parses and validates one text frame. Returns null for anything that is not valid JSON or not
 * a supported message.
 * @param {string} text
 */
export function parseClientMessage(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const result = clientMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}
