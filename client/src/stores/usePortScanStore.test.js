import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/apiClient';
import * as deviceService from '@/services/deviceService';
import { DEVICE_ID, makeDevicePorts, makePortScan, makeScannedPorts } from '@/test/fixtures';
import { resetPortScanStore, usePortScanStore } from './usePortScanStore';

vi.mock('@/services/deviceService', () => ({
  getDevicePorts: vi.fn(),
  startPortScan: vi.fn(),
}));

const store = () => usePortScanStore.getState();
const entry = () => store().byDevice[DEVICE_ID];
const running = makePortScan({
  id: 'scan-2',
  status: 'running',
  finishedAt: null,
  durationMs: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetPortScanStore();
  deviceService.getDevicePorts.mockResolvedValue(makeDevicePorts());
  deviceService.startPortScan.mockResolvedValue({ scan: running });
});

describe('loadPorts', () => {
  it("loads a device's ports", async () => {
    deviceService.getDevicePorts.mockResolvedValue(makeScannedPorts());

    const pending = store().loadPorts(DEVICE_ID);
    expect(entry().status).toBe('loading');
    await pending;

    expect(entry()).toMatchObject({ status: 'success', error: null });
    expect(entry().data.results.ports).toHaveLength(3);
  });

  it('keeps the data shown when a reload fails', async () => {
    await store().loadPorts(DEVICE_ID);
    deviceService.getDevicePorts.mockRejectedValueOnce(
      new ApiError('The database is unavailable.', { status: 503, code: 'DATABASE_UNAVAILABLE' }),
    );

    await store().loadPorts(DEVICE_ID);

    expect(entry()).toMatchObject({ status: 'success', error: { code: 'DATABASE_UNAVAILABLE' } });
  });
});

describe('startScan', () => {
  it('starts a scan, marks it active and as started here, and shows it running', async () => {
    await store().loadPorts(DEVICE_ID);

    const pending = store().startScan(DEVICE_ID);
    expect(entry().isStarting).toBe(true);
    await pending;

    expect(deviceService.startPortScan).toHaveBeenCalledWith(DEVICE_ID);
    expect(store().active).toEqual({
      scanId: 'scan-2',
      deviceId: DEVICE_ID,
      startedAt: running.startedAt,
    });
    expect(store().isLocalScan('scan-2')).toBe(true);
    expect(entry()).toMatchObject({ isStarting: false, data: { scan: { status: 'running' } } });
  });

  it('keeps the reason when the server refuses', async () => {
    deviceService.startPortScan.mockRejectedValue(
      new ApiError('A scan is already running.', { status: 409, code: 'SCAN_IN_PROGRESS' }),
    );

    await expect(store().startScan(DEVICE_ID)).rejects.toMatchObject({ code: 'SCAN_IN_PROGRESS' });

    expect(entry()).toMatchObject({ isStarting: false, startError: { code: 'SCAN_IN_PROGRESS' } });
    expect(store().active).toBeNull();
  });
});

describe('real-time events', () => {
  const event = (type, data) => store().applyEvent({ type, data });

  it('tracks a scan started anywhere, and shows it on a loaded device', async () => {
    await store().loadPorts(DEVICE_ID);

    event('portscan.started', {
      scanId: 'scan-9',
      deviceId: DEVICE_ID,
      ipAddress: '192.168.1.21',
      startedAt: running.startedAt,
      triggeredBy: 'manual',
    });

    expect(store().active).toMatchObject({ scanId: 'scan-9', deviceId: DEVICE_ID });
    expect(entry().data.scan).toMatchObject({ id: 'scan-9', status: 'running' });
  });

  it('clears the active scan when it ends, and reloads that device', async () => {
    await store().loadPorts(DEVICE_ID);
    event('portscan.started', {
      scanId: 'scan-9',
      deviceId: DEVICE_ID,
      startedAt: running.startedAt,
    });
    deviceService.getDevicePorts.mockClear();
    deviceService.getDevicePorts.mockResolvedValue(makeScannedPorts());

    event('portscan.completed', { scanId: 'scan-9', deviceId: DEVICE_ID, summary: {} });

    expect(store().active).toBeNull();
    expect(deviceService.getDevicePorts).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(entry().data.results).not.toBeNull());
  });

  it('does not load devices that are not shown', () => {
    event('portscan.failed', { scanId: 'scan-9', deviceId: 'elsewhere', error: {} });

    expect(deviceService.getDevicePorts).not.toHaveBeenCalled();
  });

  it('learns about a running scan on connect, and clears a stale one', () => {
    event('system.connected', {
      activePortScan: { scanId: 'scan-9', deviceId: DEVICE_ID, startedAt: running.startedAt },
    });
    expect(store().active).toMatchObject({ scanId: 'scan-9' });

    event('system.connected', { activePortScan: null });
    expect(store().active).toBeNull();
  });
});
