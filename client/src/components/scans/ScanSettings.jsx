import { DetailList, DetailRow } from '@/components/common/DetailList';
import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { formatElapsed } from '@/utils/format';

const NMAP_MODES = { auto: 'Used when installed', off: 'Off' };

function DiscoverySettings({ scan }) {
  const { params } = scan;
  return (
    <>
      <DetailRow label="Swept range">
        <span className="font-mono">{params.sweepCidr ?? scan.target}</span>
      </DetailRow>
      {scan.network && (
        <DetailRow label="Network">
          <span className="font-mono">{scan.network.cidr}</span>
          {params.interfaceName && (
            <span className="text-muted-foreground"> on {params.interfaceName}</span>
          )}
        </DetailRow>
      )}
      {params.pingTimeoutMs !== undefined && (
        <DetailRow label="Ping">
          {formatElapsed(params.pingTimeoutMs)} timeout, {params.pingConcurrency} at a time
        </DetailRow>
      )}
      {params.nmap && <DetailRow label="nmap">{NMAP_MODES[params.nmap] ?? params.nmap}</DetailRow>}
    </>
  );
}

function PortScanSettings({ scan }) {
  const { params } = scan;
  return (
    <>
      <DetailRow label="Address">
        <span className="font-mono">{scan.target}</span>
      </DetailRow>
      {params.profile && (
        <DetailRow label="Profile" hint="A fixed list of common TCP ports">
          {params.profile}
        </DetailRow>
      )}
      {params.serviceDetection && (
        <DetailRow label="Service detection">
          {params.serviceDetection === 'light' ? 'Light' : 'Off'}
        </DetailRow>
      )}
      {params.timeoutMs !== undefined && (
        <DetailRow label="Time limit">{formatElapsed(params.timeoutMs)}</DetailRow>
      )}
      {Array.isArray(params.nmapArgs) && (
        <DetailRow label="Command" stacked copyValue={`nmap ${params.nmapArgs.join(' ')}`}>
          <code className="font-mono text-xs break-all text-muted-foreground">
            nmap {params.nmapArgs.join(' ')}
          </code>
        </DetailRow>
      )}
    </>
  );
}

/**
 * How a scan ran: the settings recorded with it (fixed by the server, never by a request).
 * @param {{ scan: import('@/types/api').ScanDetails['scan'], className?: string }} props
 */
export function ScanSettings({ scan, className }) {
  return (
    <GlassPanel as="section" aria-labelledby="scan-settings-title" className={className}>
      <PanelHeader
        title={<span id="scan-settings-title">How it ran</span>}
        description="Settings recorded with the scan"
      />
      <DetailList className="border-t border-border">
        {scan.type === 'port' ? (
          <PortScanSettings scan={scan} />
        ) : (
          <DiscoverySettings scan={scan} />
        )}
        <DetailRow label="Scan ID" copyValue={scan.id}>
          <span className="font-mono text-xs break-all">{scan.id}</span>
        </DetailRow>
      </DetailList>
    </GlassPanel>
  );
}
