import { describe, expect, it } from 'vitest';
import { makeDeviceHistory } from '@/test/fixtures';
import { presenceSegments, presenceStats } from './presence';

const HOUR = 60 * 60 * 1000;

describe('presenceSegments', () => {
  it('splits the range into periods, after a stretch before the device was first seen', () => {
    const history = makeDeviceHistory();
    const segments = presenceSegments(history);

    expect(segments.map((segment) => segment.status)).toEqual([
      'unknown',
      'online',
      'offline',
      'online',
    ]);
    expect(segments.at(-1).ongoing).toBe(true);
    // Shares of the 30-day range, end to end.
    const total = segments.reduce((sum, segment) => sum + segment.width, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(segments[2].width).toBeCloseTo((3 * HOUR) / (30 * 24 * HOUR), 6);
    expect(segments[1].offset).toBeCloseTo(segments[0].width, 6);
  });

  it('cuts a period that began before the range', () => {
    const history = makeDeviceHistory();
    history.firstSeenAt = new Date(Date.parse(history.range.from) - 10 * HOUR).toISOString();
    history.periods = [{ status: 'offline', from: history.range.from, to: null, scanId: null }];

    expect(presenceSegments(history)).toEqual([
      expect.objectContaining({ status: 'offline', offset: 0, width: 1, ongoing: true }),
    ]);
  });
});

describe('presenceStats', () => {
  it('counts scans, times it went offline, and the longest offline period', () => {
    expect(presenceStats(makeDeviceHistory())).toEqual({
      scans: 3,
      seen: 2,
      wentOffline: 1,
      longestOfflineMs: 3 * HOUR,
    });
  });

  it('does not count an offline period that began before the range', () => {
    const history = makeDeviceHistory();
    history.periods[1] = { ...history.periods[1], scanId: null };
    expect(presenceStats(history).wentOffline).toBe(0);
  });
});
