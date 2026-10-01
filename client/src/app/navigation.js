import {
  BellRing,
  FileText,
  History,
  LayoutDashboard,
  MonitorSmartphone,
  Waypoints,
} from 'lucide-react';

/** Sections available now. */
export const PRIMARY_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/devices', label: 'Devices', icon: MonitorSmartphone, showDeviceCount: true },
  { to: '/topology', label: 'Topology', icon: Waypoints },
  { to: '/scans', label: 'Scans', icon: History },
  { to: '/alerts', label: 'Alerts', icon: BellRing, showAlertCount: true },
];

/** Sections on the roadmap, shown disabled so the shell does not change shape as they land. */
export const UPCOMING_NAV = [{ label: 'Reports', icon: FileText }];
