import { describe, expect, it } from 'vitest';
import { classifyDevice, deriveAlerts, formatAbsence } from '../../src/services/alertRules.js';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-01T12:00:00.000Z');

/** An upserted row as upsertDiscoveredDevice returns it: a known Pi, seen an hour ago. */
const row = (overrides = {}) => ({
  id: 'pi',
  mac_address: 'b8:27:eb:12:34:56',
  mac_is_random: false,
  ip_address: '192.168.1.20',
  hostname: 'raspberrypi.lan',
  display_name: null,
  vendor: 'Raspberry Pi Foundation',
  device_type: 'computer',
  status: 'online',
  is_new: false,
  previous_ip_address: '192.168.1.20',
  previous_status: 'online',
  previous_last_seen_at: new Date(now - HOUR),
  ...overrides,
});

const derive = (rows, overrides = {}) =>
  deriveAlerts({
    networkId: 'net',
    scanId: 'scan',
    upserted: rows,
    gatewayMac: 'a4:83:e7:00:01:01',
    selfMac: 'da:a1:19:00:00:37',
    isBaseline: false,
    returnAfterMs: 24 * HOUR,
    now,
    ...overrides,
  });

describe('classifyDevice', () => {
  it('tells new, returned, moved, and known devices apart', () => {
    expect(classifyDevice(row({ is_new: true, previous_ip_address: null }))).toBe('new');
    expect(classifyDevice(row({ previous_status: 'offline' }))).toBe('returned');
    expect(classifyDevice(row({ previous_status: 'offline', ip_address: '192.168.1.21' }))).toBe(
      'returned',
    );
    expect(classifyDevice(row({ ip_address: '192.168.1.21' }))).toBe('ip_changed');
    expect(classifyDevice(row())).toBe('known');
  });
});

describe('deriveAlerts', () => {
  it('raises a warning for a device never seen on the network', () => {
    const alerts = derive([
      row({ is_new: true, previous_ip_address: null, previous_status: null, hostname: null }),
    ]);

    expect(alerts).toEqual([
      {
        networkId: 'net',
        deviceId: 'pi',
        scanId: 'scan',
        type: 'new_device',
        severity: 'warning',
        dedupKey: 'new_device:pi',
        message:
          'New device on the network: Raspberry Pi Foundation device at 192.168.1.20 (MAC b8:27:eb:12:34:56).',
        context: {
          ipAddress: '192.168.1.20',
          macAddress: 'b8:27:eb:12:34:56',
          macIsRandom: false,
          hostname: null,
          vendor: 'Raspberry Pi Foundation',
          deviceType: 'computer',
        },
      },
    ]);
  });

  it('raises nothing for the baseline scan of a network, or for this computer', () => {
    const newRow = row({ is_new: true, previous_ip_address: null });
    expect(derive([newRow], { isBaseline: true })).toEqual([]);
    expect(derive([{ ...newRow, mac_address: 'da:a1:19:00:00:37' }])).toEqual([]);
  });

  it('raises nothing for a known device that did not change', () => {
    expect(derive([row()])).toEqual([]);
  });

  it('reports a device back after a long absence, but not after a short one', () => {
    const back = row({
      previous_status: 'offline',
      previous_last_seen_at: new Date(now - 72 * HOUR),
    });
    expect(derive([back])).toEqual([
      expect.objectContaining({
        type: 'device_returned',
        severity: 'info',
        dedupKey: 'device_returned:pi',
        message: 'raspberrypi.lan is back online at 192.168.1.20 after 3 days away.',
        context: expect.objectContaining({ absentMs: 72 * HOUR, previousIpAddress: null }),
      }),
    ]);

    const brief = row({
      previous_status: 'offline',
      previous_last_seen_at: new Date(now - 2 * HOUR),
    });
    expect(derive([brief])).toEqual([]);
  });

  it('reports one alert for a device back at a new address after a long absence', () => {
    const alerts = derive([
      row({
        previous_status: 'offline',
        previous_last_seen_at: new Date(now - 30 * HOUR),
        ip_address: '192.168.1.21',
      }),
    ]);
    expect(alerts.map((alert) => alert.type)).toEqual(['device_returned']);
    expect(alerts[0].message).toBe(
      'raspberrypi.lan is back online at 192.168.1.21 after 30 hours away (it was at 192.168.1.20).',
    );
  });

  it('reports an address change, also after a short absence', () => {
    expect(derive([row({ ip_address: '192.168.1.21' })])).toEqual([
      expect.objectContaining({
        type: 'ip_changed',
        severity: 'info',
        dedupKey: 'ip_changed:pi',
        message: 'raspberrypi.lan moved from 192.168.1.20 to 192.168.1.21.',
        context: expect.objectContaining({
          ipAddress: '192.168.1.21',
          previousIpAddress: '192.168.1.20',
        }),
      }),
    ]);
    const brief = row({
      previous_status: 'offline',
      previous_last_seen_at: new Date(now - HOUR),
      ip_address: '192.168.1.21',
    });
    expect(derive([brief]).map((alert) => alert.type)).toEqual(['ip_changed']);
  });

  it('names the gateway and unnamed devices', () => {
    const [alert] = derive([
      row({
        mac_address: 'a4:83:e7:00:01:01',
        hostname: null,
        vendor: null,
        ip_address: '192.168.1.2',
      }),
    ]);
    expect(alert.message).toBe('The gateway moved from 192.168.1.20 to 192.168.1.2.');
  });
});

describe('formatAbsence', () => {
  it('uses the largest sensible unit', () => {
    expect(formatAbsence(3 * 24 * HOUR + HOUR)).toBe('3 days');
    expect(formatAbsence(30 * HOUR)).toBe('30 hours');
    expect(formatAbsence(90 * 60_000)).toBe('90 minutes');
    expect(formatAbsence(10_000)).toBe('1 minute');
  });
});
