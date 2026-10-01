import { useEffect } from 'react';
import { useDeviceDetailsStore } from '@/stores/useDeviceDetailsStore';
import { isUuid } from '@/utils/ids';

/**
 * Loads a device for the details page and keeps it current while the page is shown.
 * A malformed id is "not found" without asking the server.
 *
 * @param {string | undefined} deviceId from the URL
 */
export function useDeviceDetails(deviceId) {
  const isValid = isUuid(deviceId);
  const state = useDeviceDetailsStore();
  const { open, close } = state;

  useEffect(() => {
    if (!isValid) return undefined;
    open(deviceId);
    return close;
  }, [deviceId, isValid, open, close]);

  if (!isValid) return { ...state, status: 'not-found', details: null };
  // Until the store switches to this device, it may still hold the previous one.
  if (state.deviceId !== deviceId) return { ...state, status: 'loading', details: null };
  return state;
}
