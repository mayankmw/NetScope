import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/services/apiClient';
import * as scanService from '@/services/scanService';
import { resetScanDetailsStore } from '@/stores/useScanDetailsStore';
import { DEVICE_ID, makePortScanEntry, makeScanDetails, SCAN_ID } from '@/test/fixtures';
import { ScanDetailsPage } from './ScanDetailsPage';

vi.mock('@/services/scanService', () => ({ listScans: vi.fn(), getScan: vi.fn() }));

function renderAt(url, state) {
  const router = createMemoryRouter(
    [
      { path: '/scans', element: <p>Scan list</p> },
      { path: '/scans/:scanId', element: <ScanDetailsPage /> },
      { path: '/devices/:deviceId', element: <p>Device page</p> },
    ],
    { initialEntries: [{ pathname: url, state }] },
  );
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  return router;
}

const section = (name) => screen.getByRole('heading', { name }).closest('section');

beforeEach(() => {
  vi.clearAllMocks();
  resetScanDetailsStore();
  scanService.getScan.mockResolvedValue(makeScanDetails());
});

describe('ScanDetailsPage', () => {
  it('shows what a network scan found, missed, and changed', async () => {
    renderAt(`/scans/${SCAN_ID}`, { from: '/scans?status=completed' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Network scan' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Scans' })).toHaveAttribute(
      'href',
      '/scans?status=completed',
    );
    expect(screen.getByText(/took 1\.4 s/)).toBeInTheDocument();
    expect(screen.getByText('of 5 known')).toBeInTheDocument();
    expect(screen.getByText('1 went offline')).toBeInTheDocument();

    const changes = section('What changed');
    expect(within(changes).getByText('New devices (1)')).toBeInTheDocument();
    expect(within(changes).getByText('Synology Incorporated device')).toBeInTheDocument();
    expect(within(changes).getByText('Back online (1)')).toBeInTheDocument();
    expect(within(changes).getByText('pixel-8')).toBeInTheDocument();
    expect(within(changes).getByText('Went offline (1)')).toBeInTheDocument();
    expect(within(changes).getByText('printer')).toBeInTheDocument();
    expect(
      within(changes).getByText(/IP address: 192\.168\.1\.20 → 192\.168\.1\.21/),
    ).toBeInTheDocument();

    const found = section('Devices found (4)');
    expect(within(found).getAllByRole('listitem')).toHaveLength(4);
    expect(within(found).getByText('New')).toBeInTheDocument();
    expect(within(found).getByText('New address')).toBeInTheDocument();
    expect(within(found).getByText(/no ping reply/)).toBeInTheDocument();
    expect(within(found).getByRole('link', { name: 'raspberrypi.lan' })).toHaveAttribute(
      'href',
      '/devices/device-192.168.1.20',
    );

    const missing = section('Missing devices (1)');
    expect(within(missing).getByText(/last seen 1h 0m before/)).toBeInTheDocument();
    expect(within(missing).getByText('Went offline')).toBeInTheDocument();

    expect(
      within(section('How it ran')).getByText('1.0 s timeout, 64 at a time'),
    ).toBeInTheDocument();
  });

  it('steps to the older scan of the same network', async () => {
    const user = userEvent.setup();
    const router = renderAt(`/scans/${SCAN_ID}`);
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByRole('button', { name: /newer/i })).toBeDisabled();
    await user.click(screen.getByRole('link', { name: /older/i }));

    expect(router.state.location.pathname).toBe('/scans/b0000000-0000-4000-8000-000000000001');
    expect(scanService.getScan).toHaveBeenLastCalledWith(
      'b0000000-0000-4000-8000-000000000001',
      expect.anything(),
    );
  });

  it('shows the ports a port scan found', async () => {
    const scan = makePortScanEntry();
    scanService.getScan.mockResolvedValue({
      scan: {
        ...scan,
        params: {
          profile: 'common',
          serviceDetection: 'light',
          timeoutMs: 120_000,
          nmapArgs: ['-sT', '192.168.1.21'],
        },
      },
      previous: null,
      next: null,
      results: {
        ports: [
          {
            port: 22,
            protocol: 'tcp',
            state: 'open',
            service: 'ssh',
            product: 'OpenSSH',
            version: '9.2p1',
            firstSeenOpenAt: scan.finishedAt,
            lastSeenOpenAt: scan.finishedAt,
            isNew: true,
          },
          {
            port: 8080,
            protocol: 'tcp',
            state: 'closed',
            service: 'http-proxy',
            product: null,
            version: null,
            firstSeenOpenAt: scan.startedAt,
            lastSeenOpenAt: scan.startedAt,
            isNew: false,
          },
        ],
      },
    });
    renderAt(`/scans/${scan.id}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Port scan of raspberrypi.lan' }),
    ).toBeInTheDocument();
    const ports = section('Open ports (1)');
    expect(within(ports).getByText('OpenSSH 9.2p1')).toBeInTheDocument();
    expect(within(ports).getByText(/Closed; open in an earlier scan/)).toBeInTheDocument();
    expect(within(ports).getByRole('link', { name: 'Open device' })).toHaveAttribute(
      'href',
      `/devices/${DEVICE_ID}`,
    );
    expect(within(section('How it ran')).getByText('nmap -sT 192.168.1.21')).toBeInTheDocument();
  });

  it('explains a failed scan', async () => {
    scanService.getScan.mockResolvedValue(
      makeScanDetails({
        scan: {
          status: 'failed',
          summary: null,
          error: { code: 'NETWORK_UNAVAILABLE', message: 'No usable network.' },
        },
        results: null,
      }),
    );
    renderAt(`/scans/${SCAN_ID}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This scan failed: No usable network. NETWORK_UNAVAILABLE',
    );
    expect(screen.queryByRole('heading', { name: 'What changed' })).not.toBeInTheDocument();
  });

  it('says "not found" for an unknown scan, and for a malformed id without asking', async () => {
    scanService.getScan.mockRejectedValue(
      new ApiError('Scan not found.', { status: 404, code: 'NOT_FOUND' }),
    );
    renderAt(`/scans/${SCAN_ID}`);
    expect(await screen.findByText('Scan not found')).toBeInTheDocument();
  });

  it('does not ask the server about a malformed id', () => {
    renderAt('/scans/latest');

    expect(screen.getByText('Scan not found')).toBeInTheDocument();
    expect(scanService.getScan).not.toHaveBeenCalled();
  });
});
