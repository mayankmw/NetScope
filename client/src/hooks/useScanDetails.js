import { useEffect } from 'react';
import { useScanDetailsStore } from '@/stores/useScanDetailsStore';
import { isUuid } from '@/utils/ids';

/**
 * Loads a scan for the scan details page and keeps it current while the page is shown.
 * A malformed id is "not found" without asking the server.
 *
 * @param {string | undefined} scanId from the URL
 */
export function useScanDetails(scanId) {
  const isValid = isUuid(scanId);
  const state = useScanDetailsStore();
  const { open, close } = state;

  useEffect(() => {
    if (!isValid) return undefined;
    open(scanId);
    return close;
  }, [scanId, isValid, open, close]);

  if (!isValid) return { ...state, status: 'not-found', data: null };
  // Until the store switches to this scan, it may still hold the previous one.
  if (state.scanId !== scanId) return { ...state, status: 'loading', data: null };
  return state;
}
