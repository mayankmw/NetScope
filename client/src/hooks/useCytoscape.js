import { useEffect, useRef, useState } from 'react';
import { buildStylesheet } from '@/components/topology/graphStyle';
import { resolveGraphTheme } from '@/components/topology/graphTheme';

/**
 * Owns one Cytoscape instance for the lifetime of a container element.
 *
 * - Cytoscape is imported on first use, so its code (~400 kB) loads only with the topology page.
 * - The instance is created once and destroyed on unmount; data changes never recreate it.
 * - Event handlers are read through a ref, so changing them does not touch the instance.
 * - The canvas follows the container's size (ResizeObserver, coalesced per animation frame).
 *
 * @param {React.RefObject<HTMLElement>} containerRef
 * @param {{ onTapNode?: (id: string) => void, onDoubleTapNode?: (id: string) => void,
 *           onTapBackground?: () => void }} handlers
 * @returns {{ cy: import('cytoscape').Core | null, theme: object | null,
 *             status: 'loading' | 'ready' | 'error' }}
 */
export function useCytoscape(containerRef, handlers) {
  const [state, setState] = useState({ cy: null, theme: null, status: 'loading' });
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    let cancelled = false;
    let instance = null;
    let observer = null;
    let frame = 0;

    import('cytoscape')
      .then(({ default: cytoscape }) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        const theme = resolveGraphTheme();
        instance = cytoscape({
          container,
          style: buildStylesheet(theme),
          elements: [],
          minZoom: 0.15,
          maxZoom: 3,
          boxSelectionEnabled: false,
          selectionType: 'single',
          // Sharp on HiDPI screens without paying for 3x canvases.
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        });

        const on = (name) => (event) => handlersRef.current[name]?.(event.target.id());
        instance.on('tap', 'node', on('onTapNode'));
        instance.on('dbltap', 'node', on('onDoubleTapNode'));
        instance.on('tap', (event) => {
          if (event.target === instance) handlersRef.current.onTapBackground?.();
        });
        instance.on('mouseover', 'node', (event) => {
          event.target.addClass('hover');
          container.style.cursor = 'pointer';
        });
        instance.on('mouseout', 'node', (event) => {
          event.target.removeClass('hover');
          container.style.cursor = '';
        });

        observer = new ResizeObserver(() => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => instance.resize());
        });
        observer.observe(container);
        // Labels drawn before the web font loaded use a fallback font: redraw once it is ready.
        document.fonts?.ready.then(() => {
          if (!instance.destroyed()) instance.style().update();
        });

        setState({ cy: instance, theme, status: 'ready' });
      })
      .catch(() => {
        if (!cancelled) setState({ cy: null, theme: null, status: 'error' });
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      instance?.destroy();
      setState({ cy: null, theme: null, status: 'loading' });
    };
  }, [containerRef]);

  return state;
}
