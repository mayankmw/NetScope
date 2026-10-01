import { Link, useLocation } from 'react-router';
import { backState, deviceDetailsPath } from '@/utils/deviceLinks';

/** Link to a device's details page; "Back" there returns here, filters included. */
export function DeviceLink({ deviceId, ...props }) {
  const location = useLocation();
  return <Link to={deviceDetailsPath(deviceId)} state={backState(location)} {...props} />;
}
