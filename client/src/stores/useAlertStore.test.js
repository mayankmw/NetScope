import { EventTypes } from '@netscope/shared/events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as alertService from '@/services/alertService';
import { ApiError } from '@/services/apiClient';
import { ALERT_POLICY, DEVICE_ID, makeAlert } from '@/test/fixtures';
import { resetAlertStore, useAlertStore } from './useAlertStore';

vi.mock('@/services/alertService', () => ({
  listAlerts: vi.fn(),
  getAlertSummary: vi.fn(),
  updateAlertStatus: vi.fn(),
  markAllAlertsRead: vi.fn(),
  resolveAllAlerts: vi.fn(),
}));

const store = () => useAlertStore.getState();
const OPEN = { status: 'open', type: 'all', deviceId: null };
const alert = (id, overrides) => makeAlert({ id, ...overrides });
const ids = (items) => items.map((item) => item.id);

beforeEach(() => {
  vi.clearAllMocks();
  resetAlertStore();
  alertService.getAlertSummary.mockResolvedValue({
    counts: { unread: 2, read: 1, resolved: 0 },
    policy: ALERT_POLICY,
  });
  alertService.listAlerts.mockResolvedValue({
    items: [alert('b'), alert('a', { status: 'read' })],
    nextCursor: 'a',
  });
});

describe('summary', () => {
  it('loads the counts and the rules', async () => {
    await store().loadSummary();
    expect(store()).toMatchObject({
      counts: { unread: 2, read: 1, resolved: 0 },
      policy: ALERT_POLICY,
      summaryStatus: 'success',
    });
  });
});

describe('list', () => {
  it('loads a filtered list and its next page', async () => {
    await store().openList(OPEN);

    expect(alertService.listAlerts).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open', type: undefined, limit: 25 }),
    );
    expect(store().list).toMatchObject({ status: 'success', nextCursor: 'a' });

    alertService.listAlerts.mockResolvedValueOnce({ items: [alert('older')], nextCursor: null });
    await store().loadMore();
    expect(ids(store().list.items)).toEqual(['b', 'a', 'older']);
    expect(alertService.listAlerts).toHaveBeenLastCalledWith(
      expect.objectContaining({ before: 'a' }),
    );
  });

  it('shows an error for a first page that failed', async () => {
    alertService.listAlerts.mockRejectedValueOnce(new ApiError('Down', { code: 'NETWORK_ERROR' }));
    await store().openList(OPEN);
    expect(store().list).toMatchObject({ status: 'error', error: { code: 'NETWORK_ERROR' } });
  });
});

describe('setStatus', () => {
  it('shows the new state and counts at once, then the saved alert', async () => {
    await store().loadSummary();
    await store().openList(OPEN);
    let resolve;
    alertService.updateAlertStatus.mockReturnValueOnce(new Promise((done) => (resolve = done)));

    const pending = store().setStatus(store().list.items[0], 'read');
    expect(store().list.items[0]).toMatchObject({ status: 'read', readAt: expect.any(String) });
    expect(store().counts).toEqual({ unread: 1, read: 2, resolved: 0 });
    expect(store().pending).toEqual({ b: true });

    resolve(alert('b', { status: 'read', readAt: 'saved' }));
    await pending;
    expect(store().list.items[0].readAt).toBe('saved');
    expect(store().pending).toEqual({});
  });

  it('undoes the change when the server refuses it', async () => {
    await store().loadSummary();
    await store().openList(OPEN);
    alertService.updateAlertStatus.mockRejectedValueOnce(
      new ApiError('Conflict', { status: 409, code: 'CONFLICT' }),
    );

    await expect(store().setStatus(store().list.items[0], 'resolved')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(store().list.items[0].status).toBe('unread');
    expect(store().counts).toEqual({ unread: 2, read: 1, resolved: 0 });
  });
});

describe('bulk actions', () => {
  it('marks every shown unread alert read, and resolves every open one', async () => {
    await store().openList(OPEN);
    alertService.markAllAlertsRead.mockResolvedValue({
      updated: 1,
      counts: { unread: 0, read: 2, resolved: 0 },
    });
    await store().markAllRead();
    expect(store().list.items.map((item) => item.status)).toEqual(['read', 'read']);
    expect(store().counts.unread).toBe(0);

    alertService.resolveAllAlerts.mockResolvedValue({
      updated: 2,
      counts: { unread: 0, read: 0, resolved: 2 },
    });
    await store().resolveAll();
    expect(store().list.items.map((item) => item.status)).toEqual(['resolved', 'resolved']);
  });
});

describe('real-time events', () => {
  const counts = { unread: 3, read: 1, resolved: 0 };

  it('adds a new alert to the lists it belongs in, and takes the counts', async () => {
    await store().openList(OPEN);
    alertService.listAlerts.mockResolvedValueOnce({ items: [], nextCursor: null });
    await store().openDevice(DEVICE_ID);

    const created = alert('c');
    store().applyEvent({ type: EventTypes.ALERT_CREATED, data: { alert: created, counts } });
    store().applyEvent({ type: EventTypes.ALERT_CREATED, data: { alert: created, counts } });

    expect(ids(store().list.items)).toEqual(['c', 'b', 'a']);
    expect(ids(store().device.items)).toEqual(['c']);
    expect(store().counts).toEqual(counts);
    expect(store().arrivedAt.c).toEqual(expect.any(Number));
  });

  it('leaves out an alert that does not match the filters', async () => {
    await store().openList({ ...OPEN, type: 'ip_changed' });
    store().applyEvent({ type: EventTypes.ALERT_CREATED, data: { alert: alert('c'), counts } });
    expect(ids(store().list.items)).toEqual(['b', 'a']);
  });

  it('replaces an alert that changed, and applies bulk changes', async () => {
    await store().openList(OPEN);

    store().applyEvent({
      type: EventTypes.ALERT_UPDATED,
      data: { alert: alert('b', { occurrences: 3 }), counts, reason: 'repeated' },
    });
    expect(store().list.items[0].occurrences).toBe(3);

    store().applyEvent({
      type: EventTypes.ALERTS_UPDATED,
      timestamp: '2026-10-01T12:00:00.000Z',
      data: { ids: ['a', 'b'], status: 'resolved', counts: { unread: 0, read: 0, resolved: 2 } },
    });
    expect(store().list.items.map((item) => item.status)).toEqual(['resolved', 'resolved']);
    expect(store().list.items[1].resolvedAt).toBe('2026-10-01T12:00:00.000Z');
    expect(store().counts).toEqual({ unread: 0, read: 0, resolved: 2 });
  });
});
