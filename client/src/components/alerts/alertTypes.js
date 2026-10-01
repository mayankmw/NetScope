import { ArrowRightLeft, Sparkles, Wifi } from 'lucide-react';

/** Icon and colour per alert type: magenta for "new" (as everywhere), green for online. */
export const ALERT_TYPE_STYLES = {
  new_device: {
    icon: Sparkles,
    tone: 'border-neon-magenta/30 bg-neon-magenta/10 text-neon-magenta',
  },
  device_returned: { icon: Wifi, tone: 'border-success/30 bg-success/10 text-success' },
  ip_changed: { icon: ArrowRightLeft, tone: 'border-warning/30 bg-warning/10 text-warning' },
};
