import { createBrowserRouter } from 'react-router';
import { PageFallback } from '@/components/common/PageFallback';
import { AppLayout } from '@/layouts/AppLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';

// Pages are code-split: the shell loads first and each page's code arrives with its route.
const lazyPage = (load, name) => async () => ({ Component: (await load())[name] });

/**
 * Route table. Planned routes (added in their own steps):
 *   /topology (8) · /scans, /scans/:scanId (9) · /alerts (10) · /reports (11) · /settings
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
        // Shown in the page area while a lazy page's code loads on first visit; the sidebar and
        // top bar render immediately.
        hydrateFallbackElement: <PageFallback />,
        children: [
          {
            index: true,
            lazy: lazyPage(() => import('@/pages/DashboardPage'), 'DashboardPage'),
          },
          {
            path: 'devices',
            lazy: lazyPage(() => import('@/pages/DevicesPage'), 'DevicesPage'),
          },
          {
            path: 'devices/:deviceId',
            lazy: lazyPage(() => import('@/pages/DeviceDetailsPage'), 'DeviceDetailsPage'),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
