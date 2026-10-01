import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { RelativeTime } from '@/components/common/RelativeTime';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOpenDevice } from '@/hooks/useOpenDevice';
import { cn } from '@/lib/utils';
import {
  DeviceName,
  DeviceTags,
  IpChangedMarker,
  MissingValue,
  PrivateMacTag,
} from './DeviceAttributes';
import { DeviceLink } from './DeviceLink';
import { DeviceStatusBadge } from './DeviceStatusBadge';
import { DeviceTypeLabel } from './DeviceTypeLabel';

const COLUMNS = [
  { label: 'Status', sort: 'status' },
  { label: 'IP address', sort: 'ip' },
  { label: 'MAC address' },
  { label: 'Hostname', sort: 'hostname' },
  { label: 'Vendor', sort: 'vendor' },
  { label: 'Type', sort: 'type' },
  { label: 'First seen', sort: 'firstSeen' },
  { label: 'Last seen', sort: 'lastSeen' },
];

function SortableHead({ column, sort, dir, onSort }) {
  if (!column.sort) {
    return (
      <TableHead className="text-xs text-muted-foreground uppercase">{column.label}</TableHead>
    );
  }
  const active = sort === column.sort;
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <TableHead aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(column.sort)}
        className={cn(
          '-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {column.label}
        <Icon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden="true" />
      </button>
    </TableHead>
  );
}

/**
 * Sortable device table (tablet and desktop). Sorting is controlled by the parent. A row opens
 * the device's details; its IP address is the keyboard-accessible link.
 * @param {{ devices: import('@/types/api').Device[], sort: string, dir: 'asc' | 'desc',
 *           onSort: (field: string) => void, now: number, ipChanges: Record<string, string>,
 *           changedAt: Record<string, number> }} props
 */
export function DeviceTable({ devices, sort, dir, onSort, now, ipChanges, changedAt = {} }) {
  const openDevice = useOpenDevice();
  return (
    <Table className="text-[13px]">
      <TableHeader className="bg-muted/20">
        <TableRow className="hover:bg-transparent">
          {COLUMNS.map((column) => (
            <SortableHead
              key={column.label}
              column={column}
              sort={sort}
              dir={dir}
              onSort={onSort}
            />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.map((device) => (
          <TableRow
            // A live change gives the row a new key: it re-mounts once and plays the highlight.
            key={`${device.id}:${changedAt[device.id] ?? 0}`}
            onClick={(event) => openDevice(event, device.id)}
            className={cn(
              changedAt[device.id] ? 'animate-live-highlight' : 'animate-in duration-300 fade-in-0',
              'cursor-pointer hover:bg-primary/[0.04]',
              device.status === 'offline' && 'text-muted-foreground',
            )}
          >
            <TableCell>
              <DeviceStatusBadge status={device.status} />
            </TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <DeviceLink
                  deviceId={device.id}
                  className="rounded-sm underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {device.ipAddress}
                </DeviceLink>
                <IpChangedMarker previousIp={ipChanges[device.id]} />
              </span>
            </TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-muted-foreground">{device.macAddress}</span>
                <PrivateMacTag device={device} />
              </span>
            </TableCell>
            <TableCell className="max-w-64">
              <span className="flex items-center gap-2">
                <DeviceName device={device} className="truncate font-medium text-foreground" />
                <DeviceTags device={device} now={now} />
              </span>
            </TableCell>
            <TableCell className="max-w-48 truncate" title={device.vendor ?? undefined}>
              {device.vendor ?? <MissingValue />}
            </TableCell>
            <TableCell>
              <DeviceTypeLabel type={device.deviceType} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              <RelativeTime value={device.firstSeenAt} now={now} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              <RelativeTime value={device.lastSeenAt} now={now} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
