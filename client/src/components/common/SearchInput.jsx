import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Search field with a leading icon, a clear button, and an optional keyboard-shortcut hint.
 * Pass `inputRef` to focus it from a shortcut.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  shortcut,
  inputRef,
  className,
  label = 'Search',
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onChange('');
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        maxLength={100}
        className="h-9 pr-12 pl-8 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        shortcut && (
          <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-border bg-muted/50 px-1.5 font-mono text-[10px] text-muted-foreground sm:block">
            {shortcut}
          </kbd>
        )
      )}
    </div>
  );
}
