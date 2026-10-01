/**
 * Which alerts a discovery raises. Pure: everything is derived from the persisted before/after
 * values of each device (rows from devicesRepository.upsertDiscoveredDevice), so the same facts
 * as the device timeline and the device.* events.
 *
 * Every device a discovery sees is one of:
 *
 *   new         a MAC never seen on this network          → new_device alert (warning)
 *   returned    offline before this scan, seen again      → device_returned alert (info), only
 *                                                           after a long absence
 *   ip_changed  seen before, now at a different address   → ip_changed alert (info)
 *   known       seen before, nothing changed              → no alert
 *
 * Deduplication and cooldown happen when the alerts are recorded (alertsRepository.recordAlert):
 * each alert carries a `dedupKey` naming "the same alert" for that device.
 */

export const AlertTypes = Object.freeze({
  NEW_DEVICE: 'new_device',
  DEVICE_RETURNED: 'device_returned',
  IP_CHANGED: 'ip_changed',
});

export const DeviceClassifications = Object.freeze({
  NEW: 'new',
  RETURNED: 'returned',
  IP_CHANGED: 'ip_changed',
  KNOWN: 'known',
});

/**
 * How a discovery saw a device, compared with what was known before it. A device that came back
 * at a new address is `returned` (its new address is reported with it).
 * @param {Record<string, any>} row an upserted device row with its previous_* values
 */
export function classifyDevice(row) {
  if (row.is_new) return DeviceClassifications.NEW;
  if (row.previous_status === 'offline') return DeviceClassifications.RETURNED;
  if (row.previous_ip_address !== row.ip_address) return DeviceClassifications.IP_CHANGED;
  return DeviceClassifications.KNOWN;
}

/** A device's name for a message: its name, else what it is. */
function describe(row, { isGateway }) {
  const name = row.display_name || row.hostname;
  if (name) return name;
  if (isGateway) return row.vendor ? `${row.vendor} gateway` : 'The gateway';
  return row.vendor ? `${row.vendor} device` : 'Unknown device';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3 days", "5 hours", "40 minutes". */
export function formatAbsence(ms) {
  const [unit, size] =
    ms >= 2 * DAY ? ['day', DAY] : ms >= 2 * HOUR ? ['hour', HOUR] : ['minute', MINUTE];
  const count = Math.max(1, Math.floor(ms / size));
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** What the alert records about the device, as it was when the alert occurred. */
function snapshot(row, extra = {}) {
  return {
    ipAddress: row.ip_address,
    macAddress: row.mac_address,
    macIsRandom: row.mac_is_random,
    hostname: row.hostname,
    vendor: row.vendor,
    deviceType: row.device_type,
    ...extra,
  };
}

/**
 * @typedef {object} AlertCandidate
 * @property {string} networkId
 * @property {string} deviceId
 * @property {string} scanId
 * @property {'new_device' | 'device_returned' | 'ip_changed'} type
 * @property {'info' | 'warning'} severity
 * @property {string} dedupKey
 * @property {string} message
 * @property {Record<string, unknown>} context
 */

/**
 * @param {object} input
 * @param {string} input.networkId
 * @param {string} input.scanId
 * @param {Array<Record<string, any>>} input.upserted rows from upsertDiscoveredDevice
 * @param {string | null} input.gatewayMac
 * @param {string | null} [input.selfMac] this machine's MAC: never alerted about
 * @param {boolean} input.isBaseline the network knew no device before this scan: everything it
 *   finds is the starting inventory, not a newcomer
 * @param {number} input.returnAfterMs minimum absence for a "back online" alert
 * @param {Date} [input.now]
 * @returns {AlertCandidate[]}
 */
export function deriveAlerts({
  networkId,
  scanId,
  upserted,
  gatewayMac,
  selfMac = null,
  isBaseline,
  returnAfterMs,
  now = new Date(),
}) {
  const alerts = [];

  for (const row of upserted) {
    if (row.mac_address === selfMac) continue;
    const name = describe(row, { isGateway: row.mac_address === gatewayMac });
    const base = { networkId, deviceId: row.id, scanId };
    const classification = classifyDevice(row);
    const movedFrom =
      !row.is_new && row.previous_ip_address !== row.ip_address ? row.previous_ip_address : null;

    if (classification === DeviceClassifications.NEW) {
      if (isBaseline) continue;
      alerts.push({
        ...base,
        type: AlertTypes.NEW_DEVICE,
        severity: 'warning',
        dedupKey: `${AlertTypes.NEW_DEVICE}:${row.id}`,
        message: `New device on the network: ${name} at ${row.ip_address} (MAC ${row.mac_address}).`,
        context: snapshot(row),
      });
      continue;
    }

    if (classification === DeviceClassifications.RETURNED) {
      const absentMs = now - new Date(row.previous_last_seen_at);
      if (absentMs >= returnAfterMs) {
        alerts.push({
          ...base,
          type: AlertTypes.DEVICE_RETURNED,
          severity: 'info',
          dedupKey: `${AlertTypes.DEVICE_RETURNED}:${row.id}`,
          message:
            `${name} is back online at ${row.ip_address} after ${formatAbsence(absentMs)} away` +
            (movedFrom ? ` (it was at ${movedFrom}).` : '.'),
          context: snapshot(row, {
            previousIpAddress: movedFrom,
            lastSeenAt: new Date(row.previous_last_seen_at).toISOString(),
            absentMs,
          }),
        });
        continue;
      }
      // A short absence is not an alert, but a new address still is (below).
    }

    if (movedFrom) {
      alerts.push({
        ...base,
        type: AlertTypes.IP_CHANGED,
        severity: 'info',
        dedupKey: `${AlertTypes.IP_CHANGED}:${row.id}`,
        message: `${name} moved from ${movedFrom} to ${row.ip_address}.`,
        context: snapshot(row, { previousIpAddress: movedFrom }),
      });
    }
  }

  return alerts;
}
