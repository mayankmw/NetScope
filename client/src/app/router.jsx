import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/layouts/AppLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';

// Pages are code-split: the shell loads first and each page's code arrives with its route.
const lazyPage = (load, name) => async () => ({ Component: (await load())[name] });

/**
 * Route table. Planned routes (added in their own steps):
 *   /devices/:deviceId (6) · /topology (8) · /scans, /scans/:scanId (9)
 *   /alerts (10) · /reports (11) · /settings
 */
export const routes = [
  {
    element: <AppLayout />,
    // Catches errors thrown by the layout itself.
    errorElement: <RouteErrorPage />,
    children: [
      {
        // Pathless route: errors inside pages render within the layout, keeping navigation.
        errorElement: <RouteErrorPage />,
        children: [
          {
            index: true,
            lazy: lazyPage(() => import('@/pages/DashboardPage'), 'DashboardPage'),
          },
          {
            path: 'devices',
            lazy: lazyPage(() => import('@/pages/DevicesPage'), 'DevicesPage'),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
