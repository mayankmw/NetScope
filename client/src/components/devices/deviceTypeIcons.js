import {
  Box,
  Cctv,
  CircleHelp,
  Gamepad2,
  HardDrive,
  Laptop,
  Lightbulb,
  Network,
  Printer,
  Router,
  Server,
  Smartphone,
  Speaker,
  Tablet,
  Tv,
  Wifi,
} from 'lucide-react';

const ICONS = {
  unknown: CircleHelp,
  router: Router,
  access_point: Wifi,
  switch: Network,
  computer: Laptop,
  phone: Smartphone,
  tablet: Tablet,
  tv: Tv,
  speaker: Speaker,
  printer: Printer,
  camera: Cctv,
  iot: Lightbulb,
  game_console: Gamepad2,
  nas: HardDrive,
  server: Server,
  other: Box,
};

/** Icon component for a device type code (falls back to a question mark). */
export function deviceTypeIcon(type) {
  return ICONS[type] ?? CircleHelp;
}
