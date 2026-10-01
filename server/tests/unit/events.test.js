import { EventTypes } from '@netscope/shared/events';
import { describe, expect, it, vi } from 'vitest';
import { createEvent, EventBus } from '../../src/events/eventBus.js';
import { deriveDeviceEvents } from '../../src/services/deviceEvents.js';

describe('createEvent', () => {
  it('builds the shared envelope with a unique id', () => {
    const first = createEvent('device.updated', { a: 1 });
    const second = createEvent('device.updated', { a: 1 });

    expect(first).toEqual({
      v: 1,
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      type: 'device.updated',
      timestamp: expect.any(String),
      data: { a: 1 },
    });
    expect(first.id).not.toBe(second.id);
  });
});

describe('EventBus', () => {
  it('delivers each published event to every subscriber', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);

    const event = bus.publish('discovery.started', { scanId: 's1' });

    expect(a).toHaveBeenCalledWith(event);
    expect(b).toHaveBeenCalledWith(event);
  });

  it('isolates failing subscribers from the publisher and from each other', async () => {
    const bus = new EventBus();
    const healthy = vi.fn();
    bus.subscribe(() => {
      throw new Error('sync failure');
    });
    bus.subscribe(async () => {
      throw new Error('async failure');
    });
    bus.subscribe(healthy);

    expect(() => bus.publish('device.offline', {})).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setImmediate(resolve)); // let the rejection be handled
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    unsubscribe();
    bus.publish('device.online', {});

    expect(listener).not.toHaveBeenCalled();
    expect(bus.listenerCount).toBe(0);
  });
});

describe('deriveDeviceEvents', () => {
  const GATEWAY = 'a4:83:e7:00:01:01';
  const row = (overrides = {}) => ({
    id: 'd1',
    mac_address: 'b8:27:eb:12:34:56',
    mac_is_random: false,
    ip_address: '192.168.1.20',
    hostname: 'pi.lan',
    vendor: 'Raspberry Pi Foundation',
    device_type: 'computer',
    display_name: null,
    is_trusted: false,
    status: 'online',
    first_seen_at: new Date('2026-09-01T00:00:00Z'),
    last_seen_at: new Date('2026-09-30T00:00:00Z'),
    updated_at: new Date('2026-09-30T00:00:00Z'),
    is_new: false,
    previous_ip_address: '192.168.1.20',
    previous_hostname: 'pi.lan',
    previous_vendor: 'Raspberry Pi Foundation',
    previous_device_type: 'computer',
    previous_status: 'online',
    ...overrides,
  });
  const derive = (upserted, wentOffline = []) =>
    deriveDeviceEvents({ networkId: 'n1', gatewayMac: GATEWAY, upserted, wentOffline });
  const types = (events) => events.map((event) => event.type);

  it('reports a new device as device.discovered only', () => {
    const events = derive([
      row({ is_new: true, previous_ip_address: null, previous_status: null }),
    ]);

    expect(types(events)).toEqual([EventTypes.DEVICE_DISCOVERED]);
    expect(events[0].data).toEqual({
      networkId: 'n1',
      device: expect.objectContaining({ id: 'd1', ipAddress: '192.168.1.20', isGateway: false }),
    });
  });

  it('emits nothing for a device seen again unchanged', () => {
    expect(derive([row()])).toEqual([]);
  });

  it('reports changed fields with their previous values', () => {
    const [event] = derive([row({ previous_ip_address: '192.168.1.9', previous_hostname: null })]);

    expect(event.type).toBe(EventTypes.DEVICE_UPDATED);
    expect(event.data.changes).toEqual(['ipAddress', 'hostname']);
    expect(event.data.previous).toEqual({ ipAddress: '192.168.1.9', hostname: null });
  });

  it('reports a returning device as online, plus updated if it also changed', () => {
    expect(types(derive([row({ previous_status: 'offline' })]))).toEqual([
      EventTypes.DEVICE_ONLINE,
    ]);
    expect(
      types(derive([row({ previous_status: 'offline', previous_ip_address: '192.168.1.9' })])),
    ).toEqual([EventTypes.DEVICE_ONLINE, EventTypes.DEVICE_UPDATED]);
  });

  it('reports devices that went offline, flagging the gateway', () => {
    const events = derive([], [row({ id: 'gw', mac_address: GATEWAY, status: 'offline' })]);

    expect(types(events)).toEqual([EventTypes.DEVICE_OFFLINE]);
    expect(events[0].data.device).toMatchObject({ id: 'gw', status: 'offline', isGateway: true });
  });
});
