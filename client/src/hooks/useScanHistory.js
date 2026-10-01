import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useScanHistoryStore } from '@/stores/useScanHistoryStore';
import { parseScanFilters, scanFiltersKey, toScanSearchParams } from '@/utils/scans';

/**
 * The scan history for the Scans page. Filters live in the URL (?type=port&status=failed&device=)
 * so a filtered view survives reloads and can be linked to (e.g. a device's port scans). The list
 * is loaded when shown and kept current while the page is open.
 */
export function useScanHistory() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseScanFilters(params), [params]);
  const key = scanFiltersKey(filters);
  const state = useScanHistoryStore();
  const { open, close } = state;

  useEffect(() => {
    open(filters);
    return close;
  }, [filters, open, close]);

  const update = useCallback(
    (changes) =>
      setParams((current) => toScanSearchParams({ ...parseScanFilters(current), ...changes }), {
        replace: true,
      }),
    [setParams],
  );

  // Until the store switches to these filters, it may still hold another list.
  const list =
    state.key === key ? state : { ...state, status: 'loading', items: [], nextCursor: null };

  return {
    ...list,
    filters,
    setType: (type) => update({ type, deviceId: null }),
    setStatus: (status) => update({ status }),
    clearDevice: () => update({ deviceId: null }),
  };
}
