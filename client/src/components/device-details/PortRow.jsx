import { Sparkles } from 'lucide-react';
import { RelativeTime } from '@/components/common/RelativeTime';
import { Tag } from '@/components/common/Tag';
import { cn } from '@/lib/utils';
import { serviceDescription } from '@/utils/portScan';

/**
 * One port of a scan's results: number, service, product and version (or its state now that it
 * is no longer open), and since when it has been open. `showSince` is off where the dates would
 * describe today rather than the scan shown (a past scan's page).
 */
export function PortRow({ port, now, showSince = true }) {
  const open = port.state === 'open';
  const description = serviceDescription(port);
  const notOpen = showSince
    ? `Now ${port.state}`
    : `${port.state === 'closed' ? 'Closed' : 'No response'}; open in an earlier scan`;
  return (
    <li className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5 text-sm sm:grid-cols-[5rem_8rem_1fr_auto]">
      <span
        className={cn('font-mono tabular-nums', open ? 'text-primary' : 'text-muted-foreground')}
      >
        {port.port}/{port.protocol}
      </span>
      <span className={cn('truncate font-medium', !open && 'text-muted-foreground')}>
        {port.service ?? 'unknown'}
      </span>
      <span className="col-start-2 min-w-0 truncate text-xs text-muted-foreground sm:col-start-auto sm:text-sm">
        {open ? (description ?? 'Version not identified') : notOpen}
      </span>
      <span className="col-start-2 flex items-center gap-2 text-xs text-muted-foreground sm:col-start-auto sm:justify-end">
        {open && port.isNew && (
          <Tag tone="magenta" icon={Sparkles}>
            New
          </Tag>
        )}
        {showSince && (
          <span>
            {open ? 'open since ' : 'last open '}
            <RelativeTime value={open ? port.firstSeenOpenAt : port.lastSeenOpenAt} now={now} />
          </span>
        )}
      </span>
    </li>
  );
}
