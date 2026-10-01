import { iconColor } from './graphStyle';
import { nodeIcon } from './nodeIcons';

/**
 * Keeps a Cytoscape graph in step with the topology model by applying differences, never by
 * rebuilding it: elements no longer in the model are removed, new ones added, and changed ones
 * get new data (which restyles them through the data-driven stylesheet). Each element remembers
 * a signature of its data, so unchanged elements are not touched at all.
 */

const LABEL_NAME_LENGTH = 22;

function truncate(text, length) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/**
 * Cytoscape element definitions for a model.
 * @param {import('@/utils/topology').TopologyModel} model
 * @param {ReturnType<typeof import('./graphTheme.js').resolveGraphTheme>} theme
 */
export function toElementDefinitions(model, theme) {
  const statusById = new Map(model.nodes.map((node) => [node.id, node.status]));
  const nodes = model.nodes.map((node) => ({
    group: 'nodes',
    data: {
      id: node.id,
      label: `${truncate(node.name, LABEL_NAME_LENGTH)}\n${node.ipAddress}`,
      category: node.category,
      status: node.status,
      deviceType: node.deviceType,
      isGateway: node.isGateway,
      isSelf: node.isSelf,
      isNew: node.isNew,
      synthetic: node.synthetic,
      order: node.order,
      icon: nodeIcon(node.deviceType, iconColor(node, theme)),
    },
  }));
  const edges = model.edges.map((edge) => ({
    group: 'edges',
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      targetStatus: statusById.get(edge.target),
    },
  }));
  return [...nodes, ...edges];
}

const SIGNATURE = '_netscopeSignature';
const signature = (definition) => JSON.stringify(definition.data);

/**
 * Applies the definitions to the graph in one batch (one redraw).
 *
 * @param {import('cytoscape').Core} cy
 * @param {ReturnType<typeof toElementDefinitions>} definitions
 * @returns {{ added: string[], removed: string[], updated: string[] }} element ids
 */
export function syncGraph(cy, definitions) {
  const wanted = new Map(definitions.map((definition) => [definition.data.id, definition]));
  const added = [];
  const removed = [];
  const updated = [];

  cy.batch(() => {
    const stale = cy.elements().filter((element) => !wanted.has(element.id()));
    removed.push(...stale.map((element) => element.id()));
    cy.remove(stale);

    // New nodes start at the gateway, so the layout animates them outwards.
    const rootPosition = cy.nodes('[?isGateway]').first().position();
    const additions = [];
    for (const definition of wanted.values()) {
      const element = cy.getElementById(definition.data.id);
      const nextSignature = signature(definition);
      if (element.empty()) {
        additions.push({
          ...definition,
          position: definition.group === 'nodes' && rootPosition ? { ...rootPosition } : undefined,
        });
      } else if (element.scratch(SIGNATURE) !== nextSignature) {
        element.data(definition.data);
        element.scratch(SIGNATURE, nextSignature);
        updated.push(definition.data.id);
      }
    }
    // Nodes before edges: an edge needs both ends.
    additions.sort((a, b) => (a.group === b.group ? 0 : a.group === 'nodes' ? -1 : 1));
    cy.add(additions).forEach((element) => {
      element.scratch(SIGNATURE, signature(wanted.get(element.id())));
      added.push(element.id());
    });
  });

  return { added, removed, updated };
}

/**
 * Search and selection highlighting: classes only, in one batch; no layout.
 *
 * @param {import('cytoscape').Core} cy
 * @param {{ matches: Set<string> | null, selectedId: string | null }} state
 */
export function applyHighlights(cy, { matches, selectedId }) {
  cy.batch(() => {
    cy.elements().removeClass('match faded active');

    if (matches) {
      cy.nodes().forEach((node) => {
        node.addClass(matches.has(node.id()) ? 'match' : 'faded');
      });
      cy.edges().forEach((edge) => {
        if (!matches.has(edge.target().id())) edge.addClass('faded');
      });
    }

    const selected = selectedId ? cy.getElementById(selectedId) : cy.collection();
    cy.nodes(':selected').difference(selected).unselect();
    if (selected.nonempty()) {
      if (!selected.selected()) selected.select();
      selected.connectedEdges().addClass('active');
    }
  });
}
