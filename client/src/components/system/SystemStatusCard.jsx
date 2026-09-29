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

const STATUS_BADGES = {
  loading: { label: 'Checking…', variant: 'secondary' },
  success: { label: 'Online', variant: 'default' },
  error: { label: 'Unreachable', variant: 'destructive' },
};

function DetailRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/** Shows whether the browser can reach the API through the full client → proxy → server path. */
export function SystemStatusCard() {
  const { status, data, error, checkedAt, refresh } = useApiHealth();
  const badge = STATUS_BADGES[status];

  return (
    <Card>
      <CardHeader>
        <CardTitle>API server</CardTitle>
        <CardDescription>
          {checkedAt ? `Last checked at ${formatTime(checkedAt)}` : 'Connecting to the API…'}
        </CardDescription>
        <CardAction>
          <Badge variant={badge.variant} aria-live="polite">
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
          </dl>
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
