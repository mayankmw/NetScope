import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useApiHealth } from '@/hooks/useApiHealth';
import { formatDuration, formatTime } from '@/utils/format';

const WARNING_BADGE_CLASS =
  'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400';

/**
 * Online: API and database up. Degraded: API answered but a dependency is down.
 * Unreachable: the API itself could not be reached.
 */
function getBadge(status, data) {
  if (status === 'loading') return { label: 'Checking…', variant: 'secondary' };
  if (status === 'error') return { label: 'Unreachable', variant: 'destructive' };
  if (data?.status === 'ok') return { label: 'Online', variant: 'default' };
  return { label: 'Degraded', variant: 'outline', className: WARNING_BADGE_CLASS };
}

function formatDatabaseStatus(database) {
  if (database?.status !== 'up') return 'Down';
  return `Up · ${database.latencyMs} ms`;
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/** Shows whether the browser can reach the API, and whether the API can reach its database. */
export function SystemStatusCard() {
  const { status, data, error, checkedAt, refresh } = useApiHealth();
  const badge = getBadge(status, data);
  const isDegraded = data?.status === 'degraded';

  return (
    <Card>
      <CardHeader>
        <CardTitle>API server</CardTitle>
        <CardDescription>
          {checkedAt ? `Last checked at ${formatTime(checkedAt)}` : 'Connecting to the API…'}
        </CardDescription>
        <CardAction>
          <Badge variant={badge.variant} className={badge.className} aria-live="polite">
            {badge.label}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {data && (
          <dl className="divide-y">
            <DetailRow label="Service">{data.service}</DetailRow>
            <DetailRow label="Version">{data.version}</DetailRow>
            <DetailRow label="Environment">{data.environment}</DetailRow>
            <DetailRow label="Uptime">{formatDuration(data.uptimeSeconds)}</DetailRow>
            <DetailRow label="Database">{formatDatabaseStatus(data.checks?.database)}</DetailRow>
          </dl>
        )}

        {isDegraded && (
          <div
            role="status"
            className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
          >
            <p className="font-medium text-amber-700 dark:text-amber-400">
              The API is running, but it cannot reach the database.
            </p>
            <p className="text-muted-foreground">
              Check that PostgreSQL is running and that the server&apos;s DATABASE_URL is correct.
              The server log shows the exact cause.
            </p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            <p className="font-medium text-destructive">{error.message}</p>
            <p className="text-muted-foreground">
              Code: <span className="font-mono">{error.code}</span>
              {error.requestId && (
                <>
                  {' · '}Request ID: <span className="font-mono">{error.requestId}</span>
                </>
              )}
            </p>
          </div>
        )}

        <Button variant="outline" size="sm" onClick={refresh} disabled={status === 'loading'}>
          <RefreshCw className={status === 'loading' ? 'animate-spin' : undefined} />
          Refresh
        </Button>
      </CardContent>
    </Card>
  );
}
