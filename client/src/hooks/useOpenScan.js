import { useLocation, useNavigate } from 'react-router';
import { backState } from '@/utils/deviceLinks';
import { scanDetailsPath } from '@/utils/scans';

/**
 * Click handler for a whole row that opens a scan's details. Like useOpenDevice, it ignores
 * clicks on controls inside the row and clicks that end a text selection.
 */
export function useOpenScan() {
  const navigate = useNavigate();
  const location = useLocation();
  return (event, scanId) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.target.closest('a, button, input, [role="button"], [tabindex]')) return;
    if (window.getSelection()?.toString()) return;
    navigate(scanDetailsPath(scanId), { state: backState(location) });
  };
}
