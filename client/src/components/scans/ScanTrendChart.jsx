import { GlassPanel, PanelHeader } from '@/components/common/GlassPanel';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOpenScan } from '@/hooks/useOpenScan';
import { formatDateTime } from '@/utils/format';

/** Height of the tallest bar, in px. Missing devices hang below the axis on the same scale. */
const PLOT_HEIGHT = 112;

function describe(scan) {
  const { devicesFound, newDevices, missingDevices } = scan.summary;
  return `${formatDateTime(scan.startedAt)}: ${devicesFound} found, ${newDevices} new, ${missingDevices} missing`;
}

function Legend() {
  const items = [
    ['bg-primary', 'Found'],
    ['bg-neon-magenta', 'New'],
    ['bg-muted-foreground/40', 'Missing'],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([swatch, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={`size-2 rounded-sm ${swatch}`} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}

/**
 * How the network changed across recent discoveries: one column per scan (oldest left), the
 * devices it found above the axis (new ones on top) and the known devices it missed below.
 * Clicking a column opens that scan. The columns are not keyboard stops: the table below lists
 * the same scans as links.
 *
 * @param {{ scans: import('@/types/api').Scan[] }} props completed discoveries, oldest first
 */
export function ScanTrendChart({ scans }) {
  const openScan = useOpenScan();
  const scale = Math.max(
    1,
    ...scans.map((scan) => Math.max(scan.summary.devicesFound, scan.summary.missingDevices)),
  );
  const maxMissing = Math.max(0, ...scans.map((scan) => scan.summary.missingDevices));
  const px = (count) => Math.round((count / scale) * PLOT_HEIGHT);
  const first = scans[0];
  const last = scans.at(-1);

  return (
    <GlassPanel as="figure" aria-labelledby="scan-trend-title">
      <PanelHeader
        title={<span id="scan-trend-title">Devices per scan</span>}
        description={`The last ${scans.length} completed network scans`}
        actions={<Legend />}
        className="flex-wrap"
      />
      <figcaption className="sr-only">
        Devices found per scan, from {formatDateTime(first.startedAt)} to{' '}
        {formatDateTime(last.startedAt)}: between{' '}
        {Math.min(...scans.map((scan) => scan.summary.devicesFound))} and{' '}
        {Math.max(...scans.map((scan) => scan.summary.devicesFound))} devices. The table below lists
        the same scans.
      </figcaption>

      <div className="px-5 pb-4" aria-hidden="true">
        <div className="flex gap-1">
          <span className="w-6 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
            {scale}
          </span>
          <div className="flex min-w-0 flex-1 items-stretch gap-[3px]">
            {scans.map((scan) => {
              const { devicesFound, newDevices, missingDevices } = scan.summary;
              return (
                <Tooltip key={scan.id}>
                  <TooltipTrigger asChild>
                    <div
                      data-testid="trend-column"
                      onClick={(event) => openScan(event, scan.id)}
                      className="group flex min-w-0 flex-1 cursor-pointer flex-col"
                    >
                      <div className="flex flex-col justify-end" style={{ height: PLOT_HEIGHT }}>
                        <div
                          className="w-full rounded-t-sm bg-neon-magenta transition-opacity group-hover:opacity-80"
                          style={{ height: px(Math.min(newDevices, devicesFound)) }}
                        />
                        <div
                          className="w-full bg-primary/80 shadow-[0_0_10px_-4px_var(--primary)] transition-opacity group-hover:opacity-80"
                          style={{ height: px(devicesFound - Math.min(newDevices, devicesFound)) }}
                        />
                      </div>
                      <div className="h-px bg-border" />
                      {maxMissing > 0 && (
                        <div style={{ height: px(maxMissing) }}>
                          <div
                            className="w-full rounded-b-sm bg-muted-foreground/40 transition-opacity group-hover:opacity-80"
                            style={{ height: px(missingDevices) }}
                          />
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{describe(scan)}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
        <div className="mt-1.5 flex justify-between pl-7 text-[10px] text-muted-foreground">
          <span>{formatDateTime(first.startedAt)}</span>
          {scans.length > 1 && <span>{formatDateTime(last.startedAt)}</span>}
        </div>
      </div>
    </GlassPanel>
  );
}
