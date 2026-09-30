import { ArrowDownUp, Building2, Shapes, X } from 'lucide-react';
import { FilterMenu } from '@/components/common/FilterMenu';
import { SearchInput } from '@/components/common/SearchInput';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SORT_FIELDS } from '@/utils/deviceFilters';
import { deviceTypeIcon } from './deviceTypeIcons';

/**
 * Search, status/type/vendor filters, and (when the table's sortable headers are not shown) a
 * sort control. Fully controlled: state lives in the URL via useDeviceFilters.
 */
export function DeviceToolbar({ filterState, options, searchRef, showSortControl }) {
  const {
    filters,
    activeCount,
    setSearch,
    setStatus,
    toggleType,
    toggleVendor,
    clearTypes,
    clearVendors,
    setSort,
    setSortDirection,
    clearFilters,
  } = filterState;

  const typeOptions = options.types.map((option) => ({
    ...option,
    icon: deviceTypeIcon(option.value),
  }));

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <SearchInput
        inputRef={searchRef}
        value={filters.q}
        onChange={setSearch}
        placeholder="Search IP, MAC, hostname, vendor…"
        shortcut="/"
        label="Search devices"
        className="w-full lg:max-w-sm"
      />

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Status"
          value={filters.status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All', count: options.status.all },
            { value: 'online', label: 'Online', count: options.status.online },
            { value: 'offline', label: 'Offline', count: options.status.offline },
          ]}
        />
        <FilterMenu
          label="Type"
          icon={Shapes}
          options={typeOptions}
          selected={filters.types}
          onToggle={toggleType}
          onClear={clearTypes}
        />
        <FilterMenu
          label="Vendor"
          icon={Building2}
          options={options.vendors}
          selected={filters.vendors}
          onToggle={toggleVendor}
          onClear={clearVendors}
        />

        {showSortControl && (
          <div className="flex items-center gap-1">
            <Select value={filters.sort} onValueChange={setSort}>
              <SelectTrigger className="h-9" aria-label="Sort by">
                <ArrowDownUp className="text-muted-foreground" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORT_FIELDS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="h-9"
              onClick={() => setSortDirection(filters.dir === 'asc' ? 'desc' : 'asc')}
              aria-label={`Sort ${filters.dir === 'asc' ? 'descending' : 'ascending'}`}
            >
              {filters.dir === 'asc' ? 'Asc' : 'Desc'}
            </Button>
          </div>
        )}

        {activeCount > 0 && (
          <Button variant="ghost" className="h-9 text-muted-foreground" onClick={clearFilters}>
            <X aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
