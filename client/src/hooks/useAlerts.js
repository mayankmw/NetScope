import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useAlertStore } from '@/stores/useAlertStore';
import { alertFiltersKey, parseAlertFilters, toAlertSearchParams } from '@/utils/alerts';

/**
 * The Alerts page list. Filters live in the URL (?status=unread&type=new_device&device=<id>) so a
 * view survives reloads and can be linked to (e.g. a device's alerts).
 */
export function useAlerts() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseAlertFilters(params), [params]);
  const key = alertFiltersKey(filters);
  const list = useAlertStore((state) => state.list);
  const openList = useAlertStore((state) => state.openList);
  const closeList = useAlertStore((state) => state.closeList);

  useEffect(() => {
    openList(filters);
    return closeList;
  }, [filters, openList, closeList]);

  const update = useCallback(
    (changes) =>
      setParams((current) => toAlertSearchParams({ ...parseAlertFilters(current), ...changes }), {
        replace: true,
      }),
    [setParams],
  );

  // Until the store switches to these filters, it may still hold another list.
  const shown =
    list.key === key ? list : { ...list, status: 'loading', items: [], nextCursor: null };

  return {
    ...shown,
    filters,
    setStatus: (status) => update({ status }),
    setType: (type) => update({ type }),
    clearDevice: () => update({ deviceId: null }),
  };
}
