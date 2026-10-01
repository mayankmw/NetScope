import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as deviceService from '@/services/deviceService';
import { makeDevice, makeInventory, NETWORK } from '@/test/fixtures';
import { resetDeviceStore, useDeviceStore } from './useDeviceStore';

vi.mock('@/services/deviceService', () => ({
  listDevices: vi.fn(),
  discoverDevices: vi.fn(),
}));

const store = () => useDeviceStore.getState();
const ips = () => store().ids.map((id) => store().byId[id].ipAddress);
const apply = (type, data) => store().applyEvent({ v: 1, id: crypto.randomUUID(), type, data });
const later = (iso, ms = 1000) => new Date(new Date(iso).getTime() + ms).toISOString();

beforeEach(async () => {
  vi.clearAllMocks();
  resetDeviceStore();
  deviceService.listDevices.mockResolvedValue(makeInventory());
  await store().fetchDevices();
});

describe('device events', () => {
  it('adds a discovered device in IP order and marks it as changed', () => {
    const device = makeDevice({ id: 'new', ipAddress: '192.168.1.15' });

    apply('device.discovered', { networkId: NETWORK.id, device });

    expect(ips()).toEqual([
      '192.168.1.1',
      '192.168.1.9',
      '192.168.1.15',
      '192.168.1.20',
      '192.168.1.100',
    ]);
    expect(store().changedAt.new).toEqual(expect.any(Number));
  });

  it('replaces a device on update, re-sorting when its IP changed, and remembers the old IP', () => {
    const pi = store().byId['device-192.168.1.20'];
    const moved = {
      ...pi,
      ipAddress: '192.168.1.5',
      updatedAt: later(pi.updatedAt ?? pi.lastSeenAt),
    };

    apply('device.updated', {
      networkId: NETWORK.id,
      device: moved,
      changes: ['ipAddress'],
      previous: { ipAddress: '192.168.1.20' },
    });

    expect(ips()).toEqual(['192.168.1.1', '192.168.1.5', '192.168.1.9', '192.168.1.100']);
    expect(store().recentIpChanges[pi.id]).toBe('192.168.1.20');
  });

  it('applies status changes', () => {
    const phone = store().byId['device-192.168.1.9'];

    apply('device.online', { networkId: NETWORK.id, device: { ...phone, status: 'online' } });

    expect(store().byId[phone.id].status).toBe('online');
  });

  it('is idempotent: the same event twice leaves the same state', () => {
    const device = makeDevice({ id: 'twice', ipAddress: '192.168.1.50' });
    const data = { networkId: NETWORK.id, device };

    apply('device.discovered', data);
    apply('device.discovered', data);

    expect(store().ids.filter((id) => id === 'twice')).toHaveLength(1);
  });

  it('ignores an event older than the data it already has', () => {
    const pi = store().byId['device-192.168.1.20'];
    const fresh = { ...pi, hostname: 'fresh', updatedAt: '2026-09-30T12:00:00.000Z' };
    apply('device.updated', { networkId: NETWORK.id, device: fresh, changes: ['hostname'] });

    const stale = { ...pi, hostname: 'stale', updatedAt: '2026-09-30T11:00:00.000Z' };
    apply('device.updated', { networkId: NETWORK.id, device: stale, changes: ['hostname'] });

    expect(store().byId[pi.id].hostname).toBe('fresh');
  });

  it('ignores events for another network', () => {
    apply('device.discovered', {
      networkId: 'other-network',
      device: makeDevice({ id: 'elsewhere', ipAddress: '10.0.0.5' }),
    });

    expect(store().byId.elsewhere).toBeUndefined();
  });
});

describe('discovery events', () => {
  it('tracks a scan started elsewhere and its completion', () => {
    apply('discovery.started', { scanId: 'remote', networkId: NETWORK.id });
    expect(store().discovery).toMatchObject({ status: 'running', scanId: 'remote' });

    apply('discovery.completed', {
      scanId: 'remote',
      networkId: NETWORK.id,
      summary: { devicesFound: 1, newDevices: 0, ipChanges: 0, wentOffline: 0, unresolvedHosts: 0 },
      finishedAt: '2026-10-01T10:00:00.000Z',
      seenDeviceIds: ['device-192.168.1.9'],
    });

    expect(store().discovery).toMatchObject({ status: 'success', summary: { devicesFound: 1 } });
    expect(store().byId['device-192.168.1.9']).toMatchObject({
      status: 'online',
      lastSeenAt: '2026-10-01T10:00:00.000Z',
    });
    expect(store().network.lastScan).toEqual({
      id: 'remote',
      finishedAt: '2026-10-01T10:00:00.000Z',
    });
  });

  it('reloads the inventory when a scan completes on a different network', () => {
    deviceService.listDevices.mockClear();

    apply('discovery.completed', {
      scanId: 's',
      networkId: 'office-network',
      summary: {},
      finishedAt: new Date().toISOString(),
      seenDeviceIds: [],
    });

    expect(deviceService.listDevices).toHaveBeenCalledTimes(1);
  });

  it('records a failure', () => {
    apply('discovery.started', { scanId: 's', networkId: NETWORK.id });
    apply('discovery.failed', {
      scanId: 's',
      networkId: NETWORK.id,
      error: { code: 'SCAN_TIMEOUT', message: 'Too slow.' },
    });

    expect(store().discovery).toMatchObject({ status: 'error', error: { code: 'SCAN_TIMEOUT' } });
  });

  it('picks up a scan already running when connecting, and clears a stale one', () => {
    apply('system.connected', { activeDiscovery: { scanId: 'live', networkId: NETWORK.id } });
    expect(store().discovery).toMatchObject({ status: 'running', scanId: 'live' });

    apply('system.connected', { activeDiscovery: null });
    expect(store().discovery.status).toBe('idle');
  });
});
