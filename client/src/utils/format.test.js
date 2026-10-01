import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatElapsed,
  formatInterval,
  formatLatency,
  formatPercent,
  formatRelativeTime,
} from './format';
import { compareIp } from './ip';

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();

  it('says "just now" for the last 45 seconds', () => {
    expect(formatRelativeTime(ago(10_000), now)).toBe('just now');
  });

  it('uses the largest sensible unit', () => {
    expect(formatRelativeTime(ago(5 * 60_000), now)).toMatch(/5 min/);
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toMatch(/3 hr/);
    expect(formatRelativeTime(ago(2 * 86_400_000), now)).toMatch(/2 days ago/);
  });
});

describe('formatDuration', () => {
  it('shows the two most significant units', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(3_725)).toBe('1h 2m');
  });
});

describe('compareIp', () => {
  it('orders numerically, not lexically', () => {
    expect(['10.0.0.10', '10.0.0.9', '9.1.1.1'].sort(compareIp)).toEqual([
      '9.1.1.1',
      '10.0.0.9',
      '10.0.0.10',
    ]);
  });
});

describe('formatLatency', () => {
  it.each([
    [0.4, '<1 ms'],
    [4.25, '4.3 ms'],
    [48.6, '49 ms'],
  ])('%s → %s', (ms, expected) => {
    expect(formatLatency(ms)).toBe(expected);
  });
});

describe('formatPercent', () => {
  it('rounds, but never shows a partial share as 100%', () => {
    expect(formatPercent(11, 12)).toBe('92%');
    expect(formatPercent(199, 200)).toBe('99%');
    expect(formatPercent(12, 12)).toBe('100%');
    expect(formatPercent(0, 0)).toBe('—');
  });
});

describe('formatElapsed', () => {
  it('is precise for short runs and switches to units for long ones', () => {
    expect(formatElapsed(850)).toBe('850 ms');
    expect(formatElapsed(1_234)).toBe('1.2 s');
    expect(formatElapsed(48_400)).toBe('48 s');
    expect(formatElapsed(125_000)).toBe('2m 5s');
  });
});

describe('formatInterval', () => {
  it('uses the largest whole unit', () => {
    expect(formatInterval(86_400_000)).toBe('1 day');
    expect(formatInterval(2 * 86_400_000)).toBe('2 days');
    expect(formatInterval(36 * 3_600_000)).toBe('36 hours');
    expect(formatInterval(90 * 60_000)).toBe('90 minutes');
    expect(formatInterval(0)).toBe('0 seconds');
  });
});
