import { deviceTypeLabel } from '@/constants/deviceTypes';

/**
 * Pure text for a device's timeline entries (GET /api/devices/:id/events), so wording is
 * consistent and testable apart from the UI.
 */

const FIELD_LABELS = {
  ipAddress: 'IP address',
  hostname: 'Hostname',
  vendor: 'Vendor',
  deviceType: 'Device type',
};

const FIELD_VALUE = {
  deviceType: (value) => deviceTypeLabel(value),
};

/** Title for a single changed field: "found" when it was unknown before, "changed" otherwise. */
function changeTitle(field, from) {
  const label = FIELD_LABELS[field] ?? field;
  const wasUnknown = from === null || (field === 'deviceType' && from === 'unknown');
  if (field === 'ipAddress') return 'IP address changed';
  return wasUnknown ? `${label} identified` : `${label} changed`;
}

/**
 * @param {import('@/types/api').DeviceEvent} event
 * @returns {{ title: string, changes: Array<{ field: string, label: string, from: string | null, to: string | null }> }}
 */
export function describeDeviceEvent(event) {
  switch (event.type) {
    case 'discovered':
      return { title: 'First discovered', changes: [] };
    case 'online':
      return { title: 'Came online', changes: [] };
    case 'offline':
      return { title: 'Went offline', changes: [] };
    case 'updated': {
      const changes = Object.entries(event.changes ?? {}).map(([field, { from, to }]) => {
        const format = FIELD_VALUE[field] ?? ((value) => value);
        return {
          field,
          label: FIELD_LABELS[field] ?? field,
          from: from === null || from === undefined ? null : String(format(from)),
          to: to === null || to === undefined ? null : String(format(to)),
        };
      });
      const title =
        changes.length === 1
          ? changeTitle(changes[0].field, event.changes[changes[0].field].from)
          : `${changes.length} details changed`;
      return { title, changes };
    }
    default:
      return { title: 'Activity', changes: [] };
  }
}
