import {
  Box,
  Cctv,
  CircleHelp,
  Gamepad2,
  HardDrive,
  Laptop,
  Lightbulb,
  Network,
  Printer,
  Router,
  Server,
  Smartphone,
  Speaker,
  Tablet,
  Tv,
  Wifi,
} from 'lucide';

/**
 * Device type icons for graph nodes. The same lucide icons as the rest of the UI
 * (devices/deviceTypeIcons.js), taken from the framework-free `lucide` package as SVG data,
 * because Cytoscape draws images, not React components.
 */
const ICONS = {
  unknown: CircleHelp,
  router: Router,
  access_point: Wifi,
  switch: Network,
  computer: Laptop,
  phone: Smartphone,
  tablet: Tablet,
  tv: Tv,
  speaker: Speaker,
  printer: Printer,
  camera: Cctv,
  iot: Lightbulb,
  game_console: Gamepad2,
  nas: HardDrive,
  server: Server,
  other: Box,
};

export const ICON_TYPES = Object.freeze(Object.keys(ICONS));

const escapeAttribute = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

function toSvg(iconNode, color) {
  const children = iconNode
    .map(
      ([tag, attributes]) =>
        `<${tag} ${Object.entries(attributes)
          .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
          .join(' ')}/>`,
    )
    .join('');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
    `fill="none" stroke="${escapeAttribute(color)}" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round">${children}</svg>`
  );
}

const cache = new Map();

/**
 * Data URI of a device type's icon in a color. Cached: a graph uses a handful of combinations.
 * @param {string} deviceType
 * @param {string} color any color Cytoscape and SVG understand (rgb())
 */
export function nodeIcon(deviceType, color) {
  const key = `${deviceType}|${color}`;
  if (!cache.has(key)) {
    const svg = toSvg(ICONS[deviceType] ?? ICONS.unknown, color);
    cache.set(key, `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
  }
  return cache.get(key);
}
