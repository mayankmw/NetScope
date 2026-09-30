import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Explains a failed load and offers a retry. Shows the error code and request ID for support. */
export function ErrorState({ title = 'Something went wrong', error, onRetry, className }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {error?.message && <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>}
      {error?.code && (
        <p className="font-mono text-xs text-muted-foreground">
          {error.code}
          {error.requestId && ` · ${error.requestId}`}
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      )}
    </div>
  );
}
