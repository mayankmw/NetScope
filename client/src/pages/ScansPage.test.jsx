import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/services/apiClient';
import * as scanService from '@/services/scanService';
import { resetDeviceStore } from '@/stores/useDeviceStore';
import { resetPortScanStore } from '@/stores/usePortScanStore';
import { resetScanHistoryStore } from '@/stores/useScanHistoryStore';
import {
  DEVICE_ID,
  makeDiscoverySummary,
  makePortScanEntry,
  makeScan,
  SCAN_ID,
} from '@/test/fixtures';
import { ScansPage } from './ScansPage';

vi.mock('@/services/scanService', () => ({ listScans: vi.fn(), getScan: vi.fn() }));
vi.mock('@/services/deviceService', () => ({ listDevices: vi.fn(), discoverDevices: vi.fn() }));

function renderAt(url = '/scans') {
  const router = createMemoryRouter(
    [
      { path: '/scans', element: <ScansPage /> },
      { path: '/scans/:scanId', element: <p>Scan page</p> },
      { path: '/devices/:deviceId', element: <p>Device page</p> },
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

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const rows = () => screen.getAllByRole('row').slice(1);

/** Newest first: a scan that found a new device, a failed one, and an ordinary one. */
function networkScans() {
  return [
    makeScan({
      startedAt: minutesAgo(10),
      summary: makeDiscoverySummary({
        devicesFound: 4,
        newDevices: 1,
        missingDevices: 2,
        wentOffline: 1,
        knownDevices: 6,
      }),
    }),
    makeScan({
      id: 'b0000000-0000-4000-8000-000000000002',
      startedAt: minutesAgo(70),
      status: 'failed',
      summary: null,
      error: { code: 'NETWORK_UNAVAILABLE', message: 'No usable network.' },
    }),
    makeScan({ id: 'b0000000-0000-4000-8000-000000000003', startedAt: minutesAgo(130) }),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  resetScanHistoryStore();
  resetDeviceStore();
  resetPortScanStore();
  scanService.listScans.mockResolvedValue({ items: networkScans(), nextCursor: null });
});

describe('ScansPage', () => {
  it('shows a placeholder while the history loads', () => {
    scanService.listScans.mockReturnValue(new Promise(() => {}));

    renderAt();

    expect(screen.getByLabelText('Loading scans')).toHaveAttribute('aria-busy', 'true');
  });

  it('lists network scans with what each found, and a trend chart', async () => {
    renderAt();

    await screen.findAllByRole('row');
    expect(scanService.listScans).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'discovery', status: undefined }),
    );
    const [first, failed] = rows();
    expect(within(first).getByText('4')).toBeInTheDocument();
    expect(first).toHaveTextContent('/ 6');
    expect(within(first).getByText('+1')).toBeInTheDocument();
    expect(first).toHaveTextContent('1 went offline');
    expect(within(first).getByText('1.4 s')).toBeInTheDocument();
    expect(within(first).getByText('Completed')).toBeInTheDocument();
    expect(within(failed).getByText('Failed')).toBeInTheDocument();
    expect(within(failed).getByText('No usable network.')).toBeInTheDocument();

    // Two completed scans: one column each.
    expect(screen.getByRole('figure', { name: 'Devices per scan' })).toBeInTheDocument();
    expect(screen.getAllByTestId('trend-column')).toHaveLength(2);
  });

  it('opens a scan from its row', async () => {
    const user = userEvent.setup();
    const router = renderAt('/scans?status=completed');
    await screen.findAllByRole('row');

    await user.click(within(rows()[0]).getByText('1.4 s'));

    expect(router.state.location.pathname).toBe(`/scans/${SCAN_ID}`);
    expect(router.state.location.state).toEqual({ from: '/scans?status=completed' });
  });

  it('switches to port scans and filters by status, in the URL', async () => {
    const user = userEvent.setup();
    const router = renderAt();
    await screen.findAllByRole('row');
    scanService.listScans.mockResolvedValue({ items: [makePortScanEntry()], nextCursor: null });

    await user.click(screen.getByRole('radio', { name: 'Port scans' }));

    expect(await screen.findByText('raspberrypi.lan')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?type=port');
    expect(rows()[0]).toHaveTextContent('22, 80');
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Failed' }));
    expect(router.state.location.search).toBe('?type=port&status=failed');
    expect(scanService.listScans).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'port', status: 'failed' }),
    );
  });

  it("shows one device's port scans, and can show every device again", async () => {
    const user = userEvent.setup();
    scanService.listScans.mockResolvedValue({ items: [makePortScanEntry()], nextCursor: null });
    const router = renderAt(`/scans?type=port&device=${DEVICE_ID}`);

    expect(await screen.findByText('Device: raspberrypi.lan')).toBeInTheDocument();
    expect(scanService.listScans).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'port', deviceId: DEVICE_ID }),
    );

    await user.click(screen.getByRole('button', { name: /every device/i }));
    expect(router.state.location.search).toBe('?type=port');
  });

  it('loads older scans', async () => {
    const user = userEvent.setup();
    scanService.listScans.mockResolvedValueOnce({ items: networkScans(), nextCursor: 'cursor' });
    renderAt();
    await screen.findAllByRole('row');
    scanService.listScans.mockResolvedValueOnce({
      items: [makeScan({ id: 'b0000000-0000-4000-8000-000000000004', startedAt: minutesAgo(400) })],
      nextCursor: null,
    });

    await user.click(screen.getByRole('button', { name: /load older scans/i }));

    expect(await screen.findAllByRole('row')).toHaveLength(5);
    expect(scanService.listScans).toHaveBeenLastCalledWith(
      expect.objectContaining({ before: 'cursor' }),
    );
    expect(screen.queryByRole('button', { name: /load older scans/i })).not.toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    scanService.listScans
      .mockRejectedValueOnce(
        new ApiError('The database is unavailable.', { status: 503, code: 'DATABASE_UNAVAILABLE' }),
      )
      .mockResolvedValueOnce({ items: networkScans(), nextCursor: null });
    renderAt();

    expect(await screen.findByText('Could not load the scan history')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findAllByRole('row')).toHaveLength(4);
  });

  it('invites a first discovery when nothing has been scanned', async () => {
    scanService.listScans.mockResolvedValue({ items: [], nextCursor: null });
    renderAt();

    expect(await screen.findByText('No network scans yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discover network/i })).toBeEnabled();
  });

  it('explains where port scans come from', async () => {
    scanService.listScans.mockResolvedValue({ items: [], nextCursor: null });
    renderAt('/scans?type=port');

    expect(await screen.findByText('No port scans yet')).toBeInTheDocument();
    expect(screen.getByText(/started from a device's page/)).toBeInTheDocument();
  });
});
