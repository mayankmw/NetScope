import { GlassPanel } from '@/components/common/GlassPanel';
import { Skeleton } from '@/components/ui/skeleton';

function PanelSkeleton({ rows = 4, className }) {
  return (
    <GlassPanel className={className}>
      <div className="space-y-4 p-5">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex gap-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

/** Placeholder with the shape of the details page's panels while the device loads. */
export function DeviceDetailsSkeleton() {
  return (
    <div
      className="grid gap-4 lg:grid-cols-3 lg:items-start"
      aria-busy="true"
      aria-label="Loading device"
    >
      <div className="space-y-4 lg:col-span-2">
        <PanelSkeleton rows={2} />
        <PanelSkeleton rows={5} />
      </div>
      <div className="space-y-4">
        <PanelSkeleton rows={5} />
        <PanelSkeleton rows={4} />
      </div>
    </div>
  );
}
