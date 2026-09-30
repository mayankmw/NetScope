import { useEffect } from 'react';

function isTypingTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Calls `handler` when `key` is pressed outside a text field (e.g. "/" to focus search).
 * @param {string} key
 * @param {() => void} handler
 */
export function useKeyboardShortcut(key, handler) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== key || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      handler();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, handler]);
}
