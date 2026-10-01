import { Crosshair, Eye, EyeOff } from 'lucide-react';
import { SearchInput } from '@/components/common/SearchInput';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Button } from '@/components/ui/button';
import { LAYOUTS } from './graphLayouts';

const VIEWS = [
  { value: 'graph', label: 'Graph' },
  { value: 'list', label: 'List' },
];

/**
 * Search (Enter brings the matches into view), layout, offline devices on/off, and graph or list
 * view.
 */
export function TopologyToolbar({
  query,
  onQueryChange,
  matchCount,
  onShowMatches,
  layout,
  onLayoutChange,
  showOffline,
  onShowOfflineChange,
  view,
  onViewChange,
  searchRef,
}) {
  const searching = query.trim().length > 0;
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <form
        role="search"
        className="flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onShowMatches();
        }}
      >
        <SearchInput
          value={query}
          onChange={onQueryChange}
          placeholder="Find a device: name, IP, MAC, vendor…"
          label="Find a device in the topology"
          shortcut="/"
          inputRef={searchRef}
          className="min-w-0 flex-1 lg:max-w-sm"
        />
        {searching && (
          <>
            <span
              className="shrink-0 text-xs text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {matchCount === 0
                ? 'No match'
                : `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`}
            </span>
            {view === 'graph' && matchCount > 0 && (
              <Button type="submit" variant="outline" size="sm" className="shrink-0">
                <Crosshair aria-hidden="true" />
                Show
              </Button>
            )}
          </>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-pressed={showOffline}
          onClick={() => onShowOfflineChange(!showOffline)}
        >
          {showOffline ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          Offline devices
        </Button>
        {view === 'graph' && (
          <SegmentedControl
            label="Layout"
            value={layout}
            onChange={onLayoutChange}
            options={LAYOUTS}
          />
        )}
        <SegmentedControl label="View" value={view} onChange={onViewChange} options={VIEWS} />
      </div>
    </div>
  );
}
