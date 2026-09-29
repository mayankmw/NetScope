import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/layouts/AppLayout';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';

/**
 * Route table. Planned routes (added in their own steps):
 *   /devices, /devices/:deviceId (4, 6) · /topology (8) · /scans, /scans/:scanId (9)
 *   /alerts (10) · /reports (11) · /settings
 */
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    // Catches errors thrown by the layout itself.
    errorElement: <RouteErrorPage />,
    children: [
      {
        // Pathless route: errors inside pages render within the layout, keeping navigation.
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
