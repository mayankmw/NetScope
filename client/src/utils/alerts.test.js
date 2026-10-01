import { describe, expect, it } from 'vitest';
import { DEVICE_ID, makeAlert } from '@/test/fixtures';
import {
  alertFiltersKey,
  matchesAlertFilters,
  parseAlertFilters,
  summarizeAlerts,
  toAlertQuery,
  toAlertSearchParams,
  withStatus,
} from './alerts';

const filters = (overrides) => ({ status: 'open', type: 'all', deviceId: null, ...overrides });

describe('alert filters', () => {
  it('reads filters from the URL, falling back to open alerts of any type', () => {
    expect(parseAlertFilters(new URLSearchParams())).toEqual(filters());
    expect(
      parseAlertFilters(new URLSearchParams(`status=resolved&type=ip_changed&device=${DEVICE_ID}`)),
    ).toEqual({ status: 'resolved', type: 'ip_changed', deviceId: DEVICE_ID });
    expect(parseAlertFilters(new URLSearchParams('status=done&type=port&device=7'))).toEqual(
      filters(),
    );
  });

  it('writes only what differs from the defaults, and builds the API query', () => {
    expect(toAlertSearchParams(filters()).toString()).toBe('');
    expect(alertFiltersKey(filters())).toBe('open');
    expect(toAlertSearchParams(filters({ status: 'all', deviceId: DEVICE_ID })).toString()).toBe(
      `status=all&device=${DEVICE_ID}`,
    );
    expect(toAlertQuery(filters({ status: 'all' }))).toEqual({
      status: undefined,
      type: undefined,
      deviceId: undefined,
    });
    expect(toAlertQuery(filters({ type: 'new_device' }))).toEqual({
      status: 'open',
      type: 'new_device',
      deviceId: undefined,
    });
  });

  it('tells whether an alert belongs in a filtered list', () => {
    const alert = makeAlert();
    expect(matchesAlertFilters(alert, filters())).toBe(true);
    expect(matchesAlertFilters({ ...alert, status: 'resolved' }, filters())).toBe(false);
    expect(matchesAlertFilters(alert, filters({ status: 'resolved' }))).toBe(false);
    expect(matchesAlertFilters(alert, filters({ status: 'all' }))).toBe(true);
    expect(matchesAlertFilters(alert, filters({ type: 'ip_changed' }))).toBe(false);
    expect(matchesAlertFilters(alert, filters({ deviceId: 'other' }))).toBe(false);
  });
});

describe('withStatus', () => {
  const at = '2026-10-01T12:00:00.000Z';

  it('keeps read and resolved times consistent with the state', () => {
    const read = withStatus(makeAlert(), 'read', at);
    expect(read).toMatchObject({ status: 'read', readAt: at, resolvedAt: null });
    expect(withStatus(read, 'resolved', 'later')).toMatchObject({
      readAt: at,
      resolvedAt: 'later',
    });
    expect(withStatus(read, 'unread', at)).toMatchObject({ readAt: null, resolvedAt: null });
  });
});

describe('summarizeAlerts', () => {
  it('counts a burst by type', () => {
    const alerts = [
      makeAlert(),
      makeAlert({ type: 'new_device' }),
      makeAlert({ type: 'device_returned' }),
      makeAlert({ type: 'ip_changed' }),
    ];
    expect(summarizeAlerts(alerts)).toBe('2 new devices · 1 back online · 1 IP change');
  });
});
