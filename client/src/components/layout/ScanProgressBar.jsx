import { AnimatePresence, motion } from 'motion/react';
import { useDeviceStore } from '@/stores/useDeviceStore';

/**
 * Thin indeterminate line under the top bar while a discovery runs, visible from any page.
 * Discovery reports no progress yet (WebSockets arrive in Step 5), hence indeterminate.
 */
export function ScanProgressBar() {
  const isRunning = useDeviceStore((state) => state.discovery.status === 'running');

  return (
    <AnimatePresence>
      {isRunning && (
        <motion.div
          role="progressbar"
          aria-label="Network discovery in progress"
          className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_10px_var(--primary)]"
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
