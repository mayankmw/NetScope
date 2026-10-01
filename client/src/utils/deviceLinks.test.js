import { describe, expect, it } from 'vitest';
import { makeDevice } from '@/test/fixtures';
import { deviceTitle } from './deviceFilters';
import { backLink, deviceDetailsPath } from './deviceLinks';
import { isUuid } from './ids';

describe('deviceDetailsPath', () => {
  it('builds the details URL', () => {
    expect(deviceDetailsPath('8f2c1d3e-6b7a-4c9d-8e1f-2a3b4c5d6e7f')).toBe(
      '/devices/8f2c1d3e-6b7a-4c9d-8e1f-2a3b4c5d6e7f',
    );
  });
});

describe('backLink', () => {
  it('returns to the page the user came from', () => {
    expect(backLink('/devices?status=offline')).toEqual({
      to: '/devices?status=offline',
      label: 'Devices',
    });
    expect(backLink('/')).toEqual({ to: '/', label: 'Overview' });
    expect(backLink('/topology')).toEqual({ to: '/topology', label: 'Topology' });
    expect(backLink('/scans?type=port')).toEqual({ to: '/scans?type=port', label: 'Scans' });
    expect(backLink('/scans/abc')).toEqual({ to: '/scans/abc', label: 'Scan' });
    expect(backLink('/devices/abc')).toEqual({ to: '/devices/abc', label: 'Device' });
    expect(backLink('/settings')).toEqual({ to: '/settings', label: 'Back' });
  });

  it('can fall back to another page', () => {
    const scans = { to: '/scans', label: 'Scans' };
    expect(backLink(undefined, scans)).toBe(scans);
  });

  it.each([undefined, 'https://example.com', '//example.com/devices', 42])(
    'falls back to the device list for %s',
    (from) => {
      expect(backLink(from)).toEqual({ to: '/devices', label: 'Devices' });
    },
  );
});

describe('isUuid', () => {
  it('accepts UUIDs only', () => {
    expect(isUuid('8f2c1d3e-6b7a-4c9d-8e1f-2a3b4c5d6e7f')).toBe(true);
    expect(isUuid('not-a-device')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('deviceTitle', () => {
  it('prefers a name, then describes the device', () => {
    expect(deviceTitle(makeDevice({ displayName: 'Pi-hole', hostname: 'pi.lan' }))).toBe('Pi-hole');
    expect(deviceTitle(makeDevice({ hostname: 'pi.lan' }))).toBe('pi.lan');
    expect(deviceTitle(makeDevice({ isSelf: true }))).toBe('This computer');
    expect(deviceTitle(makeDevice({ isGateway: true }))).toBe('Gateway');
    expect(deviceTitle(makeDevice({ vendor: 'Espressif Inc.' }))).toBe('Espressif Inc. device');
    expect(deviceTitle(makeDevice())).toBe('Unknown device');
  });
});
