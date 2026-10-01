import { AnimatePresence, motion } from 'motion/react';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { usePortScanStore } from '@/stores/usePortScanStore';

/**
 * Thin indeterminate line under the top bar while a scan (a discovery or a port scan) runs,
 * visible from any page. Scans report no progress, hence indeterminate.
 */
export function ScanProgressBar() {
  const isDiscovering = useDeviceStore((state) => state.discovery.status === 'running');
  const isPortScanning = usePortScanStore((state) => state.active !== null);
  const label = isDiscovering ? 'Network discovery in progress' : 'Port scan in progress';

  return (
    <AnimatePresence>
      {(isDiscovering || isPortScanning) && (
        <motion.div
          role="progressbar"
          aria-label={label}
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
