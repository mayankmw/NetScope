import { EventTypes } from '@netscope/shared/events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/apiClient';
import * as scanService from '@/services/scanService';
import { DEVICE_ID, makeScan } from '@/test/fixtures';
import { resetScanHistoryStore, SCAN_PAGE_SIZE, useScanHistoryStore } from './useScanHistoryStore';

vi.mock('@/services/scanService', () => ({ listScans: vi.fn() }));

const store = () => useScanHistoryStore.getState();
const NETWORK_SCANS = { type: 'discovery', status: 'all', deviceId: null };
const PORT_SCANS = { type: 'port', status: 'all', deviceId: DEVICE_ID };
const scan = (id, extra) => makeScan({ id, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  resetScanHistoryStore();
  scanService.listScans.mockResolvedValue({ items: [scan('b'), scan('a')], nextCursor: 'a' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('open', () => {
  it('loads the first page of the filtered list', async () => {
    const pending = store().open(NETWORK_SCANS);
    expect(store()).toMatchObject({ status: 'loading', key: 'all' });
    await pending;

    expect(scanService.listScans).toHaveBeenCalledWith({
      type: 'discovery',
      status: undefined,
      deviceId: undefined,
      limit: SCAN_PAGE_SIZE,
      signal: expect.any(AbortSignal),
    });
    expect(store()).toMatchObject({ status: 'success', nextCursor: 'a' });
    expect(store().items.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('drops the answer for filters that are no longer shown', async () => {
    let resolveFirst;
    scanService.listScans.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
    const first = store().open(NETWORK_SCANS);
    scanService.listScans.mockResolvedValueOnce({ items: [scan('p')], nextCursor: null });
    await store().open(PORT_SCANS);

    resolveFirst({ items: [scan('stale')], nextCursor: null });
    await first;

    expect(store().items.map((item) => item.id)).toEqual(['p']);
    expect(store().filters).toEqual(PORT_SCANS);
  });

  it('shows an error, and retries on refresh', async () => {
    scanService.listScans.mockRejectedValueOnce(
      new ApiError('The database is unavailable.', { status: 503, code: 'DATABASE_UNAVAILABLE' }),
    );
    await store().open(NETWORK_SCANS);
    expect(store()).toMatchObject({ status: 'error', error: { code: 'DATABASE_UNAVAILABLE' } });

    await store().refresh();
    expect(store().status).toBe('success');
  });
});

describe('loadMore', () => {
  it('appends the next page, and keeps the list when it fails', async () => {
    await store().open(NETWORK_SCANS);
    scanService.listScans.mockResolvedValueOnce({ items: [scan('older')], nextCursor: null });

    await store().loadMore();
    expect(scanService.listScans).toHaveBeenLastCalledWith(
      expect.objectContaining({ before: 'a' }),
    );
    expect(store().items.map((item) => item.id)).toEqual(['b', 'a', 'older']);
    expect(store().nextCursor).toBeNull();

    useScanHistoryStore.setState({ nextCursor: 'older' });
    scanService.listScans.mockRejectedValueOnce(new ApiError('Down', { code: 'NETWORK_ERROR' }));
    await store().loadMore();
    expect(store()).toMatchObject({ isLoadingMore: false, moreError: { code: 'NETWORK_ERROR' } });
    expect(store().items).toHaveLength(3);
  });
});

describe('real-time events', () => {
  it('turns a burst of scan events into one refresh, with the new scan on top', async () => {
    vi.useFakeTimers();
    await store().open(NETWORK_SCANS);
    scanService.listScans.mockResolvedValueOnce({
      items: [scan('c'), scan('b')],
      nextCursor: 'b',
    });

    store().applyEvent({ type: EventTypes.DISCOVERY_STARTED, data: { scanId: 'c' } });
    store().applyEvent({ type: EventTypes.DISCOVERY_COMPLETED, data: { scanId: 'c' } });
    await vi.runAllTimersAsync();

    expect(scanService.listScans).toHaveBeenCalledTimes(2);
    expect(store().items.map((item) => item.id)).toEqual(['c', 'b', 'a']);
    expect(store().nextCursor).toBe('a');
  });

  it('ignores scans of another type or device, and stops once the page is closed', async () => {
    vi.useFakeTimers();
    await store().open(PORT_SCANS);

    store().applyEvent({ type: EventTypes.DISCOVERY_COMPLETED, data: { scanId: 'x' } });
    store().applyEvent({
      type: EventTypes.PORT_SCAN_COMPLETED,
      data: { scanId: 'y', deviceId: 'another-device' },
    });
    await vi.runAllTimersAsync();
    expect(scanService.listScans).toHaveBeenCalledTimes(1);

    store().close();
    store().applyEvent({
      type: EventTypes.PORT_SCAN_COMPLETED,
      data: { scanId: 'z', deviceId: DEVICE_ID },
    });
    await vi.runAllTimersAsync();
    expect(scanService.listScans).toHaveBeenCalledTimes(1);
    expect(store().items).toHaveLength(2); // the data is kept for the next visit
  });
});
