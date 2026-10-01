import { useEffect, useMemo, useRef } from 'react';
import { runLayout, viewportFor } from '@/components/topology/graphLayouts';
import { applyHighlights, syncGraph, toElementDefinitions } from '@/components/topology/graphSync';

const FLASH_MS = 2_500;
const LAYOUT_SETTLE_MS = 80;

/**
 * Keeps a Cytoscape graph showing a topology model, with as little work as possible:
 *
 * - model → element definitions is memoized; the graph is updated by diff (syncGraph).
 * - The layout runs only when devices appear or disappear, or the layout is changed; a device
 *   changing status or name restyles that node and moves nothing.
 * - Search and selection only toggle classes.
 * - Devices changed by a live event flash briefly.
 *
 * Returns viewport controls for toolbars and keyboard shortcuts.
 *
 * @param {import('cytoscape').Core | null} cy
 * @param {{ model: import('@/utils/topology').TopologyModel, theme: object | null,
 *           layout: 'radial' | 'tree', matches: Set<string> | null, selectedId: string | null,
 *           changedAt: Record<string, number> }} options
 */
export function useTopologyGraph(cy, { model, theme, layout, matches, selectedId, changedAt }) {
  const definitions = useMemo(
    () => (theme ? toElementDefinitions(model, theme) : []),
    [model, theme],
  );
  /** The layout last run, and on which instance (a remount starts over). */
  const lastLayout = useRef({ cy: null, name: null });
  const layoutTimer = useRef(0);
  const flashed = useRef({});
  const flashTimers = useRef(new Map());

  // Structure and data.
  useEffect(() => {
    if (!cy) return;
    const { added, removed } = syncGraph(cy, definitions);
    const firstDraw = lastLayout.current.cy !== cy;
    const structural = added.length > 0 || removed.length > 0;
    if (firstDraw || lastLayout.current.name !== layout) {
      clearTimeout(layoutTimer.current);
      runLayout(cy, layout, { animate: !firstDraw });
      lastLayout.current = { cy, name: layout };
    } else if (structural) {
      // One discovery announces each new device separately, milliseconds apart: lay out once
      // the burst is over.
      clearTimeout(layoutTimer.current);
      layoutTimer.current = setTimeout(() => {
        if (!cy.destroyed()) runLayout(cy, layout);
      }, LAYOUT_SETTLE_MS);
    }
  }, [cy, definitions, layout]);

  useEffect(() => () => clearTimeout(layoutTimer.current), [cy]);

  // Highlighting.
  useEffect(() => {
    if (cy) applyHighlights(cy, { matches, selectedId });
  }, [cy, definitions, matches, selectedId]);

  // Flash devices changed by real-time events. One timer per node, kept across renders: events
  // arrive in bursts, and a new event must not cancel the end of an earlier flash.
  useEffect(() => {
    if (!cy) return;
    const now = Date.now();
    for (const [id, at] of Object.entries(changedAt)) {
      if (now - at > FLASH_MS || flashed.current[id] === at) continue;
      flashed.current[id] = at;
      const node = cy.getElementById(id);
      if (node.empty()) continue;
      node.addClass('changed');
      clearTimeout(flashTimers.current.get(id));
      flashTimers.current.set(
        id,
        setTimeout(() => {
          node.removeClass('changed');
          flashTimers.current.delete(id);
        }, FLASH_MS),
      );
    }
  }, [cy, changedAt]);

  useEffect(() => {
    const timers = flashTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, [cy]);

  return useMemo(() => {
    const animate = (options) => cy?.animate({ ...options, duration: 250, easing: 'ease-out' });
    const zoomBy = (factor) =>
      animate({
        zoom: {
          level: Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor)),
          renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
        },
      });
    return {
      zoomIn: () => cy && zoomBy(1.3),
      zoomOut: () => cy && zoomBy(1 / 1.3),
      fit: () => {
        if (!cy || cy.nodes().empty()) return;
        const positions = Object.fromEntries(
          cy.nodes().map((node) => [node.id(), node.position()]),
        );
        animate(viewportFor(positions, { width: cy.width(), height: cy.height() }));
      },
      relayout: () => cy && runLayout(cy, layout),
      /** Brings these nodes into view. */
      focus: (ids) => {
        if (!cy || ids.length === 0) return;
        const nodes = cy.nodes().filter((node) => ids.includes(node.id()));
        if (nodes.empty()) return;
        animate(
          nodes.length === 1
            ? { center: { eles: nodes }, zoom: Math.max(cy.zoom(), 1.2) }
            : { fit: { eles: nodes, padding: 80 } },
        );
      },
    };
  }, [cy, layout]);
}
