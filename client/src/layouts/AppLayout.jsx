import { motion } from 'motion/react';
import { useLocation, useOutlet } from 'react-router';
import { Toaster } from '@/components/common/Toaster';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useRealtime } from '@/hooks/useRealtime';

/**
 * Application shell: sidebar (desktop), sticky top bar, and the routed page, which fades in on
 * navigation. Toasts, tooltips, and the real-time connection live here for every page.
 */
export function AppLayout() {
  useRealtime();
  const { pathname } = useLocation();
  const outlet = useOutlet();

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-h-svh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {outlet}
            </motion.div>
          </main>
        </div>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
