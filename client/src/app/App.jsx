import { RouterProvider } from 'react-router/dom';
import { router } from './router';

/**
 * Root component. App-wide providers (theme, toasts, WebSocket connection) wrap
 * RouterProvider here as they are introduced.
 */
export function App() {
  return <RouterProvider router={router} />;
}
