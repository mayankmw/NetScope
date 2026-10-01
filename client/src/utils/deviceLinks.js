/** Path of a device's details page. */
export function deviceDetailsPath(deviceId) {
  return `/devices/${encodeURIComponent(deviceId)}`;
}

/** Router state that lets the details page link back to `location`, filters included. */
export function backState(location) {
  return { from: `${location.pathname}${location.search}` };
}

const BACK_LABELS = [
  ['/topology', 'Topology'],
  ['/devices', 'Devices'],
];

/**
 * Where the details page's "Back" link goes: the in-app page the user came from, else the
 * device list. Only same-app paths are accepted.
 * @param {unknown} from `location.state.from`
 */
export function backLink(from) {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) {
    return { to: '/devices', label: 'Devices' };
  }
  const path = from.split(/[?#]/)[0];
  const label =
    path === '/'
      ? 'Overview'
      : (BACK_LABELS.find(([prefix]) => path.startsWith(prefix))?.[1] ?? 'Back');
  return { to: from, label };
}
