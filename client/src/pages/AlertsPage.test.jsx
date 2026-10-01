import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertsBell } from '@/components/alerts/AlertsBell';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { TooltipProvider } from '@/components/ui/tooltip';
import * as alertService from '@/services/alertService';
import { ApiError } from '@/services/apiClient';
import { resetAlertStore, useAlertStore } from '@/stores/useAlertStore';
import { resetDeviceStore } from '@/stores/useDeviceStore';
import { ALERT_ID, ALERT_POLICY, DEVICE_ID, makeAlert } from '@/test/fixtures';
import { AlertsPage } from './AlertsPage';

vi.mock('@/services/alertService', () => ({
  listAlerts: vi.fn(),
  getAlertSummary: vi.fn(),
  updateAlertStatus: vi.fn(),
  markAllAlertsRead: vi.fn(),
  resolveAllAlerts: vi.fn(),
}));

function renderAt(url = '/alerts', element = <AlertsPage />) {
  const router = createMemoryRouter(
    [
      { path: '/alerts', element },
      { path: '/devices/:deviceId', element: <p>Device page</p> },
      { path: '/scans/:scanId', element: <p>Scan page</p> },
    ],
    { initialEntries: [url] },
  );
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  return router;
}

/** Unread new device, read IP change (twice), resolved return. */
function alerts() {
  return [
    makeAlert(),
    makeAlert({
      id: 'c0ffee00-0000-4000-8000-000000000002',
      type: 'ip_changed',
      severity: 'info',
      status: 'read',
      message: 'raspberrypi.lan moved from 192.168.1.20 to 192.168.1.21.',
      occurrences: 2,
      readAt: new Date().toISOString(),
    }),
    makeAlert({
      id: 'c0ffee00-0000-4000-8000-000000000003',
      type: 'device_returned',
      severity: 'info',
      status: 'resolved',
      message: 'pixel-8 is back online at 192.168.1.9 after 3 days away.',
      readAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
    }),
  ];
}

const items = () => within(screen.getByRole('list', { name: 'Alerts' })).getAllByRole('listitem');

beforeEach(() => {
  vi.clearAllMocks();
  resetAlertStore();
  resetDeviceStore();
  useAlertStore.setState({
    counts: { unread: 1, read: 1, resolved: 1 },
    policy: ALERT_POLICY,
    summaryStatus: 'success',
  });
  alertService.listAlerts.mockResolvedValue({ items: alerts(), nextCursor: null });
});

describe('AlertsPage', () => {
  it('lists open alerts by default, newest first, with what happened', async () => {
    renderAt();

    expect(
      await screen.findByText(/New device on the network: raspberrypi\.lan/),
    ).toBeInTheDocument();
    expect(alertService.listAlerts).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open' }),
    );
    const [unread, read, resolved] = items();
    expect(
      within(unread).getByRole('heading', { name: 'New device (unread)' }),
    ).toBeInTheDocument();
    expect(within(unread).getByRole('link', { name: 'Open device' })).toHaveAttribute(
      'href',
      `/devices/${DEVICE_ID}`,
    );
    expect(
      within(read).getByRole('heading', { name: 'IP address changed (read)' }),
    ).toBeInTheDocument();
    expect(read).toHaveTextContent(/2 times since/);
    expect(
      within(resolved).getByRole('button', { name: 'Reopen: Back online' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Alerts' }).parentElement,
    ).toHaveTextContent('1 unread · 2 open');
  });

  it('explains which changes raise alerts, with the server settings', async () => {
    renderAt();
    const rules = (await screen.findByRole('heading', { name: 'How alerts work' })).closest(
      'section',
    );

    expect(rules).toHaveTextContent('A MAC address never seen on this network');
    expect(rules).toHaveTextContent('at least 1 day away');
    expect(rules).toHaveTextContent('Seen again with nothing changed: no alert');
    expect(rules).toHaveTextContent('stays quiet for 1 day');
  });

  it('marks an alert read, and opening its device marks it read too', async () => {
    const user = userEvent.setup();
    alertService.updateAlertStatus.mockImplementation(async (id, status) =>
      makeAlert({ id, status, readAt: new Date().toISOString() }),
    );
    const router = renderAt();
    await screen.findAllByRole('listitem');

    await user.click(screen.getByRole('button', { name: 'Mark read: New device' }));
    expect(alertService.updateAlertStatus).toHaveBeenCalledWith(ALERT_ID, 'read');
    expect(
      within(items()[0]).getByRole('heading', { name: 'New device (read)' }),
    ).toBeInTheDocument();
    expect(useAlertStore.getState().counts.unread).toBe(0);

    await user.click(within(items()[0]).getByRole('button', { name: 'Mark unread: New device' }));
    await user.click(within(items()[0]).getByRole('link', { name: 'Open device' }));
    expect(alertService.updateAlertStatus).toHaveBeenLastCalledWith(ALERT_ID, 'read');
    expect(router.state.location.pathname).toBe(`/devices/${DEVICE_ID}`);
  });

  it('says so when a change is refused, and puts the alert back', async () => {
    const user = userEvent.setup();
    alertService.updateAlertStatus.mockRejectedValue(
      new ApiError('A newer open alert exists.', { status: 409, code: 'CONFLICT' }),
    );
    renderAt();
    await screen.findAllByRole('listitem');

    await user.click(screen.getByRole('button', { name: 'Reopen: Back online' }));

    expect(
      within(items()[2]).getByRole('button', { name: 'Reopen: Back online' }),
    ).toBeInTheDocument();
  });

  it('filters by state and type in the URL, and by device', async () => {
    const user = userEvent.setup();
    const router = renderAt(`/alerts?device=${DEVICE_ID}`);
    await screen.findAllByRole('listitem');
    expect(screen.getByText('Device: raspberrypi.lan')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /^Unread/ }));
    await user.click(screen.getByRole('radio', { name: 'New devices' }));
    expect(router.state.location.search).toBe(`?status=unread&type=new_device&device=${DEVICE_ID}`);
    expect(alertService.listAlerts).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'unread', type: 'new_device', deviceId: DEVICE_ID }),
    );

    await user.click(screen.getByRole('button', { name: /every device/i }));
    expect(router.state.location.search).toBe('?status=unread&type=new_device');
  });

  it('marks all read and resolves all', async () => {
    const user = userEvent.setup();
    alertService.markAllAlertsRead.mockResolvedValue({
      updated: 1,
      counts: { unread: 0, read: 2, resolved: 1 },
    });
    alertService.resolveAllAlerts.mockResolvedValue({
      updated: 2,
      counts: { unread: 0, read: 0, resolved: 3 },
    });
    renderAt();
    await screen.findAllByRole('listitem');

    await user.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(screen.getByRole('button', { name: /mark all read/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /resolve all/i }));
    expect(items().every((item) => item.dataset.status === 'resolved')).toBe(true);
    expect(screen.getByRole('button', { name: /resolve all/i })).toBeDisabled();
  });

  it('explains an empty inbox', async () => {
    alertService.listAlerts.mockResolvedValue({ items: [], nextCursor: null });
    renderAt();
    expect(await screen.findByText('No open alerts')).toBeInTheDocument();
  });
});

describe('navigation indicator', () => {
  it('shows the unread count on the bell and the Alerts link, live', async () => {
    renderAt(
      '/alerts',
      <>
        <AlertsBell />
        <SidebarNav />
      </>,
    );

    expect(screen.getByRole('link', { name: 'Alerts: 1 unread' })).toHaveAttribute(
      'href',
      '/alerts',
    );
    const navLink = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
      name: /Alerts/,
    });
    expect(navLink).toHaveTextContent('Alerts1, 1 unread');

    useAlertStore.getState().applyEvent({
      type: 'alert.created',
      data: { alert: makeAlert({ id: 'x' }), counts: { unread: 2, read: 1, resolved: 1 } },
    });
    expect(await screen.findByRole('link', { name: 'Alerts: 2 unread' })).toBeInTheDocument();

    // Nothing unread: no count anywhere.
    useAlertStore.setState({ counts: { unread: 0, read: 0, resolved: 3 } });
    expect(await screen.findAllByRole('link', { name: 'Alerts' })).toHaveLength(2);
  });
});
