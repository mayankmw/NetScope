import { GlassPanel } from '@/components/common/GlassPanel';
import { Skeleton } from '@/components/ui/skeleton';

const ROWS = 6;

/** Placeholder with the same shape as the table (or the card grid) while devices load. */
export function DeviceListSkeleton({ variant = 'table' }) {
  if (variant === 'cards') {
    return (
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        aria-busy="true"
        aria-label="Loading devices"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <GlassPanel key={index} className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </GlassPanel>
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Loading devices">
      {Array.from({ length: ROWS }, (_, index) => (
        <div key={index} className="flex items-center gap-6 px-3 py-3.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="hidden h-4 w-24 lg:block" />
          <Skeleton className="hidden h-4 w-20 xl:block" />
        </div>
      ))}
    </div>
  );
}
