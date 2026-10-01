import { DoorClosed, DoorOpen, ShieldCheck, Timer } from 'lucide-react';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { StatCard } from '@/components/common/StatCard';
import { PortRow } from '@/components/device-details/PortRow';
import { DeviceLink } from '@/components/devices/DeviceLink';
import { Button } from '@/components/ui/button';
import { deviceTitle } from '@/utils/deviceFilters';

/**
 * What a completed port scan saw: counts, the ports open then, and ports open in an earlier scan
 * that were not.
 *
 * @param {{ scan: import('@/types/api').Scan,
 *           results: { ports: import('@/types/api').DevicePort[] }, now: number }} props
 */
export function ScanPortResults({ scan, results, now }) {
  const summary = scan.summary;
  const open = results.ports.filter((port) => port.state === 'open');
  const closedSince = results.ports.filter((port) => port.state !== 'open');
  const cards = summary
    ? [
        { label: 'Open', value: summary.open, icon: DoorOpen, tone: 'primary' },
        { label: 'Closed', value: summary.closed, icon: DoorClosed, tone: 'muted' },
        { label: 'No response', value: summary.filtered, icon: Timer, tone: 'muted' },
        { label: 'Checked', value: summary.portsChecked, icon: ShieldCheck, tone: 'success' },
      ]
    : [];

  return (
    <div className="space-y-4">
      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {cards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>
      )}

      <GlassPanel as="section" aria-labelledby="scan-ports-title">
        <PanelHeader
          title={<span id="scan-ports-title">Open ports ({open.length})</span>}
          description={
            scan.device ? (
              <>
                On {deviceTitle(scan.device)} at <span className="font-mono">{scan.target}</span>
              </>
            ) : (
              <span className="font-mono">{scan.target}</span>
            )
          }
          actions={
            scan.device && (
              <Button asChild variant="outline" size="sm">
                <DeviceLink deviceId={scan.device.id}>Open device</DeviceLink>
              </Button>
            )
          }
        />
        {open.length > 0 ? (
          <ul className="divide-y divide-border/60 border-t border-border" aria-label="Open ports">
            {open.map((port) => (
              <PortRow
                key={`${port.protocol}/${port.port}`}
                port={port}
                now={now}
                showSince={false}
              />
            ))}
          </ul>
        ) : (
          <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
            {summary && summary.filtered === summary.portsChecked
              ? 'No port answered: the device may have been offline, or a firewall dropped the connections.'
              : 'None of the checked ports was open.'}
          </p>
        )}
        {closedSince.length > 0 && (
          <div className="border-t border-border">
            <h3 className="px-5 pt-3 pb-1 text-xs font-medium text-muted-foreground">
              Open in an earlier scan, not in this one
            </h3>
            <ul className="divide-y divide-border/60" aria-label="Ports no longer open">
              {closedSince.map((port) => (
                <PortRow
                  key={`${port.protocol}/${port.port}`}
                  port={port}
                  now={now}
                  showSince={false}
                />
              ))}
            </ul>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
