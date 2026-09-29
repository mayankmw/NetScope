import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';

/** Rendered by the router when a route throws while loading or rendering. */
export function RouteErrorPage() {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'Something went wrong while rendering this page.';

  return (
    <div role="alert" className="flex flex-col items-start gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Unexpected error</h1>
      <p className="text-muted-foreground">{message}</p>
      <Button asChild variant="outline">
        <Link to="/">Back to home</Link>
      </Button>
    </div>
  );
}
