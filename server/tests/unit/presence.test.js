import { describe, expect, it } from 'vitest';
import { buildPresencePeriods } from '../../src/services/presence.js';

const HOUR = 60 * 60 * 1000;
const to = new Date('2026-10-01T12:00:00.000Z');
const hoursAgo = (hours) => new Date(to.getTime() - hours * HOUR);
const from = hoursAgo(24);

let nextId = 1;
const event = (type, hours, scanId = `scan-${hours}`) => ({
  id: String(nextId++),
  type,
  occurred_at: hoursAgo(hours),
  scan_id: scanId,
});

const build = (events, overrides = {}) =>
  buildPresencePeriods({
    events,
    from,
    to,
    firstSeenAt: hoursAgo(100),
    currentStatus: 'online',
    ...overrides,
  });

describe('buildPresencePeriods', () => {
  it('turns status events into consecutive periods; the last one is ongoing', () => {
    expect(build([event('discovered', 20), event('offline', 10), event('online', 2)])).toEqual([
      { status: 'online', from: hoursAgo(20), to: hoursAgo(10), scanId: 'scan-20' },
      { status: 'offline', from: hoursAgo(10), to: hoursAgo(2), scanId: 'scan-10' },
      { status: 'online', from: hoursAgo(2), to: null, scanId: 'scan-2' },
    ]);
  });

  it('starts at the range with the status of the last event before it', () => {
    expect(build([event('offline', 30), event('online', 5)])).toEqual([
      { status: 'offline', from, to: hoursAgo(5), scanId: null },
      { status: 'online', from: hoursAgo(5), to: null, scanId: 'scan-5' },
    ]);
  });

  it('sorts events and ignores repeats of the same status', () => {
    expect(build([event('online', 4), event('discovered', 20)])).toEqual([
      { status: 'online', from: hoursAgo(20), to: null, scanId: 'scan-20' },
    ]);
  });

  it('lets a change at the same instant replace the period it would end', () => {
    const periods = build([event('offline', 30), event('online', 24), event('offline', 3)]);

    expect(periods).toEqual([
      { status: 'online', from, to: hoursAgo(3), scanId: 'scan-24' },
      { status: 'offline', from: hoursAgo(3), to: null, scanId: 'scan-3' },
    ]);
  });

  it('falls back to the current status for a device without a timeline', () => {
    expect(build([], { firstSeenAt: hoursAgo(6), currentStatus: 'offline' })).toEqual([
      { status: 'offline', from: hoursAgo(6), to: null, scanId: null },
    ]);
    expect(build([], { currentStatus: 'online' })).toEqual([
      { status: 'online', from, to: null, scanId: null },
    ]);
  });
});
