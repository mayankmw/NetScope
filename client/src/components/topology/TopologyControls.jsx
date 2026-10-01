import { LayoutGrid, Maximize, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const CONTROLS = [
  { action: 'zoomIn', label: 'Zoom in', icon: Plus },
  { action: 'zoomOut', label: 'Zoom out', icon: Minus },
  { action: 'fit', label: 'Fit to view', icon: Maximize },
  { action: 'relayout', label: 'Arrange again', icon: LayoutGrid },
];

/** Floating zoom / fit / re-arrange buttons over the graph. */
export function TopologyControls({ controls, disabled }) {
  return (
    <div
      className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-lg border border-border bg-background/80 shadow-lg backdrop-blur"
      role="toolbar"
      aria-label="Graph view"
      aria-orientation="vertical"
    >
      {CONTROLS.map(({ action, label, icon: Icon }) => (
        <Tooltip key={action}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-none"
              onClick={() => controls[action]()}
              disabled={disabled}
              aria-label={label}
            >
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
