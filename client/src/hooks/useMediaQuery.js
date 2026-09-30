import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept in sync with viewport changes.
 * Used to render one layout (table or cards) instead of rendering both and hiding one.
 * @param {string} query e.g. "(min-width: 768px)"
 */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
