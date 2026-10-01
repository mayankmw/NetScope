import { useLocation, useNavigate } from 'react-router';
import { backState, deviceDetailsPath } from '@/utils/deviceLinks';

/**
 * Click handler for a whole row that opens a device's details. Ignores clicks on controls inside
 * the row and clicks that end a text selection (someone copying an IP or MAC).
 */
export function useOpenDevice() {
  const navigate = useNavigate();
  const location = useLocation();
  return (event, deviceId) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.target.closest('a, button, input, [role="button"], [tabindex]')) return;
    if (window.getSelection()?.toString()) return;
    navigate(deviceDetailsPath(deviceId), { state: backState(location) });
  };
}
