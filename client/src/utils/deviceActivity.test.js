import { describe, expect, it } from 'vitest';
import { makeDeviceEvent } from '@/test/fixtures';
import { describeDeviceEvent } from './deviceActivity';

const updated = (changes) => describeDeviceEvent(makeDeviceEvent({ type: 'updated', changes }));

describe('describeDeviceEvent', () => {
  it.each([
    ['discovered', 'First discovered'],
    ['online', 'Came online'],
    ['offline', 'Went offline'],
  ])('describes %s', (type, title) => {
    expect(describeDeviceEvent(makeDeviceEvent({ type }))).toEqual({ title, changes: [] });
  });

  it('describes an IP change with both addresses', () => {
    expect(updated({ ipAddress: { from: '192.168.1.20', to: '192.168.1.21' } })).toEqual({
      title: 'IP address changed',
      changes: [
        { field: 'ipAddress', label: 'IP address', from: '192.168.1.20', to: '192.168.1.21' },
      ],
    });
  });

  it('says "identified" when a value was unknown before', () => {
    expect(updated({ hostname: { from: null, to: 'pi.lan' } }).title).toBe('Hostname identified');
    expect(updated({ deviceType: { from: 'unknown', to: 'printer' } })).toMatchObject({
      title: 'Device type identified',
      changes: [{ from: 'Unknown', to: 'Printer' }],
    });
    expect(updated({ vendor: { from: 'Old Co.', to: 'New Co.' } }).title).toBe('Vendor changed');
  });

  it('counts several changes in one event', () => {
    const { title, changes } = updated({
      ipAddress: { from: '192.168.1.20', to: '192.168.1.21' },
      hostname: { from: 'a.lan', to: 'b.lan' },
    });

    expect(title).toBe('2 details changed');
    expect(changes.map((change) => change.label)).toEqual(['IP address', 'Hostname']);
  });
});
