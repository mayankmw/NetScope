import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/services/apiClient';
import * as deviceService from '@/services/deviceService';
import * as healthService from '@/services/healthService';
import { resetDeviceStore } from '@/stores/useDeviceStore';
import { makeInventory } from '@/test/fixtures';
import { DashboardPage } from './DashboardPage';
import { DevicesPage } from './DevicesPage';

vi.mock('@/services/deviceService', () => ({ listDevices: vi.fn(), discoverDevices: vi.fn() }));
vi.mock('@/services/healthService', () => ({ getHealth: vi.fn() }));

function renderPage(page, url = '/devices') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <TooltipProvider>{page}</TooltipProvider>
    </MemoryRouter>,
  );
}

const rows = () => screen.getAllByRole('row').slice(1); // skip the header row

beforeEach(() => {
  vi.clearAllMocks();
  resetDeviceStore();
  healthService.getHealth.mockResolvedValue({
    status: 'ok',
    service: 'netscope-server',
    version: '0.1.0',
    environment: 'test',
    uptimeSeconds: 60,
    timestamp: new Date().toISOString(),
    checks: { api: { status: 'up' }, database: { status: 'up', latencyMs: 1 } },
  });
});

describe('DevicesPage', () => {
  it('shows a skeleton while loading', () => {
    deviceService.listDevices.mockReturnValue(new Promise(() => {}));

    renderPage(<DevicesPage />);

    expect(screen.getByLabelText('Loading devices')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an error with a working retry', async () => {
    deviceService.listDevices
      .mockRejectedValueOnce(
        new ApiError('The database is unavailable.', { status: 503, code: 'DATABASE_UNAVAILABLE' }),
      )
      .mockResolvedValueOnce(makeInventory());

    renderPage(<DevicesPage />);

    expect(await screen.findByText('Could not load devices')).toBeInTheDocument();
    expect(screen.getByText(/DATABASE_UNAVAILABLE/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('raspberrypi.lan')).toBeInTheDocument();
  });

  it('invites a first discovery when no network has been scanned', async () => {
    deviceService.listDevices.mockResolvedValue({ network: null, devices: [] });

    renderPage(<DevicesPage />);

    expect(await screen.findByText('No devices yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discover network/i })).toBeEnabled();
  });

  it('lists every device with its details', async () => {
    deviceService.listDevices.mockResolvedValue(makeInventory());

    renderPage(<DevicesPage />);

    await screen.findByText('raspberrypi.lan');
    expect(rows()).toHaveLength(4);
    const gateway = rows()[0];
    expect(within(gateway).getByText('192.168.1.1')).toBeInTheDocument();
    expect(within(gateway).getByText('Gateway')).toBeInTheDocument();
    expect(within(gateway).getByText('Router')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('Offline')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('Private')).toBeInTheDocument();
    expect(within(rows()[3]).getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Showing 4 of 4 devices')).toBeInTheDocument();
  });

  it('filters by search and status, and explains when nothing matches', async () => {
    const user = userEvent.setup();
    deviceService.listDevices.mockResolvedValue(makeInventory());
    renderPage(<DevicesPage />);
    await screen.findByText('raspberrypi.lan');

    await user.type(screen.getByRole('searchbox', { name: 'Search devices' }), 'raspberry');
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Showing 1 of 4 devices')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /offline/i }));
    expect(await screen.findByText('No devices match')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /clear filters/i })[0]);
    expect(rows()).toHaveLength(4);
  });

  it('sorts when a column header is clicked', async () => {
    const user = userEvent.setup();
    deviceService.listDevices.mockResolvedValue(makeInventory());
    renderPage(<DevicesPage />);
    await screen.findByText('raspberrypi.lan');

    const ipHeader = screen.getByRole('columnheader', { name: /ip address/i });
    expect(ipHeader).toHaveAttribute('aria-sort', 'ascending');

    await user.click(within(ipHeader).getByRole('button'));
    expect(ipHeader).toHaveAttribute('aria-sort', 'descending');
    expect(within(rows()[0]).getByText('192.168.1.100')).toBeInTheDocument();
  });

  it('runs a discovery from the empty state and shows what it found', async () => {
    const user = userEvent.setup();
    let finishDiscovery;
    deviceService.listDevices
      .mockResolvedValueOnce({ network: null, devices: [] })
      .mockResolvedValueOnce(makeInventory());
    deviceService.discoverDevices.mockReturnValue(
      new Promise((resolve) => {
        finishDiscovery = resolve;
      }),
    );
    renderPage(<DevicesPage />);

    await user.click(await screen.findByRole('button', { name: /discover network/i }));
    expect(screen.getByRole('button', { name: /scanning/i })).toBeDisabled();

    finishDiscovery({
      summary: { devicesFound: 4, newDevices: 4, ipChanges: 0, wentOffline: 0, unresolvedHosts: 0 },
      network: { sweptRange: '192.168.1.0/24' },
      devices: [],
    });

    expect(await screen.findByText('raspberrypi.lan')).toBeInTheDocument();
    expect(deviceService.discoverDevices).toHaveBeenCalledTimes(1);
    expect(deviceService.listDevices).toHaveBeenCalledTimes(2);
  });

  it('applies filters from the URL', async () => {
    deviceService.listDevices.mockResolvedValue(makeInventory());

    renderPage(<DevicesPage />, '/devices?status=offline');

    await screen.findByText('pixel-8');
    expect(rows()).toHaveLength(1);
  });
});

describe('DashboardPage', () => {
  it('shows headline numbers that link to filtered device views', async () => {
    deviceService.listDevices.mockResolvedValue(makeInventory());

    renderPage(<DashboardPage />, '/');

    const online = await screen.findByRole('link', { name: 'Online: 3' });
    expect(online).toHaveAttribute('href', '/devices?status=online');
    expect(screen.getByRole('link', { name: 'Devices: 4' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Offline: 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New (24 h): 1' })).toBeInTheDocument();
    expect(screen.getByText('Recently discovered')).toBeInTheDocument();
  });

  it('invites a first discovery on a fresh install', async () => {
    deviceService.listDevices.mockResolvedValue({ network: null, devices: [] });

    renderPage(<DashboardPage />, '/');

    expect(await screen.findByText('Map your network')).toBeInTheDocument();
  });
});
