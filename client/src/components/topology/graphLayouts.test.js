import { describe, expect, it } from 'vitest';
import { radialPositions, treePositions, viewportFor } from './graphLayouts';

const ids = (count) => Array.from({ length: count }, (_, index) => `d${index}`);
const distance = ({ x, y }) => Math.hypot(x, y);

describe('radialPositions', () => {
  it('puts the gateway at the centre and every device around it, without overlaps', () => {
    const positions = radialPositions('gw', ids(40));

    expect(positions.gw).toEqual({ x: 0, y: 0 });
    expect(Object.keys(positions)).toHaveLength(41);
    const keys = new Set(Object.values(positions).map(({ x, y }) => `${x},${y}`));
    expect(keys.size).toBe(41);
    expect(Math.min(...ids(40).map((id) => distance(positions[id])))).toBeGreaterThanOrEqual(100);
  });

  it('fills rings outwards in order', () => {
    const positions = radialPositions('gw', ids(40));

    expect(distance(positions.d0)).toBeLessThan(distance(positions.d39));
  });

  it('is deterministic', () => {
    expect(radialPositions('gw', ids(12))).toEqual(radialPositions('gw', ids(12)));
  });
});

describe('treePositions', () => {
  it('puts the gateway on top and devices in rows below it', () => {
    const positions = treePositions('gw', ids(10), 1);

    expect(positions.gw).toEqual({ x: 0, y: 0 });
    for (const id of ids(10)) expect(positions[id].y).toBeGreaterThan(100);
    const rows = new Set(ids(10).map((id) => positions[id].y));
    expect(rows.size).toBeGreaterThan(1);
  });

  it('uses more columns on wide viewports', () => {
    const rowsOf = (aspect) =>
      new Set(Object.values(treePositions('gw', ids(30), aspect)).map(({ y }) => y)).size;

    expect(rowsOf(3)).toBeLessThan(rowsOf(0.5));
  });
});

describe('viewportFor', () => {
  it('fits large graphs, but never zooms a small one in beyond 1.25', () => {
    const small = viewportFor(
      { a: { x: 0, y: 0 }, b: { x: 0, y: 150 } },
      { width: 800, height: 600 },
    );
    expect(small.zoom).toBe(1.25);

    const large = viewportFor(radialPositions('gw', ids(200)), { width: 800, height: 600 });
    expect(large.zoom).toBeLessThan(1);
  });

  it('centres the graph', () => {
    const { zoom, pan } = viewportFor(
      { a: { x: -100, y: 0 }, b: { x: 100, y: 0 } },
      { width: 800, height: 600 },
    );
    // The midpoint of the nodes (0, 15 with the label margin) lands in the middle.
    expect(pan.x).toBe(400);
    expect(Math.round(pan.y + zoom * 15)).toBe(300);
  });
});
