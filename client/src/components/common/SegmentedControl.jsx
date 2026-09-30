import { motion } from 'motion/react';
import { useId, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Single-choice toggle (radio group semantics, arrow-key navigation) with an animated indicator.
 * @param {{ label: string, value: string, onChange: (value: string) => void,
 *           options: Array<{ value: string, label: string, count?: number }> }} props
 */
export function SegmentedControl({ label, value, onChange, options, className }) {
  const indicatorId = useId();
  const buttons = useRef([]);

  function onKeyDown(event, index) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex h-9 items-center rounded-lg border border-border bg-background/40 p-0.5',
        className,
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'relative h-full rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId={indicatorId}
                className="absolute inset-0 rounded-md bg-primary shadow-[0_0_14px_-4px_var(--primary)]"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
              />
            )}
            <span className="relative">
              {option.label}
              {option.count !== undefined && (
                <span className="ml-1.5 text-xs tabular-nums opacity-70">{option.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
