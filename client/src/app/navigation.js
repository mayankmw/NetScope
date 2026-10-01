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
];

/** Sections on the roadmap, shown disabled so the shell does not change shape as they land. */
export const UPCOMING_NAV = [
  { label: 'Alerts', icon: BellRing },
  { label: 'Reports', icon: FileText },
];
