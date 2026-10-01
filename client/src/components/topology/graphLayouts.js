/**
 * Layouts. Both are computed here as fixed positions (Cytoscape's "preset" layout), not by a
 * physics simulation: O(n), deterministic, and stable, so the same inventory always looks the
 * same and a device going offline moves nothing. The gateway is the root; devices keep the
 * model's order (this computer first, then by category, then by IP), so similar devices sit
 * together.
 */

export const LAYOUTS = Object.freeze([
  { value: 'radial', label: 'Radial' },
  { value: 'tree', label: 'Tree' },
]);

const NODE_SPACING = 84; // px along a ring
const FIRST_RING = 150;
const RING_GAP = 100;

/**
 * Gateway at the centre, devices on concentric rings, each ring as full as its circumference
 * allows.
 * @param {string} rootId
 * @param {string[]} deviceIds in display order
 * @returns {Record<string, { x: number, y: number }>}
 */
export function radialPositions(rootId, deviceIds) {
  const positions = { [rootId]: { x: 0, y: 0 } };
  let index = 0;
  for (let ring = 0; index < deviceIds.length; ring += 1) {
    const remaining = deviceIds.length - index;
    let radius = FIRST_RING + ring * RING_GAP;
    const capacity = Math.max(6, Math.floor((2 * Math.PI * radius) / NODE_SPACING));
    const count = Math.min(capacity, remaining);
    // A lone, part-filled first ring stays compact.
    if (ring === 0 && count < capacity) {
      radius = Math.max(120, (count * NODE_SPACING) / (2 * Math.PI));
    }
    // Offset alternate rings by half a step, so spokes do not line up.
    const offset = ring % 2 === 1 ? Math.PI / count : 0;
    for (let slot = 0; slot < count; slot += 1, index += 1) {
      const angle = -Math.PI / 2 + offset + (2 * Math.PI * slot) / count;
      positions[deviceIds[index]] = {
        x: Math.round(radius * Math.cos(angle)),
        y: Math.round(radius * Math.sin(angle)),
      };
    }
  }
  return positions;
}

const COLUMN_SPACING = 130;
const ROW_SPACING = 105;
const FIRST_ROW = 170;

/**
 * Gateway on top, devices in rows below it (the "Gateway ↓ devices" view), with as many columns
 * as suit the viewport's shape.
 * @param {string} rootId
 * @param {string[]} deviceIds in display order
 * @param {number} aspect viewport width / height
 */
export function treePositions(rootId, deviceIds, aspect = 1.6) {
  const positions = { [rootId]: { x: 0, y: 0 } };
  const count = deviceIds.length;
  if (count === 0) return positions;
  const columns = Math.min(count, Math.max(3, Math.min(14, Math.round(Math.sqrt(count * aspect)))));
  deviceIds.forEach((id, index) => {
    const row = Math.floor(index / columns);
    const inRow = Math.min(columns, count - row * columns);
    const column = index % columns;
    positions[id] = {
      x: Math.round((column - (inRow - 1) / 2) * COLUMN_SPACING),
      y: FIRST_ROW + row * ROW_SPACING,
    };
  });
  return positions;
}

const PADDING = 48;
const MAX_AUTO_ZOOM = 1.25;
// Room around node centres for the node itself and its two-line label below it.
const MARGIN = { x: 80, top: 50, bottom: 80 };

/**
 * The viewport that shows every position: like "fit", but never zoomed in beyond
 * MAX_AUTO_ZOOM, so a small network is not blown up to fill the screen.
 * @param {Record<string, { x: number, y: number }>} positions
 * @param {{ width: number, height: number }} size viewport in pixels
 */
export function viewportFor(positions, { width, height }) {
  const points = Object.values(positions);
  const x1 = Math.min(...points.map((point) => point.x)) - MARGIN.x;
  const x2 = Math.max(...points.map((point) => point.x)) + MARGIN.x;
  const y1 = Math.min(...points.map((point) => point.y)) - MARGIN.top;
  const y2 = Math.max(...points.map((point) => point.y)) + MARGIN.bottom;
  const fitZoom = Math.min(
    (width - 2 * PADDING) / Math.max(1, x2 - x1),
    (height - 2 * PADDING) / Math.max(1, y2 - y1),
  );
  const zoom = Math.max(0.15, Math.min(MAX_AUTO_ZOOM, fitZoom));
  return {
    zoom,
    pan: { x: width / 2 - zoom * ((x1 + x2) / 2), y: height / 2 - zoom * ((y1 + y2) / 2) },
  };
}

/**
 * Runs a layout on the graph and switches edge routing to match (tree edges branch from a
 * trunk). Animated unless the user prefers reduced motion or the graph is large.
 *
 * @param {import('cytoscape').Core} cy
 * @param {'radial' | 'tree'} name
 * @param {{ animate?: boolean }} [options]
 */
export function runLayout(cy, name, { animate = true } = {}) {
  const root = cy.nodes('[?isGateway]').first();
  if (root.empty()) return;
  const deviceIds = cy
    .nodes()
    .not(root)
    .sort((a, b) => a.data('order') - b.data('order'))
    .map((node) => node.id());
  const aspect = cy.width() / Math.max(1, cy.height()) || 1.6;
  const positions =
    name === 'tree'
      ? treePositions(root.id(), deviceIds, aspect)
      : radialPositions(root.id(), deviceIds);

  cy.edges().toggleClass('taxi', name === 'tree');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  cy.layout({
    name: 'preset',
    positions: (node) => positions[node.id()],
    fit: false,
    ...viewportFor(positions, { width: cy.width(), height: cy.height() }),
    animate: animate && !reducedMotion && cy.nodes().length <= 300,
    animationDuration: 350,
    animationEasing: 'ease-out-cubic',
  }).run();
}
