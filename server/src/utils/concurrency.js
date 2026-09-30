/**
 * Runs `worker` over `items` with at most `limit` in flight. Resolves with results in input
 * order. Stops scheduling new items as soon as one worker throws or `signal` aborts, and
 * rejects with that error.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} worker
 * @param {AbortSignal} [signal]
 * @returns {Promise<R[]>}
 */
export async function mapWithConcurrency(items, limit, worker, signal) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let stopped = false;

  async function drain() {
    while (!stopped && nextIndex < items.length) {
      signal?.throwIfAborted();
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  }

  const lanes = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: lanes }, drain));
  return results;
}
