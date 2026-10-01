import cytoscape from 'cytoscape';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeDevice, makeInventory } from '@/test/fixtures';
import { buildTopologyModel } from '@/utils/topology';
import { runLayout } from './graphLayouts';
import { buildStylesheet } from './graphStyle';
import { FALLBACK_GRAPH_THEME } from './graphTheme';
import { applyHighlights, syncGraph, toElementDefinitions } from './graphSync';

const theme = FALLBACK_GRAPH_THEME;
const instances = [];

/** A real Cytoscape instance without a renderer (no canvas needed). */
function headless() {
  const cy = cytoscape({ headless: true, styleEnabled: true, style: buildStylesheet(theme) });
  instances.push(cy);
  return cy;
}

const definitionsFor = (devices) => {
  const { network } = makeInventory();
  return toElementDefinitions(buildTopologyModel({ network, devices }), theme);
};

afterEach(() => {
  instances.splice(0).forEach((cy) => cy.destroy());
  vi.restoreAllMocks();
});

describe('buildStylesheet', () => {
  it('is accepted by Cytoscape without a single warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cy = headless();
    cy.add(definitionsFor(makeInventory().devices));

    expect(warn).not.toHaveBeenCalled();
    expect(cy.nodes('[?isGateway]').style('shape')).toBe('round-diamond');
    expect(cy.nodes('[status = "offline"]').style('border-style')).toBe('dashed');
    expect(cy.edges().first().style('line-style')).toBe('dashed');
  });
});

describe('syncGraph', () => {
  it('adds everything to an empty graph, nodes before edges', () => {
    const cy = headless();
    const definitions = definitionsFor(makeInventory().devices);

    const result = syncGraph(cy, definitions);

    expect(result.added).toHaveLength(definitions.length);
    expect(cy.nodes()).toHaveLength(4);
    expect(cy.edges()).toHaveLength(3);
    expect(cy.edges().every((edge) => edge.data('kind') === 'logical')).toBe(true);
  });

  it('touches nothing when nothing changed', () => {
    const cy = headless();
    syncGraph(cy, definitionsFor(makeInventory().devices));

    expect(syncGraph(cy, definitionsFor(makeInventory().devices))).toEqual({
      added: [],
      removed: [],
      updated: [],
    });
  });

  it('updates only the device that changed, in place', () => {
    const cy = headless();
    const devices = makeInventory().devices;
    syncGraph(cy, definitionsFor(devices));
    const pi = cy.getElementById('device-192.168.1.20');
    pi.position({ x: 123, y: 45 });

    const next = devices.map((device) =>
      device.ipAddress === '192.168.1.20' ? { ...device, status: 'offline' } : device,
    );
    const result = syncGraph(cy, definitionsFor(next));

    // The node and its edge (whose style follows the device's status) change; nothing moves.
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.updated.sort()).toEqual(
      ['device-192.168.1.20', 'device-192.168.1.1->device-192.168.1.20'].sort(),
    );
    expect(pi.data('status')).toBe('offline');
    expect(pi.position()).toEqual({ x: 123, y: 45 });
  });

  it('removes devices that are gone, with their edges, and adds new ones at the gateway', () => {
    const cy = headless();
    const devices = makeInventory().devices;
    syncGraph(cy, definitionsFor(devices));
    cy.getElementById('device-192.168.1.1').position({ x: 10, y: 20 });

    const next = [
      ...devices.filter((device) => device.ipAddress !== '192.168.1.9'),
      makeDevice({ id: 'new-tv', ipAddress: '192.168.1.77', deviceType: 'tv' }),
    ];
    const result = syncGraph(cy, definitionsFor(next));

    expect(result.removed.sort()).toEqual(
      ['device-192.168.1.1->device-192.168.1.9', 'device-192.168.1.9'].sort(),
    );
    expect(result.added.sort()).toEqual(['device-192.168.1.1->new-tv', 'new-tv'].sort());
    expect(cy.getElementById('new-tv').position()).toEqual({ x: 10, y: 20 });
  });
});

describe('applyHighlights', () => {
  it('marks matches, fades the rest, and selects a node with its edge', () => {
    const cy = headless();
    syncGraph(cy, definitionsFor(makeInventory().devices));

    applyHighlights(cy, {
      matches: new Set(['device-192.168.1.20']),
      selectedId: 'device-192.168.1.20',
    });

    expect(cy.nodes('.match').map((node) => node.id())).toEqual(['device-192.168.1.20']);
    expect(cy.nodes('.faded')).toHaveLength(3);
    expect(cy.$(':selected').map((node) => node.id())).toEqual(['device-192.168.1.20']);
    expect(cy.edges('.active').map((edge) => edge.target().id())).toEqual(['device-192.168.1.20']);

    applyHighlights(cy, { matches: null, selectedId: null });
    expect(cy.elements('.match, .faded, .active, :selected')).toHaveLength(0);
  });
});

describe('runLayout', () => {
  it('places the gateway at the root and switches edges to tree routing', () => {
    const cy = headless();
    syncGraph(cy, definitionsFor(makeInventory().devices));

    runLayout(cy, 'tree', { animate: false });

    const gateway = cy.getElementById('device-192.168.1.1');
    expect(gateway.position()).toEqual({ x: 0, y: 0 });
    expect(
      cy
        .nodes()
        .not(gateway)
        .every((node) => node.position('y') > 0),
    ).toBe(true);
    expect(cy.edges().every((edge) => edge.hasClass('taxi'))).toBe(true);

    runLayout(cy, 'radial', { animate: false });
    expect(cy.edges('.taxi')).toHaveLength(0);
  });
});
