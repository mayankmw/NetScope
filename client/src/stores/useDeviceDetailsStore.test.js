import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/apiClient';
import * as deviceService from '@/services/deviceService';
import {
  DEVICE_ID,
  makeDeviceDetails,
  makeDeviceHistory,
  makeObservation,
  makeTimeline,
  NETWORK,
} from '@/test/fixtures';
import {
  mergeNewestPage,
  resetDeviceDetailsStore,
  useDeviceDetailsStore,
} from './useDeviceDetailsStore';

vi.mock('@/services/deviceService', () => ({
  getDevice: vi.fn(),
  listDeviceEvents: vi.fn(),
  listDeviceObservations: vi.fn(),
  getDeviceHistory: vi.fn(),
}));

const store = () => useDeviceDetailsStore.getState();
const notFound = () =>
  new ApiError('Device not found.', {
    status: 404,
    code: 'NOT_FOUND',
    details: { deviceId: DEVICE_ID },
  });
const unavailable = () =>
  new ApiError('The database is unavailable.', { status: 503, code: 'DATABASE_UNAVAILABLE' });
const later = (iso, ms = 1000) => new Date(new Date(iso).getTime() + ms).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  resetDeviceDetailsStore();
  deviceService.getDevice.mockResolvedValue(makeDeviceDetails());
  deviceService.listDeviceEvents.mockResolvedValue({ items: makeTimeline(), nextCursor: null });
  deviceService.listDeviceObservations.mockResolvedValue({
    items: [makeObservation({ id: '2' })],
    nextCursor: '2',
  });
  deviceService.getDeviceHistory.mockResolvedValue(makeDeviceHistory());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('open', () => {
  it('loads the device, its timeline, and its discovery history', async () => {
    const pending = store().open(DEVICE_ID);
    expect(store()).toMatchObject({ deviceId: DEVICE_ID, status: 'loading' });
    await pending;

    expect(store()).toMatchObject({ status: 'success', error: null });
    expect(store().details.device.id).toBe(DEVICE_ID);
    expect(store().events).toMatchObject({ status: 'success', nextCursor: null });
    expect(store().events.items.map((event) => event.type)).toEqual([
      'updated',
      'online',
      'offline',
      'discovered',
    ]);
    expect(store().observations).toMatchObject({ status: 'success', nextCursor: '2' });
  });

  it('reports an unknown device as not found', async () => {
    deviceService.getDevice.mockRejectedValue(notFound());

    await store().open(DEVICE_ID);

    expect(store()).toMatchObject({ status: 'not-found', details: null });
  });

  it('reports other failures as errors, and retries on refresh', async () => {
    deviceService.getDevice.mockRejectedValueOnce(unavailable());

    await store().open(DEVICE_ID);
    expect(store()).toMatchObject({ status: 'error', error: { code: 'DATABASE_UNAVAILABLE' } });

    await store().refresh();
    expect(store().status).toBe('success');
  });

  it('ignores a second open of the device that is loading', async () => {
    const first = store().open(DEVICE_ID);
    store().open(DEVICE_ID);
    await first;

    expect(deviceService.getDevice).toHaveBeenCalledTimes(1);
  });

  it('drops a response for a device that is no longer shown', async () => {
    let finishFirst;
    deviceService.getDevice.mockReturnValueOnce(
      new Promise((resolve) => {
        finishFirst = resolve;
      }),
    );
    const first = store().open('other-device');
    await store().open(DEVICE_ID);

    finishFirst(makeDeviceDetails({ device: { id: 'other-device' } }));
    await first;

    expect(store().details.device.id).toBe(DEVICE_ID);
  });
});

describe('histories', () => {
  it('appends the next page and remembers its cursor', async () => {
    await store().open(DEVICE_ID);
    deviceService.listDeviceObservations.mockResolvedValueOnce({
      items: [makeObservation({ id: '1' })],
      nextCursor: null,
    });

    await store().loadMore('observations');

    expect(deviceService.listDeviceObservations).toHaveBeenLastCalledWith(DEVICE_ID, {
      limit: 20,
      before: '2',
      signal: expect.any(AbortSignal),
    });
    expect(store().observations.items.map((item) => item.id)).toEqual(['2', '1']);
    expect(store().observations.nextCursor).toBeNull();
  });

  it('keeps the loaded entries when "load more" fails', async () => {
    await store().open(DEVICE_ID);
    deviceService.listDeviceObservations.mockRejectedValueOnce(unavailable());

    await store().loadMore('observations');

    expect(store().observations).toMatchObject({
      status: 'success',
      isLoadingMore: false,
      moreError: { code: 'DATABASE_UNAVAILABLE' },
    });
    expect(store().observations.items).toHaveLength(1);
  });

  it('shows an error for a history whose first page failed, and retries it alone', async () => {
    deviceService.listDeviceEvents.mockRejectedValueOnce(unavailable());
    await store().open(DEVICE_ID);
    expect(store().status).toBe('success');
    expect(store().events).toMatchObject({
      status: 'error',
      error: { code: 'DATABASE_UNAVAILABLE' },
    });

    await store().retryHistory('events');

    expect(store().events.status).toBe('success');
    expect(deviceService.getDevice).toHaveBeenCalledTimes(1);
  });
});

describe('presence history', () => {
  it('loads with the device, for the last 30 days', async () => {
    await store().open(DEVICE_ID);

    expect(deviceService.getDeviceHistory).toHaveBeenCalledWith(DEVICE_ID, {
      days: 30,
      signal: expect.any(AbortSignal),
    });
    expect(store().presenceHistory).toMatchObject({ status: 'success', days: 30 });
    expect(store().presenceHistory.data.periods).toHaveLength(3);
  });

  it('reloads only the presence when the period changes, and keeps it for the next device', async () => {
    await store().open(DEVICE_ID);
    deviceService.getDeviceHistory.mockResolvedValueOnce(
      makeDeviceHistory({ range: { ...makeDeviceHistory().range, days: 7 } }),
    );

    const pending = store().setPresenceDays(7);
    expect(store().presenceHistory).toMatchObject({ status: 'loading', days: 7, data: null });
    await pending;

    expect(deviceService.getDeviceHistory).toHaveBeenLastCalledWith(DEVICE_ID, {
      days: 7,
      signal: expect.any(AbortSignal),
    });
    expect(store().presenceHistory.data.range.days).toBe(7);
    expect(deviceService.getDevice).toHaveBeenCalledTimes(1);

    store().close();
    await store().open('another-device');
    expect(deviceService.getDeviceHistory).toHaveBeenLastCalledWith('another-device', {
      days: 7,
      signal: expect.any(AbortSignal),
    });
  });

  it('shows an error on its own, and retries it alone', async () => {
    deviceService.getDeviceHistory.mockRejectedValueOnce(unavailable());
    await store().open(DEVICE_ID);
    expect(store().status).toBe('success');
    expect(store().presenceHistory).toMatchObject({
      status: 'error',
      error: { code: 'DATABASE_UNAVAILABLE' },
    });

    await store().retryPresence();
    expect(store().presenceHistory.status).toBe('success');
    expect(deviceService.getDevice).toHaveBeenCalledTimes(1);
  });
});

describe('mergeNewestPage', () => {
  const page = (ids, nextCursor = null) => ({ items: ids.map((id) => ({ id })), nextCursor });

  it('puts new entries on top of the pages already loaded', () => {
    expect(mergeNewestPage(page(['5', '4', '3', '2', '1']), page(['7', '6', '5'], '5'))).toEqual(
      page(['7', '6', '5', '4', '3', '2', '1']),
    );
  });

  it('starts over when the fresh page does not reach the loaded entries', () => {
    expect(mergeNewestPage(page(['2', '1']), page(['9', '8', '7'], '7'))).toEqual(
      page(['9', '8', '7'], '7'),
    );
  });
});

describe('real-time events', () => {
  beforeEach(async () => {
    await store().open(DEVICE_ID);
    vi.clearAllMocks();
  });

  const device = () => store().details.device;

  it('applies a change to the shown device at once, then refreshes its history', async () => {
    vi.useFakeTimers();
    store().applyEvent({
      type: 'device.offline',
      data: {
        networkId: NETWORK.id,
        device: { ...device(), status: 'offline', updatedAt: later(device().updatedAt) },
      },
    });

    expect(device().status).toBe('offline');
    expect(store().changedAt).toEqual(expect.any(Number));
    expect(deviceService.getDevice).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(deviceService.getDevice).toHaveBeenCalledTimes(1);
    expect(deviceService.listDeviceEvents).toHaveBeenCalledTimes(1);
  });

  it('turns a burst of events into a single refresh', async () => {
    vi.useFakeTimers();
    const update = (status, ms) =>
      store().applyEvent({
        type: `device.${status}`,
        data: {
          networkId: NETWORK.id,
          device: { ...device(), status, updatedAt: later(device().updatedAt, ms) },
        },
      });

    update('offline', 1000);
    update('online', 2000);
    store().applyEvent({
      type: 'discovery.completed',
      data: {
        scanId: 'scan-9',
        networkId: NETWORK.id,
        finishedAt: new Date().toISOString(),
        seenDeviceIds: [DEVICE_ID],
      },
    });
    await vi.runAllTimersAsync();

    expect(deviceService.getDevice).toHaveBeenCalledTimes(1);
  });

  it('ignores events about other devices and events older than its data', () => {
    const before = device();
    store().applyEvent({
      type: 'device.offline',
      data: { networkId: NETWORK.id, device: { ...before, id: 'someone-else', status: 'offline' } },
    });
    store().applyEvent({
      type: 'device.offline',
      data: {
        networkId: NETWORK.id,
        device: { ...before, status: 'offline', updatedAt: later(before.updatedAt, -60_000) },
      },
    });

    expect(device()).toEqual(before);
    expect(store().changedAt).toBeNull();
  });

  it('marks the device as seen by a completed discovery', () => {
    const finishedAt = new Date().toISOString();

    store().applyEvent({
      type: 'discovery.completed',
      data: { scanId: 'scan-9', networkId: NETWORK.id, finishedAt, seenDeviceIds: [DEVICE_ID] },
    });

    expect(device()).toMatchObject({ status: 'online', lastSeenAt: finishedAt });
    expect(store().details.network.lastScan).toEqual({ id: 'scan-9', finishedAt });
  });

  it('stops refreshing once the page is closed, but keeps the data', async () => {
    vi.useFakeTimers();
    store().close();
    store().applyEvent({
      type: 'device.offline',
      data: {
        networkId: NETWORK.id,
        device: { ...device(), status: 'offline', updatedAt: later(device().updatedAt) },
      },
    });
    await vi.runAllTimersAsync();

    expect(deviceService.getDevice).not.toHaveBeenCalled();
    expect(store()).toMatchObject({
      status: 'success',
      details: { device: { status: 'offline' } },
    });
  });

  it('refreshes in the background when the same device is opened again', async () => {
    store().close();

    const pending = store().open(DEVICE_ID);
    expect(store()).toMatchObject({ status: 'success', isRefreshing: true });
    await pending;

    expect(deviceService.getDevice).toHaveBeenCalledTimes(1);
    expect(store().isRefreshing).toBe(false);
  });
});
