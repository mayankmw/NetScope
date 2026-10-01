import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/services/apiClient';
import * as deviceService from '@/services/deviceService';
import { resetDeviceStore } from '@/stores/useDeviceStore';
import { useUiStore } from '@/stores/useUiStore';
import { makeInventory } from '@/test/fixtures';
import { TopologyPage } from './TopologyPage';

vi.mock('@/services/deviceService', () => ({ listDevices: vi.fn(), discoverDevices: vi.fn() }));

// jsdom has no canvas: the Cytoscape graph is replaced by buttons with the same callbacks.
// The graph itself is tested against a headless Cytoscape (components/topology/graphSync.test.js).
vi.mock('@/components/topology/TopologyGraph', () => ({
  TopologyGraph: ({ model, matches, selectedId, onSelect, onOpen }) => (
    <div data-testid="graph">
      {model.nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          data-match={matches ? String(matches.has(node.id)) : undefined}
          aria-pressed={node.id === selectedId}
          onClick={() => onSelect(node.id)}
          onDoubleClick={() => onOpen(node.id)}
        >
          {node.name}
        </button>
      ))}
    </div>
  ),
}));

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/topology', element: <TopologyPage /> },
      { path: '/devices/:deviceId', element: <p>Device page</p> },
    ],
    { initialEntries: ['/topology'] },
  );
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  return router;
}

const graphNode = (name) => within(screen.getByTestId('graph')).getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  resetDeviceStore();
  useUiStore.setState({ topologyLayout: 'radial', topologyShowOffline: true });
  deviceService.listDevices.mockResolvedValue(makeInventory());
});

describe('TopologyPage', () => {
  it('shows a placeholder while the inventory loads', () => {
    deviceService.listDevices.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByLabelText('Loading topology')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an error with a working retry', async () => {
    deviceService.listDevices
      .mockRejectedValueOnce(
        new ApiError('The database is unavailable.', { status: 503, code: 'DATABASE_UNAVAILABLE' }),
      )
      .mockResolvedValueOnce(makeInventory());

    renderPage();

    expect(await screen.findByText('Could not load the network')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByTestId('graph')).toBeInTheDocument();
  });

  it('invites a first discovery before any network is known', async () => {
    deviceService.listDevices.mockResolvedValue({ network: null, devices: [] });

    renderPage();

    expect(await screen.findByText('No network to show yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discover network/i })).toBeEnabled();
  });

  it('shows the gateway and its devices, and says the topology is logical', async () => {
    renderPage();

    const graph = await screen.findByTestId('graph');
    expect(
      within(graph)
        .getAllByRole('button')
        .map((node) => node.textContent),
    ).toEqual([
      'Apple, Inc. gateway',
      'raspberrypi.lan',
      'pixel-8',
      'Synology Incorporated device',
    ]);
    expect(screen.getByText(/Logical view of/)).toHaveTextContent(
      'Logical view of 192.168.1.0/24 · 4 devices · 3 online',
    );
    expect(screen.getByText(/Lines are not cables or Wi-Fi links/)).toBeInTheDocument();
  });

  it('shows a selected device and opens its page', async () => {
    const user = userEvent.setup();
    const router = renderPage();
    await screen.findByTestId('graph');

    await user.click(graphNode('raspberrypi.lan'));

    const panel = screen.getByRole('heading', { name: 'raspberrypi.lan' }).closest('.glass-panel');
    expect(within(panel).getByText('192.168.1.20')).toBeInTheDocument();
    expect(within(panel).getByText('Computer')).toBeInTheDocument();
    expect(within(panel).getByText('Online')).toBeInTheDocument();
    expect(
      within(panel).getByText(/reaches other networks through the gateway 192\.168\.1\.1/),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /open device page/i })).toHaveAttribute(
      'href',
      '/devices/device-192.168.1.20',
    );

    await user.keyboard('{Escape}');
    expect(screen.getByText(/Select a device in the graph/)).toBeInTheDocument();

    await user.dblClick(graphNode('raspberrypi.lan'));
    expect(router.state.location.pathname).toBe('/devices/device-192.168.1.20');
    expect(router.state.location.state).toEqual({ from: '/topology' });
  });

  it('highlights search matches', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('graph');

    await user.type(screen.getByRole('searchbox', { name: /find a device/i }), 'synology');

    expect(screen.getByText('1 match')).toBeInTheDocument();
    expect(graphNode('Synology Incorporated device')).toHaveAttribute('data-match', 'true');
    expect(graphNode('raspberrypi.lan')).toHaveAttribute('data-match', 'false');
  });

  it('can hide offline devices, and remembers it', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('graph');

    await user.click(screen.getByRole('button', { name: /offline devices/i }));

    expect(screen.queryByRole('button', { name: 'pixel-8' })).not.toBeInTheDocument();
    expect(screen.getByText(/1 offline hidden/)).toBeInTheDocument();
    expect(useUiStore.getState().topologyShowOffline).toBe(false);
  });

  it('offers the same structure as a list of links', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('graph');

    await user.click(screen.getByRole('radio', { name: 'List' }));

    const list = screen.getByRole('list', { name: 'Logical topology' });
    expect(within(list).getAllByRole('link')).toHaveLength(4);
    expect(within(list).getByRole('list', { name: 'Devices on 192.168.1.0/24' })).toHaveTextContent(
      /Computers and servers \(1\).*Phones and tablets \(1\).*Other and unknown \(1\)/,
    );
    expect(screen.queryByTestId('graph')).not.toBeInTheDocument();
  });
});
