import { Database, RefreshCw, Server } from 'lucide-react';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { StatusDot } from '@/components/common/StatusDot';
import { Button } from '@/components/ui/button';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import { formatDuration, formatTime } from '@/utils/format';

function Row({ icon: Icon, label, tone, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </span>
      <span className="inline-flex items-center gap-2 font-medium">
        {tone && <StatusDot tone={tone} />}
        {value}
      </span>
    </div>
  );
}

/** API and database health with version and uptime. */
export function SystemStatusCard() {
  const { state, data, error, checkedAt, isChecking, refresh } = useSystemHealth();
  const database = data?.checks?.database;

  return (
    <GlassPanel className="flex flex-col">
      <PanelHeader
        title="System status"
        description={checkedAt ? `Checked at ${formatTime(checkedAt)}` : 'Checking…'}
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refresh}
            disabled={isChecking}
            aria-label="Check again"
          >
            <RefreshCw className={isChecking ? 'motion-safe:animate-spin' : undefined} />
          </Button>
        }
      />
      <div className="divide-y divide-border px-5 pb-4">
        <Row
          icon={Server}
          label="API server"
          tone={state === 'offline' ? 'error' : state === 'checking' ? 'neutral' : 'online'}
          value={state === 'offline' ? 'Unreachable' : state === 'checking' ? 'Checking' : 'Up'}
        />
        <Row
          icon={Database}
          label="Database"
          tone={!database ? 'neutral' : database.status === 'up' ? 'online' : 'warning'}
          value={
            !database ? '—' : database.status === 'up' ? `Up · ${database.latencyMs} ms` : 'Down'
          }
        />
        {data && (
          <p className="pt-3 text-xs text-muted-foreground">
            v{data.version} · {data.environment} · up {formatDuration(data.uptimeSeconds)}
          </p>
        )}
        {error && (
          <p role="alert" className="pt-3 text-xs text-destructive">
            {error.message}
          </p>
        )}
        {state === 'degraded' && (
          <p role="status" className="pt-3 text-xs text-warning">
            The API cannot reach PostgreSQL. Check that it is running and that DATABASE_URL is
            correct.
          </p>
        )}
      </div>
    </GlassPanel>
  );
}
