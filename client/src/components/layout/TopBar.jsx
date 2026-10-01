import { Network } from 'lucide-react';
import { DiscoverButton } from '@/components/devices/DiscoverButton';
import { LiveIndicator } from '@/components/system/LiveIndicator';
import { SystemStatusIndicator } from '@/components/system/SystemStatusIndicator';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { Brand } from './Brand';
import { MobileNav } from './MobileNav';
import { ScanProgressBar } from './ScanProgressBar';

function NetworkBadge() {
  const network = useDeviceStore((state) => state.network);
  if (!network) return null;
  return (
    <span
      className="hidden h-8 items-center gap-2 rounded-full border border-border bg-background/40 px-3 text-xs text-muted-foreground md:inline-flex"
      title={`Interface ${network.interfaceName}, gateway ${network.gatewayIpAddress}`}
    >
      <Network className="size-3.5 text-primary" aria-hidden="true" />
      <span className="font-mono text-foreground">{network.cidr}</span>
      <span className="hidden xl:inline">· {network.interfaceName}</span>
    </span>
  );
}

/**
 * Sticky top bar: mobile menu, current network, live-update and system status, and the global
 * discover action.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/60 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:px-8">
        <MobileNav />
        <Brand className="lg:hidden" />
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <NetworkBadge />
          <LiveIndicator className="hidden sm:inline-flex" />
          <SystemStatusIndicator />
          <DiscoverButton className="hidden sm:inline-flex" />
          <DiscoverButton compact size="icon" className="sm:hidden" />
        </div>
      </div>
      <ScanProgressBar />
    </header>
  );
}
