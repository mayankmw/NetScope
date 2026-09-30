import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../../src/utils/concurrency.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  it('preserves order and never exceeds the limit', async () => {
    let active = 0;
    let peak = 0;

    const results = await mapWithConcurrency([5, 1, 4, 2, 3], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(value);
      active -= 1;
      return value * 10;
    });

    expect(results).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });

  it('stops scheduling after a failure', async () => {
    const started = [];

    await expect(
      mapWithConcurrency([1, 2, 3, 4, 5], 1, async (value) => {
        started.push(value);
        if (value === 2) throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(started).toEqual([1, 2]);
  });

  it('stops when the signal aborts', async () => {
    const controller = new AbortController();

    await expect(
      mapWithConcurrency(
        [1, 2, 3],
        1,
        async (value) => {
          if (value === 1) controller.abort();
        },
        controller.signal,
      ),
    ).rejects.toThrow();
  });

  it('handles an empty list', async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });
});
