/**
 * Colors and fonts for the graph. Cytoscape draws on a canvas and parses colors itself: it does
 * not understand CSS variables or oklch(), which the theme uses. So the theme tokens are read
 * from the page and converted to rgb() once, by painting a pixel and reading it back.
 */

const TOKENS = {
  background: '--background',
  foreground: '--foreground',
  muted: '--muted-foreground',
  border: '--border',
  primary: '--primary',
  success: '--success',
  warning: '--warning',
  magenta: '--neon-magenta',
};

/** The dark theme's colors, for environments without a canvas (tests, very old browsers). */
const FALLBACK = Object.freeze({
  background: 'rgb(13, 17, 28)',
  foreground: 'rgb(235, 239, 245)',
  muted: 'rgb(155, 165, 181)',
  border: 'rgb(53, 61, 79)',
  primary: 'rgb(84, 215, 236)',
  success: 'rgb(74, 222, 128)',
  warning: 'rgb(250, 196, 82)',
  magenta: 'rgb(244, 98, 196)',
  fontFamily: 'sans-serif',
});

/** Any CSS color → "rgb(r, g, b)" via a 1×1 canvas, or null when that is not possible. */
function toRgb(context, color) {
  if (!context || !color) return null;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = '#000';
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

function canvasContext() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    return null;
  }
}

/**
 * @returns {typeof FALLBACK}
 */
export function resolveGraphTheme() {
  if (typeof document === 'undefined') return FALLBACK;
  const styles = getComputedStyle(document.documentElement);
  const context = canvasContext();
  const theme = { ...FALLBACK };
  for (const [name, variable] of Object.entries(TOKENS)) {
    theme[name] = toRgb(context, styles.getPropertyValue(variable).trim()) ?? FALLBACK[name];
  }
  theme.fontFamily = getComputedStyle(document.body).fontFamily || FALLBACK.fontFamily;
  return theme;
}

export { FALLBACK as FALLBACK_GRAPH_THEME };
