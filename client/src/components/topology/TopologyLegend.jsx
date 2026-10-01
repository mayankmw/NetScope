import { Info } from 'lucide-react';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS } from '@/utils/topology';
import { CategoryShape } from './CategoryShape';

function Swatch({ className }) {
  return (
    <span
      className={cn('inline-block size-3.5 shrink-0 rounded-full border-2', className)}
      aria-hidden="true"
    />
  );
}

const STATES = [
  { label: 'Online', swatch: 'border-primary' },
  { label: 'Offline at the last scan', swatch: 'border-dashed border-muted-foreground opacity-60' },
  { label: 'This computer (runs NetScope)', swatch: 'border-success' },
  {
    label: 'New in the last 24 hours',
    swatch: 'border-primary outline outline-2 outline-offset-1 outline-neon-magenta',
  },
];

/**
 * What the graph's shapes, colors, and lines mean. States plainly that the topology is logical:
 * the lines are not cables or Wi-Fi links.
 */
export function TopologyLegend({ className }) {
  return (
    <GlassPanel className={className}>
      <PanelHeader title="Legend" />
      <div className="space-y-4 px-5 pb-5 text-xs">
        <div className="flex gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">Logical topology.</span> Each line means
            the device is on the gateway&apos;s subnet and reaches other networks through it. Lines
            are not cables or Wi-Fi links: NetScope cannot see switches, access points, or how
            devices are physically connected.
          </p>
        </div>

        <ul className="space-y-1.5" aria-label="Node shapes">
          {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
            <li key={category} className="flex items-center gap-2">
              <CategoryShape category={category} className="text-primary" />
              {label}
            </li>
          ))}
        </ul>

        <ul className="space-y-1.5" aria-label="Node outlines">
          {STATES.map(({ label, swatch }) => (
            <li key={label} className="flex items-center gap-2">
              <Swatch className={swatch} />
              {label}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 4"
            className="h-1 w-6 shrink-0 text-muted-foreground"
            aria-hidden="true"
          >
            <line
              x1="0"
              y1="2"
              x2="24"
              y2="2"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </svg>
          Same subnet as the gateway (logical)
        </div>
      </div>
    </GlassPanel>
  );
}
