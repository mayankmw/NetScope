import { useEffect } from 'react';
import { useAlertStore } from '@/stores/useAlertStore';

/** The newest alerts of one device, loaded while its page is shown and kept current. */
export function useDeviceAlerts(deviceId) {
  const device = useAlertStore((state) => state.device);
  const openDevice = useAlertStore((state) => state.openDevice);
  const closeDevice = useAlertStore((state) => state.closeDevice);

  useEffect(() => {
    openDevice(deviceId);
    return closeDevice;
  }, [deviceId, openDevice, closeDevice]);

  return device.deviceId === deviceId ? device : { ...device, status: 'loading', items: [] };
}
