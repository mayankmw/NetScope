import { formatDateTime, formatRelativeTime } from '@/utils/format';

/**
 * "5 min. ago" with the exact local time on hover. Pass `now` from a shared useNow() so a long
 * list does not start one timer per row.
 */
export function RelativeTime({ value, now, className }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const date = new Date(value);
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)} className={className}>
      {formatRelativeTime(date, now)}
    </time>
  );
}
