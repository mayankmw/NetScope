import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { ErrorState } from '@/components/common/ErrorState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { Button } from '@/components/ui/button';

/** Rendered by the router when a route throws while loading or rendering. */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'Something went wrong while rendering this page.';

  return (
    <div className="p-6">
      <GlassPanel>
        <ErrorState title="Unexpected error" error={{ message }} />
        <div className="flex justify-center pb-8">
          <Button asChild variant="outline">
            <Link to="/">Back to overview</Link>
          </Button>
        </div>
      </GlassPanel>
    </div>
  );
}
