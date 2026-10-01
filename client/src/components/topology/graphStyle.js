/**
 * The Cytoscape stylesheet. Styles are data-driven (selectors on node data and classes), so a
 * device changing state restyles only that node: nothing is computed per node in JavaScript.
 *
 * Node data used: category, status, isGateway, isSelf, isNew, synthetic.
 * Classes used:   hover, match, faded, changed (nodes); active, taxi, faded (edges).
 */

/** Node shape per category; the legend draws the same shapes. */
export const CATEGORY_SHAPES = Object.freeze({
  gateway: 'round-diamond',
  computer: 'round-rectangle',
  mobile: 'ellipse',
  iot: 'round-hexagon',
  network: 'round-octagon',
  other: 'round-pentagon',
});

/** @param {ReturnType<typeof import('./graphTheme.js').resolveGraphTheme>} theme */
export function buildStylesheet(theme) {
  return [
    {
      selector: 'node',
      style: {
        width: 40,
        height: 40,
        shape: 'ellipse',
        'background-color': theme.background,
        'background-image': 'data(icon)',
        'background-width': '50%',
        'background-height': '50%',
        'border-width': 1.5,
        'border-color': theme.primary,
        label: 'data(label)',
        color: theme.foreground,
        'font-family': theme.fontFamily,
        'font-size': 10,
        'line-height': 1.3,
        'text-wrap': 'wrap',
        'text-max-width': 140,
        'text-valign': 'bottom',
        'text-margin-y': 6,
        'text-background-color': theme.background,
        'text-background-opacity': 0.8,
        'text-background-padding': 2,
        'text-background-shape': 'round-rectangle',
        // Below this on-screen size labels are not drawn: unreadable, and costly on big graphs.
        'min-zoomed-font-size': 7,
        'overlay-opacity': 0,
        // Glows (selection, search match, live change) are round whatever the node's shape.
        'underlay-shape': 'ellipse',
        'transition-property': 'border-color, border-width, opacity, underlay-opacity',
        'transition-duration': 0.2,
      },
    },
    ...Object.entries(CATEGORY_SHAPES).map(([category, shape]) => ({
      selector: `node[category = "${category}"]`,
      style: { shape },
    })),
    {
      selector: 'node[?isGateway]',
      style: {
        width: 58,
        height: 58,
        'border-width': 2.5,
        'font-size': 11,
        'font-weight': 600,
        'underlay-color': theme.primary,
        'underlay-opacity': 0.14,
        'underlay-padding': 10,
        'z-index': 10,
      },
    },
    { selector: 'node[?isSelf]', style: { 'border-color': theme.success, 'border-width': 2.5 } },
    {
      selector: 'node[?isNew]',
      style: {
        'outline-color': theme.magenta,
        'outline-width': 1.5,
        'outline-offset': 3,
        'outline-opacity': 0.9,
      },
    },
    {
      selector: 'node[status = "offline"]',
      style: { 'border-color': theme.muted, 'border-style': 'dashed', opacity: 0.55 },
    },
    {
      selector: 'node[?synthetic]',
      style: { 'border-style': 'dotted', 'border-color': theme.muted },
    },

    {
      selector: 'edge',
      style: {
        width: 1.25,
        'line-color': theme.border,
        // Dashed everywhere: these are logical relationships, not physical links.
        'line-style': 'dashed',
        'line-dash-pattern': [5, 4],
        'curve-style': 'straight',
        'target-arrow-shape': 'none',
        opacity: 0.9,
        'overlay-opacity': 0,
        'transition-property': 'line-color, opacity, width',
        'transition-duration': 0.2,
      },
    },
    { selector: 'edge[targetStatus = "offline"]', style: { opacity: 0.4 } },
    {
      selector: 'edge.taxi',
      style: { 'curve-style': 'taxi', 'taxi-direction': 'downward', 'taxi-turn': 60 },
    },

    // Interaction states come last so they win over the base styles above.
    { selector: 'node.hover', style: { 'border-width': 3, 'z-index': 20 } },
    {
      selector: 'node.changed',
      style: { 'underlay-color': theme.primary, 'underlay-opacity': 0.4, 'underlay-padding': 9 },
    },
    {
      selector: 'node.match',
      style: {
        'underlay-color': theme.warning,
        'underlay-opacity': 0.3,
        'underlay-padding': 8,
        opacity: 1,
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-color': theme.primary,
        'border-width': 3.5,
        'border-style': 'solid',
        'underlay-color': theme.primary,
        'underlay-opacity': 0.3,
        'underlay-padding': 9,
        opacity: 1,
        'z-index': 30,
      },
    },
    { selector: 'edge.active', style: { 'line-color': theme.primary, width: 2, opacity: 1 } },
    { selector: '.faded', style: { opacity: 0.15, 'text-opacity': 0.4 } },
  ];
}

/**
 * Icon color for a node: muted when offline or unknown, success for this computer, primary
 * otherwise.
 * @param {{ status: string, isSelf: boolean }} node
 */
export function iconColor(node, theme) {
  if (node.status !== 'online') return theme.muted;
  if (node.isSelf) return theme.success;
  return theme.primary;
}
