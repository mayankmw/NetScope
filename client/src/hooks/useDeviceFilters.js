import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  parseFilters,
  toSearchParams,
} from '@/utils/deviceFilters';

/**
 * Device list filters, stored in the URL (?q=&status=&type=&vendor=&sort=&dir=) so a filtered
 * view survives reloads, works with back/forward, and can be linked to (e.g. from the dashboard).
 */
export function useDeviceFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);

  const update = useCallback(
    (changes) => {
      setParams((current) => toSearchParams({ ...parseFilters(current), ...changes }), {
        replace: true,
      });
    },
    [setParams],
  );

  const toggle = useCallback(
    (key, value) => {
      setParams(
        (current) => {
          const parsed = parseFilters(current);
          const values = parsed[key].includes(value)
            ? parsed[key].filter((item) => item !== value)
            : [...parsed[key], value];
          return toSearchParams({ ...parsed, [key]: values });
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setSort = useCallback(
    (field) => {
      setParams(
        (current) => {
          const parsed = parseFilters(current);
          // Clicking the active column flips direction; a new column starts ascending, except
          // time columns, where newest first is the useful default.
          const dir =
            parsed.sort === field
              ? parsed.dir === 'asc'
                ? 'desc'
                : 'asc'
              : field === 'firstSeen' || field === 'lastSeen'
                ? 'desc'
                : 'asc';
          return toSearchParams({ ...parsed, sort: field, dir });
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => {
    setParams(
      (current) => {
        const { sort, dir } = parseFilters(current);
        return toSearchParams({ ...DEFAULT_FILTERS, sort, dir });
      },
      { replace: true },
    );
  }, [setParams]);

  return {
    filters,
    activeCount: countActiveFilters(filters),
    setSearch: (q) => update({ q }),
    setStatus: (status) => update({ status }),
    toggleType: (type) => toggle('types', type),
    toggleVendor: (vendor) => toggle('vendors', vendor),
    clearTypes: () => update({ types: [] }),
    clearVendors: () => update({ vendors: [] }),
    setSort,
    setSortDirection: (dir) => update({ dir }),
    clearFilters,
  };
}
