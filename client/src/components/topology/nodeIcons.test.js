import { describe, expect, it } from 'vitest';
import { DEVICE_TYPE_LABELS } from '@/constants/deviceTypes';
import { ICON_TYPES, nodeIcon } from './nodeIcons';

describe('nodeIcon', () => {
  it('has an icon for every device type', () => {
    expect(new Set(ICON_TYPES)).toEqual(new Set(Object.keys(DEVICE_TYPE_LABELS)));
  });

  it('returns an SVG data URI in the requested color, cached', () => {
    const icon = nodeIcon('router', 'rgb(1, 2, 3)');

    expect(icon).toMatch(/^data:image\/svg\+xml;utf8,/);
    expect(decodeURIComponent(icon)).toContain('stroke="rgb(1, 2, 3)"');
    expect(nodeIcon('router', 'rgb(1, 2, 3)')).toBe(icon);
    expect(nodeIcon('no-such-type', 'red')).toBe(nodeIcon('unknown', 'red'));
  });
});
