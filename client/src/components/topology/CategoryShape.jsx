import { cn } from '@/lib/utils';
import { CATEGORY_SHAPES } from './graphStyle';

/** SVG outlines matching the Cytoscape node shapes (16×16). */
const OUTLINES = {
  'round-diamond': <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" />,
  'round-rectangle': <rect x="2" y="2" width="12" height="12" rx="3" />,
  ellipse: <circle cx="8" cy="8" r="6.25" />,
  'round-hexagon': <polygon points="4.5,2 11.5,2 15,8 11.5,14 4.5,14 1,8" />,
  'round-octagon': (
    <polygon points="5.5,1.5 10.5,1.5 14.5,5.5 14.5,10.5 10.5,14.5 5.5,14.5 1.5,10.5 1.5,5.5" />
  ),
  'round-pentagon': <polygon points="8,1.5 14.5,6.3 12,14 4,14 1.5,6.3" />,
};

/**
 * The graph's shape for a node category, for the legend and the list view.
 * @param {{ category: keyof typeof CATEGORY_SHAPES, dashed?: boolean, className?: string }} props
 */
export function CategoryShape({ category, dashed = false, className }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('size-4 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeDasharray={dashed ? '2.5 2' : undefined}
      aria-hidden="true"
    >
      {OUTLINES[CATEGORY_SHAPES[category]]}
    </svg>
  );
}
