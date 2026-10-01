import { describe, expect, it } from 'vitest';
import { makeDevicePorts, makePortScan } from '@/test/fixtures';
import { portScanState, serviceDescription } from './portScan';

const state = (overrides) =>
  portScanState({
    data: null,
    isStarting: false,
    activeDeviceId: null,
    deviceId: 'd1',
    ...overrides,
  });

describe('portScanState', () => {
  it('is "ready" before the first scan', () => {
    expect(state({ data: makeDevicePorts() })).toBe('ready');
  });

  it('is "scanning" while starting, while this device is the active scan, or while its scan runs', () => {
    expect(state({ data: makeDevicePorts(), isStarting: true })).toBe('scanning');
    expect(state({ data: makeDevicePorts(), activeDeviceId: 'd1' })).toBe('scanning');
    expect(state({ data: makeDevicePorts({ scan: makePortScan({ status: 'running' }) }) })).toBe(
      'scanning',
    );
  });

  it('is not "scanning" because another device is being scanned', () => {
    expect(state({ data: makeDevicePorts(), activeDeviceId: 'd2' })).toBe('ready');
  });

  it('follows the latest scan once it is over', () => {
    expect(state({ data: makeDevicePorts({ scan: makePortScan() }) })).toBe('completed');
    expect(state({ data: makeDevicePorts({ scan: makePortScan({ status: 'failed' }) }) })).toBe(
      'failed',
    );
    expect(state({ data: makeDevicePorts({ scan: makePortScan({ status: 'cancelled' }) }) })).toBe(
      'failed',
    );
  });
});

describe('serviceDescription', () => {
  it('joins product and version when known', () => {
    expect(serviceDescription({ product: 'OpenSSH', version: '9.2p1' })).toBe('OpenSSH 9.2p1');
    expect(serviceDescription({ product: 'nginx', version: null })).toBe('nginx');
    expect(serviceDescription({ product: null, version: null })).toBeNull();
  });
});
