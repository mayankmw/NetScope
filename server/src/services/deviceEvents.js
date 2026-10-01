import { EventTypes } from '@netscope/shared/events';
import { toDeviceDto } from './dto.js';

/** Device fields whose change is reported as `device.updated` (API name → column). */
const TRACKED_FIELDS = [
  ['ipAddress', 'ip_address'],
  ['hostname', 'hostname'],
  ['vendor', 'vendor'],
  ['deviceType', 'device_type'],
];

/**
 * Turns the persisted result of a discovery into device events. Pure: each fact is derived from
 * the database's before/after values, so every change produces exactly one event.
 *
 * - new MAC on this network                 → device.discovered
 * - was offline, seen again                 → device.online
 * - IP / hostname / vendor / type changed   → device.updated (with `changes` and `previous`)
 * - was online, not seen in the swept range → device.offline
 * - seen again, nothing changed             → no event (discovery.completed carries lastSeenAt)
 *
 * @param {object} input
 * @param {string} input.networkId
 * @param {string | null} input.gatewayMac
 * @param {Array<Record<string, any>>} input.upserted rows from upsertDiscoveredDevice
 * @param {Array<Record<string, any>>} input.wentOffline rows from markUnseenDevicesOffline
 * @returns {Array<{ type: string, data: object }>}
 */
export function deriveDeviceEvents({ networkId, gatewayMac, upserted, wentOffline }) {
  const toDevice = (row) => ({ ...toDeviceDto(row), isGateway: row.mac_address === gatewayMac });
  const events = [];

  for (const row of upserted) {
    const device = toDevice(row);

    if (row.is_new) {
      events.push({ type: EventTypes.DEVICE_DISCOVERED, data: { networkId, device } });
      continue;
    }

    if (row.previous_status === 'offline') {
      events.push({ type: EventTypes.DEVICE_ONLINE, data: { networkId, device } });
    }

    const changed = TRACKED_FIELDS.filter(
      ([, column]) => row[`previous_${column}`] !== row[column],
    );
    if (changed.length > 0) {
      events.push({
        type: EventTypes.DEVICE_UPDATED,
        data: {
          networkId,
          device,
          changes: changed.map(([field]) => field),
          previous: Object.fromEntries(
            changed.map(([field, column]) => [field, row[`previous_${column}`]]),
          ),
        },
      });
    }
  }

  for (const row of wentOffline) {
    events.push({ type: EventTypes.DEVICE_OFFLINE, data: { networkId, device: toDevice(row) } });
  }

  return events;
}
