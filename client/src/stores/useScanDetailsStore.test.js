import { EventTypes } from '@netscope/shared/events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/apiClient';
import * as scanService from '@/services/scanService';
import { makeScanDetails, NETWORK, SCAN_ID } from '@/test/fixtures';
import { resetScanDetailsStore, useScanDetailsStore } from './useScanDetailsStore';

vi.mock('@/services/scanService', () => ({ getScan: vi.fn() }));

const store = () => useScanDetailsStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  resetScanDetailsStore();
  scanService.getScan.mockResolvedValue(makeScanDetails());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useScanDetailsStore', () => {
  it('loads a scan', async () => {
    await store().open(SCAN_ID);

    expect(scanService.getScan).toHaveBeenCalledWith(SCAN_ID, { signal: expect.any(AbortSignal) });
    expect(store()).toMatchObject({ scanId: SCAN_ID, status: 'success', error: null });
    expect(store().data.scan.id).toBe(SCAN_ID);
  });

  it('reports an unknown scan as not found', async () => {
    scanService.getScan.mockRejectedValue(
      new ApiError('Scan not found.', { status: 404, code: 'NOT_FOUND' }),
    );
    await store().open(SCAN_ID);
    expect(store().status).toBe('not-found');
  });

  it('reloads when the shown scan finishes', async () => {
    vi.useFakeTimers();
    scanService.getScan.mockResolvedValueOnce(
      makeScanDetails({ scan: { status: 'running', summary: null }, results: null }),
    );
    await store().open(SCAN_ID);
    expect(store().data.scan.status).toBe('running');

    store().applyEvent({
      type: EventTypes.DISCOVERY_COMPLETED,
      data: { scanId: SCAN_ID, networkId: NETWORK.id },
    });
    await vi.runAllTimersAsync();

    expect(scanService.getScan).toHaveBeenCalledTimes(2);
    expect(store().data.scan.status).toBe('completed');
  });

  it('reloads when a newer scan of the same network finishes, to link to it', async () => {
    vi.useFakeTimers();
    await store().open(SCAN_ID);

    store().applyEvent({ type: EventTypes.PORT_SCAN_COMPLETED, data: { scanId: 'p' } });
    store().applyEvent({
      type: EventTypes.DISCOVERY_COMPLETED,
      data: { scanId: 'other', networkId: 'another-network' },
    });
    store().applyEvent({ type: EventTypes.DEVICE_ONLINE, data: { networkId: NETWORK.id } });
    await vi.runAllTimersAsync();
    expect(scanService.getScan).toHaveBeenCalledTimes(1);

    store().applyEvent({
      type: EventTypes.DISCOVERY_COMPLETED,
      data: { scanId: 'newer', networkId: NETWORK.id },
    });
    await vi.runAllTimersAsync();
    expect(scanService.getScan).toHaveBeenCalledTimes(2);
  });

  it('keeps the last data when a background refresh fails', async () => {
    await store().open(SCAN_ID);
    scanService.getScan.mockRejectedValueOnce(new ApiError('Down', { code: 'NETWORK_ERROR' }));

    await store().refresh();

    expect(store()).toMatchObject({ status: 'success', error: { code: 'NETWORK_ERROR' } });
    expect(store().data).not.toBeNull();
  });
});
