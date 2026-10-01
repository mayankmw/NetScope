import { Link, useLocation } from 'react-router';
import { backState } from '@/utils/deviceLinks';
import { scanDetailsPath } from '@/utils/scans';

/** Link to a scan's details page; "Back" there returns here, filters included. */
export function ScanLink({ scanId, ...props }) {
  const location = useLocation();
  return <Link to={scanDetailsPath(scanId)} state={backState(location)} {...props} />;
}
