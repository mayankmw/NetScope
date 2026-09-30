import { MotionConfig } from 'motion/react';
import { RouterProvider } from 'react-router/dom';
import { router } from './router';

/**
 * Root component. App-wide providers wrap RouterProvider here. MotionConfig makes every
 * animation respect the OS "reduce motion" setting.
 */
export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  );
}
