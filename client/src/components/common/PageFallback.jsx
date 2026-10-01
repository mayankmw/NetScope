import { Skeleton } from '@/components/ui/skeleton';
import { GlassPanel } from './GlassPanel';

/** Placeholder for the page area while a page's code is loading. */
export function PageFallback() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <GlassPanel className="h-64" />
    </div>
  );
}
