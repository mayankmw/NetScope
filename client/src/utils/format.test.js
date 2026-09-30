import { describe, expect, it } from 'vitest';
import { formatDuration, formatRelativeTime } from './format';
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
