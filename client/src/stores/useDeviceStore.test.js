import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/apiClient';
import * as deviceService from '@/services/deviceService';
import { makeDevice, makeInventory } from '@/test/fixtures';
import { resetDeviceStore, useDeviceStore } from './useDeviceStore';

vi.mock('@/services/deviceService', () => ({
  listDevices: vi.fn(),
  discoverDevices: vi.fn(),
}));

const store = () => useDeviceStore.getState();
const failure = (code = 'DATABASE_UNAVAILABLE') =>
  new ApiError('The database is unavailable.', { status: 503, code });

beforeEach(() => {
  vi.clearAllMocks();
  resetDeviceStore();
});

describe('fetchDevices', () => {
  it('loads and normalizes the inventory', async () => {
    const inventory = makeInventory();
    deviceService.listDevices.mockResolvedValue(inventory);

    const pending = store().fetchDevices();
    expect(store().status).toBe('loading');
    await pending;

    expect(store()).toMatchObject({ status: 'success', network: inventory.network, error: null });
    expect(store().ids).toEqual(inventory.devices.map((device) => device.id));
    expect(store().byId[inventory.devices[0].id]).toEqual(inventory.devices[0]);
  });

  it('reports an error on the first load', async () => {
    deviceService.listDevices.mockRejectedValue(failure());

    await store().fetchDevices();

    expect(store()).toMatchObject({ status: 'error', error: { code: 'DATABASE_UNAVAILABLE' } });
  });

  it('keeps showing data when a refresh fails', async () => {
    deviceService.listDevices.mockResolvedValueOnce(makeInventory());
    await store().fetchDevices();
    deviceService.listDevices.mockRejectedValueOnce(failure());

    await store().fetchDevices();

    expect(store().status).toBe('success');
    expect(store().ids).toHaveLength(4);
    expect(store().error).toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
  });
});

describe('discoverNetwork', () => {
  it('runs discovery, records IP changes, then reloads the full inventory', async () => {
    const moved = makeDevice({ id: 'pi', ipAddress: '192.168.1.21' });
    deviceService.discoverDevices.mockResolvedValue({
      scan: { id: 'scan-2' },
      summary: { devicesFound: 1, newDevices: 0, ipChanges: 1, wentOffline: 0, unresolvedHosts: 0 },
      network: { sweptRange: '192.168.1.0/24' },
      devices: [{ ...moved, isNew: false, previousIpAddress: '192.168.1.20' }],
    });
    deviceService.listDevices.mockResolvedValue({ ...makeInventory(), devices: [moved] });

    const result = await store().discoverNetwork();

    expect(result.summary.ipChanges).toBe(1);
    expect(store().discovery).toMatchObject({ status: 'success', summary: { ipChanges: 1 } });
    expect(store().recentIpChanges).toEqual({ pi: '192.168.1.20' });
    expect(deviceService.listDevices).toHaveBeenCalledTimes(1);
    expect(store().ids).toEqual(['pi']);
  });

  it('records and rethrows failures', async () => {
    deviceService.discoverDevices.mockRejectedValue(failure('NETWORK_UNAVAILABLE'));

    await expect(store().discoverNetwork()).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    expect(store().discovery).toMatchObject({
      status: 'error',
      error: { code: 'NETWORK_UNAVAILABLE' },
    });
    expect(deviceService.listDevices).not.toHaveBeenCalled();
  });

  it('ignores a second request while one is running', async () => {
    let finish;
    deviceService.discoverDevices.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    deviceService.listDevices.mockResolvedValue(makeInventory());

    const first = store().discoverNetwork();
    await expect(store().discoverNetwork()).resolves.toBeNull();
    expect(deviceService.discoverDevices).toHaveBeenCalledTimes(1);

    finish({ scan: { id: 'scan-3' }, summary: {}, network: {}, devices: [] });
    await first;
  });
});
