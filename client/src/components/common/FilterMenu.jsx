import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Multi-select filter in a dropdown. The menu stays open while toggling options.
 * @param {{ label: string, icon?: any, options: Array<{ value: string, label: string, count?: number, icon?: any }>,
 *           selected: string[], onToggle: (value: string) => void, onClear: () => void, emptyText?: string }} props
 */
export function FilterMenu({
  label,
  icon: Icon,
  options,
  selected,
  onToggle,
  onClear,
  emptyText = 'No options',
}) {
  const count = selected.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn('h-9 gap-1.5', count > 0 && 'border-primary/40 text-primary')}
        >
          {Icon && <Icon aria-hidden="true" />}
          {label}
          {count > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground tabular-nums">
              {count}
            </span>
          )}
          <ChevronDown className="opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Filter by {label.toLowerCase()}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {options.map((option) => {
              const OptionIcon = option.icon;
              return (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => onToggle(option.value)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {OptionIcon && <OptionIcon aria-hidden="true" />}
                  <span className="truncate">{option.label}</span>
                  {option.count !== undefined && (
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {option.count}
                    </span>
                  )}
                </DropdownMenuCheckboxItem>
              );
            })}
          </div>
        )}
        {count > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onClear}>
              Clear {label.toLowerCase()} filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
