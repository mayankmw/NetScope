import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAlertAnnouncer } from './alertAnnouncer';

afterEach(() => {
  vi.useRealTimers();
});

describe('createAlertAnnouncer', () => {
  it('announces a burst of alerts once, then starts a new batch', () => {
    vi.useFakeTimers();
    const announce = vi.fn();
    const announcer = createAlertAnnouncer(announce, { windowMs: 500 });

    announcer.add({ id: 'a' });
    vi.advanceTimersByTime(300);
    announcer.add({ id: 'b' });
    expect(announce).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(announce).toHaveBeenCalledWith([{ id: 'a' }, { id: 'b' }]);

    announcer.add({ id: 'c' });
    vi.advanceTimersByTime(500);
    expect(announce).toHaveBeenLastCalledWith([{ id: 'c' }]);
  });

  it('drops pending alerts when cancelled', () => {
    vi.useFakeTimers();
    const announce = vi.fn();
    const announcer = createAlertAnnouncer(announce);
    announcer.add({ id: 'a' });
    announcer.cancel();
    vi.runAllTimers();
    expect(announce).not.toHaveBeenCalled();
  });
});
