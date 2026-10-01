import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/services/apiClient';
import * as deviceService from '@/services/deviceService';
import { resetDeviceDetailsStore } from '@/stores/useDeviceDetailsStore';
import { resetDeviceStore } from '@/stores/useDeviceStore';
import { resetPortScanStore, usePortScanStore } from '@/stores/usePortScanStore';
import {
  DEVICE_ID,
  makeDeviceDetails,
  makeDeviceHistory,
  makeDevice,
  makeDevicePorts,
  makeInventory,
  makeObservation,
  makePortScan,
  makeScannedPorts,
  makeTimeline,
} from '@/test/fixtures';
import { DeviceDetailsPage } from './DeviceDetailsPage';
import { DevicesPage } from './DevicesPage';

vi.mock('@/services/deviceService', () => ({
  listDevices: vi.fn(),
  discoverDevices: vi.fn(),
  getDevice: vi.fn(),
  listDeviceEvents: vi.fn(),
  listDeviceObservations: vi.fn(),
  getDevicePorts: vi.fn(),
  startPortScan: vi.fn(),
  getDeviceHistory: vi.fn(),
}));

function renderAt(url) {
  const router = createMemoryRouter(
    [
      { path: '/devices', element: <DevicesPage /> },
      { path: '/devices/:deviceId', element: <DeviceDetailsPage /> },
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

const panel = (name) => screen.getByRole('heading', { name }).closest('.glass-panel');

beforeEach(() => {
  vi.clearAllMocks();
  resetDeviceStore();
  resetDeviceDetailsStore();
  resetPortScanStore();
  deviceService.getDevice.mockResolvedValue(makeDeviceDetails());
  deviceService.getDevicePorts.mockResolvedValue(makeDevicePorts());
  deviceService.listDeviceEvents.mockResolvedValue({ items: makeTimeline(), nextCursor: null });
  deviceService.listDeviceObservations.mockResolvedValue({
    items: [makeObservation({ id: '2' })],
    nextCursor: '2',
  });
  deviceService.getDeviceHistory.mockResolvedValue(makeDeviceHistory());
});

describe('DeviceDetailsPage', () => {
  it('shows the device: status, identity, network, and timeline', async () => {
    renderAt(`/devices/${DEVICE_ID}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'raspberrypi.lan' }),
    ).toBeInTheDocument();
    expect(deviceService.getDevice).toHaveBeenCalledWith(DEVICE_ID, expect.anything());

    const status = panel('Status');
    expect(within(status).getByText('Online')).toBeInTheDocument();
    expect(within(status).getByText('92%')).toBeInTheDocument();
    expect(within(status).getByText('11 of 12 scans since first seen')).toBeInTheDocument();

    const identity = panel('Identity');
    expect(within(identity).getByText('b8:27:eb:12:34:56')).toBeInTheDocument();
    expect(within(identity).getByText('Raspberry Pi Foundation')).toBeInTheDocument();
    expect(within(identity).getByText('Computer')).toBeInTheDocument();

    const network = panel('Network');
    expect(within(network).getByText('192.168.1.20')).toBeInTheDocument(); // previous IP
    expect(within(network).getByText('Client')).toBeInTheDocument();
    expect(within(network).getByText('4.2 ms')).toBeInTheDocument();
    expect(within(network).getByText('Manufacturer prefix (OUI) b8:27:eb')).toBeInTheDocument();

    const timeline = screen.getByRole('list', { name: 'Device timeline' });
    expect([...timeline.children].map((entry) => entry.textContent)).toEqual([
      expect.stringContaining('IP address changed'),
      expect.stringContaining('Came online'),
      expect.stringContaining('Went offline'),
      expect.stringContaining('First discovered'),
    ]);

    expect(within(panel('Metadata')).getByText(DEVICE_ID)).toBeInTheDocument();
  });

  it('shows a placeholder while loading', () => {
    deviceService.getDevice.mockReturnValue(new Promise(() => {}));

    renderAt(`/devices/${DEVICE_ID}`);

    expect(screen.getByLabelText('Loading device')).toHaveAttribute('aria-busy', 'true');
  });

  it('says "not found" for a malformed id without asking the server', () => {
    renderAt('/devices/not-a-device');

    expect(screen.getByText('Device not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to devices' })).toHaveAttribute(
      'href',
      '/devices',
    );
    expect(deviceService.getDevice).not.toHaveBeenCalled();
  });

  it('says "not found" when the server does not know the device', async () => {
    deviceService.getDevice.mockRejectedValue(
      new ApiError('Device not found.', { status: 404, code: 'NOT_FOUND' }),
    );

    renderAt(`/devices/${DEVICE_ID}`);

    expect(await screen.findByText('Device not found')).toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    deviceService.getDevice
      .mockRejectedValueOnce(
        new ApiError('The database is unavailable.', { status: 503, code: 'DATABASE_UNAVAILABLE' }),
      )
      .mockResolvedValueOnce(makeDeviceDetails());

    renderAt(`/devices/${DEVICE_ID}`);

    expect(await screen.findByText('Could not load this device')).toBeInTheDocument();
    expect(screen.getByText(/DATABASE_UNAVAILABLE/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'raspberrypi.lan' }),
    ).toBeInTheDocument();
  });

  it('explains an empty timeline', async () => {
    deviceService.listDeviceEvents.mockResolvedValue({ items: [], nextCursor: null });

    renderAt(`/devices/${DEVICE_ID}`);

    expect(await screen.findByText('No activity yet')).toBeInTheDocument();
  });

  it('shows the discovery history and loads older scans', async () => {
    const user = userEvent.setup();
    deviceService.listDeviceObservations
      .mockResolvedValueOnce({ items: [makeObservation({ id: '2' })], nextCursor: '2' })
      .mockResolvedValueOnce({
        items: [makeObservation({ id: '1', ipAddress: '192.168.1.20', latencyMs: null })],
        nextCursor: null,
      });
    renderAt(`/devices/${DEVICE_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'raspberrypi.lan' });

    await user.click(screen.getByRole('radio', { name: 'Discovery history' }));
    const history = screen.getByRole('list', { name: 'Discovery history' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /load older scans/i }));

    expect(await within(history).findByText('no ping reply')).toBeInTheDocument();
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /load older scans/i })).not.toBeInTheDocument();
  });

  it('shows its presence history, and another period on request', async () => {
    const user = userEvent.setup();
    renderAt(`/devices/${DEVICE_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'raspberrypi.lan' });

    const presence = panel('Presence history');
    expect(presence).toHaveTextContent('Seen by 2 of 3 scans (67%)');
    expect(presence).toHaveTextContent('went offline 1 time · longest offline 3h 0m');
    expect(
      within(presence)
        .getAllByTestId('presence-segment')
        .map((segment) => segment.dataset.status),
    ).toEqual(['unknown', 'online', 'offline', 'online']);
    expect(
      within(presence)
        .getAllByTestId('presence-scan')
        .map((cell) => cell.dataset.seen),
    ).toEqual(['true', 'false', 'true']);
    const periods = within(presence).getByRole('list', { name: 'Online and offline periods' });
    expect(within(periods).getAllByRole('listitem')[0]).toHaveTextContent(
      /Online.*→ now \(2h 0m\)/,
    );

    await user.click(within(presence).getByRole('radio', { name: '7 days' }));
    expect(deviceService.getDeviceHistory).toHaveBeenLastCalledWith(DEVICE_ID, {
      days: 7,
      signal: expect.any(AbortSignal),
    });
  });

  it('links each scan of the discovery history to its page', async () => {
    const user = userEvent.setup();
    renderAt(`/devices/${DEVICE_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'raspberrypi.lan' });

    await user.click(screen.getByRole('radio', { name: 'Discovery history' }));
    const history = screen.getByRole('list', { name: 'Discovery history' });
    expect(within(history).getByRole('link', { name: /^Scan of / })).toHaveAttribute(
      'href',
      '/scans/scan-1',
    );
  });

  it("shows this computer's interface when the device is the NetScope host", async () => {
    deviceService.getDevice.mockResolvedValue(
      makeDeviceDetails({
        device: { hostname: null, vendor: null, isSelf: true },
        presence: { lastLatencyMs: null, averageLatencyMs: null, latencySamples: 0 },
        localInterface: {
          name: 'en0',
          macAddress: 'b8:27:eb:12:34:56',
          addresses: [{ family: 'IPv4', address: '192.168.1.21', cidr: '192.168.1.21/24' }],
        },
      }),
    );

    renderAt(`/devices/${DEVICE_ID}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'This computer' }),
    ).toBeInTheDocument();
    const network = panel('Network');
    expect(within(network).getByText('192.168.1.21/24')).toBeInTheDocument();
    expect(within(network).getByText('Not measured for this computer')).toBeInTheDocument();
  });
});

describe('from the device list', () => {
  it('opens a device from its row and links back to the filtered list', async () => {
    const user = userEvent.setup();
    const inventory = makeInventory();
    inventory.devices[2] = makeDevice({ ...inventory.devices[2], id: DEVICE_ID });
    deviceService.listDevices.mockResolvedValue(inventory);
    const router = renderAt('/devices?status=online');

    await user.click(await screen.findByText('Raspberry Pi Foundation'));

    expect(router.state.location.pathname).toBe(`/devices/${DEVICE_ID}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'raspberrypi.lan' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Devices' })).toHaveAttribute(
      'href',
      '/devices?status=online',
    );
  });

  it('opens a device from the keyboard through its IP address link', async () => {
    const user = userEvent.setup();
    deviceService.listDevices.mockResolvedValue(makeInventory());
    const router = renderAt('/devices');

    const link = await screen.findByRole('link', { name: '192.168.1.20' });
    link.focus();
    await user.keyboard('{Enter}');

    expect(router.state.location.pathname).toBe('/devices/device-192.168.1.20');
  });
});

describe('open ports panel', () => {
  const portsPanel = () => screen.getByRole('region', { name: 'Open ports' });
  const renderDevice = async () => {
    renderAt(`/devices/${DEVICE_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'raspberrypi.lan' });
  };

  it('is ready to scan a device that was never scanned', async () => {
    await renderDevice();

    const panel = portsPanel();
    expect(
      await within(panel).findByText(/Find out which of 63 common TCP ports/),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Scan ports' })).toBeEnabled();
  });

  it('starts a scan, shows it running, then shows what it found', async () => {
    const user = userEvent.setup();
    const running = makePortScan({
      id: 'scan-2',
      status: 'running',
      finishedAt: null,
      durationMs: null,
    });
    deviceService.startPortScan.mockResolvedValue({ scan: running });
    await renderDevice();

    await user.click(await within(portsPanel()).findByRole('button', { name: 'Scan ports' }));

    expect(deviceService.startPortScan).toHaveBeenCalledWith(DEVICE_ID);
    expect(await within(portsPanel()).findByText(/Checking 63 ports on/)).toBeInTheDocument();
    expect(within(portsPanel()).getByRole('button', { name: /scanning/i })).toBeDisabled();

    // The server announces the end; the panel reloads the results.
    deviceService.getDevicePorts.mockResolvedValue(makeScannedPorts());
    usePortScanStore.getState().applyEvent({
      type: 'portscan.completed',
      data: { scanId: 'scan-2', deviceId: DEVICE_ID, summary: {} },
    });

    const openPorts = await within(portsPanel()).findByRole('list', { name: 'Open ports' });
    expect(
      within(openPorts)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringMatching(/22\/tcp.*ssh.*OpenSSH 9\.2p1.*New/),
      expect.stringMatching(/80\/tcp.*http.*nginx 1\.27\.5/),
    ]);
    expect(within(portsPanel()).getByText(/61 closed/)).toBeInTheDocument();
    expect(
      within(portsPanel()).getByRole('list', { name: 'Previously open ports' }),
    ).toHaveTextContent(/8080\/tcp.*Now closed/);
    expect(within(portsPanel()).getByRole('button', { name: 'Scan again' })).toBeEnabled();
  });

  it('shows why the server refused to start a scan', async () => {
    const user = userEvent.setup();
    deviceService.startPortScan.mockRejectedValue(
      new ApiError('192.168.1.21 now belongs to another device.', {
        status: 409,
        code: 'TARGET_CHANGED',
      }),
    );
    await renderDevice();

    await user.click(await within(portsPanel()).findByRole('button', { name: 'Scan ports' }));

    expect(await within(portsPanel()).findByRole('alert')).toHaveTextContent(
      /Could not start the scan: 192\.168\.1\.21 now belongs to another device\. TARGET_CHANGED/,
    );
  });

  it('shows a failed scan next to the earlier results', async () => {
    const scanned = makeScannedPorts();
    deviceService.getDevicePorts.mockResolvedValue({
      ...scanned,
      scan: makePortScan({
        id: 'scan-3',
        status: 'failed',
        error: { code: 'SCAN_TIMEOUT', message: 'The scan did not finish within 120 s.' },
      }),
    });

    await renderDevice();

    expect(await within(portsPanel()).findByRole('alert')).toHaveTextContent(
      'The last scan failed: The scan did not finish within 120 s. SCAN_TIMEOUT',
    );
    expect(within(portsPanel()).getByRole('list', { name: 'Open ports' })).toBeInTheDocument();
  });

  it('cannot start while another scan runs, or when scanning is turned off', async () => {
    deviceService.getDevicePorts.mockResolvedValue(
      makeDevicePorts({ profile: { enabled: false } }),
    );
    await renderDevice();

    const button = await within(portsPanel()).findByRole('button', { name: 'Scan ports' });
    await vi.waitFor(() => expect(button).toBeDisabled());
    expect(
      within(portsPanel()).getByText(/Port scanning is turned off on the server/),
    ).toBeInTheDocument();
  });

  it('waits for another device to finish scanning', async () => {
    usePortScanStore.setState({
      active: { scanId: 'scan-9', deviceId: 'another-device', startedAt: new Date().toISOString() },
    });
    await renderDevice();

    const button = await within(portsPanel()).findByRole('button', { name: 'Scan ports' });
    await vi.waitFor(() => expect(button).toBeDisabled());
    expect(within(portsPanel()).getByText(/Another device is being scanned/)).toBeInTheDocument();
  });
});
