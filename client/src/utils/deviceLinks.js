/** Path of a device's details page. */
export function deviceDetailsPath(deviceId) {
  return `/devices/${encodeURIComponent(deviceId)}`;
}

/** Router state that lets the details page link back to `location`, filters included. */
export function backState(location) {
  return { from: `${location.pathname}${location.search}` };
}

/** Where a back link leads, by the path it returns to. */
const BACK_LABELS = [
  [/^\/$/, 'Overview'],
  [/^\/devices$/, 'Devices'],
  [/^\/devices\/[^/]+$/, 'Device'],
  [/^\/scans$/, 'Scans'],
  [/^\/scans\/[^/]+$/, 'Scan'],
  [/^\/topology$/, 'Topology'],
];

const DEVICE_LIST = { to: '/devices', label: 'Devices' };

/**
 * Where a details page's "Back" link goes: the in-app page the user came from, else `fallback`
 * (the device list unless given). Only same-app paths are accepted.
 * @param {unknown} from `location.state.from`
 * @param {{ to: string, label: string }} [fallback]
 */
export function backLink(from, fallback = DEVICE_LIST) {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) {
    return fallback;
  }
  const path = from.split(/[?#]/)[0];
  const label = BACK_LABELS.find(([pattern]) => pattern.test(path))?.[1] ?? 'Back';
  return { to: from, label };
}
