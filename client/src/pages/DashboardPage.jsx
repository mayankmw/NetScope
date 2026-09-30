import { MonitorSmartphone, Radar, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { PageHeader } from '@/components/common/PageHeader';
import { RelativeTime } from '@/components/common/RelativeTime';
import { StatCard } from '@/components/common/StatCard';
import { DiscoverButton } from '@/components/devices/DiscoverButton';
import { RecentDevicesPanel } from '@/components/devices/RecentDevicesPanel';
import { NetworkPanel } from '@/components/network/NetworkPanel';
import { SystemStatusCard } from '@/components/system/SystemStatusCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeviceInventory } from '@/hooks/useDeviceInventory';
import { useNow } from '@/hooks/useNow';
import { isNewDevice } from '@/utils/deviceFilters';

const RECENT_COUNT = 5;

function useStats(devices, now) {
  return useMemo(() => {
    const online = devices.filter((device) => device.status === 'online').length;
    return {
      total: devices.length,
      online,
      offline: devices.length - online,
      new: devices.filter((device) => isNewDevice(device, now)).length,
      recent: [...devices]
        .sort((a, b) => new Date(b.firstSeenAt) - new Date(a.firstSeenAt))
        .slice(0, RECENT_COUNT),
    };
  }, [devices, now]);
}

/** Network overview: headline numbers, the current network, system health, newest devices. */
export function DashboardPage() {
  const { network, devices, status, error, refresh } = useDeviceInventory();
  const now = useNow();
  const stats = useStats(devices, now);
  const isLoading = status === 'idle' || status === 'loading';

  if (status === 'error') {
    return (
      <GlassPanel>
        <ErrorState title="Could not load the network overview" error={error} onRetry={refresh} />
      </GlassPanel>
    );
  }

  if (!isLoading && !network) {
    return (
      <div className="space-y-6">
        <PageHeader title="Overview" />
        <GlassPanel>
          <EmptyState
            icon={Radar}
            title="Map your network"
            description="NetScope has not scanned this network yet. Discovery pings every address on your local subnet and reads the ARP table. It takes a few seconds and needs no special permissions."
            action={<DiscoverButton />}
          />
        </GlassPanel>
        <div className="max-w-md">
          <SystemStatusCard />
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: 'Devices',
      value: stats.total,
      icon: MonitorSmartphone,
      tone: 'primary',
      to: '/devices',
    },
    {
      label: 'Online',
      value: stats.online,
      icon: Wifi,
      tone: 'success',
      to: '/devices?status=online',
    },
    {
      label: 'Offline',
      value: stats.offline,
      icon: WifiOff,
      tone: 'muted',
      to: '/devices?status=offline',
    },
    {
      label: 'New (24 h)',
      value: stats.new,
      icon: Sparkles,
      tone: 'magenta',
      to: '/devices?sort=firstSeen&dir=desc',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={
          network ? (
            <>
              Monitoring <span className="font-mono text-foreground">{network.cidr}</span>
              {network.lastScan && (
                <>
                  {' '}
                  · last scan <RelativeTime value={network.lastScan.finishedAt} now={now} />
                </>
              )}
            </>
          ) : (
            <Skeleton className="h-4 w-56" />
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.05 }}
          >
            <StatCard {...card} isLoading={isLoading} />
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {network ? (
            <NetworkPanel
              network={network}
              onlineCount={stats.online}
              totalCount={stats.total}
              now={now}
            />
          ) : (
            <GlassPanel className="h-full min-h-40 p-5">
              <Skeleton className="h-4 w-24" />
            </GlassPanel>
          )}
        </div>
        <SystemStatusCard />
      </div>

      {stats.recent.length > 0 && <RecentDevicesPanel devices={stats.recent} now={now} />}
    </div>
  );
}
