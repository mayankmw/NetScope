import { NavLink } from 'react-router';
import { PRIMARY_NAV, UPCOMING_NAV } from '@/app/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useDeviceStore } from '@/stores/useDeviceStore';

function CollapsedTooltip({ collapsed, label, children }) {
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function SectionLabel({ collapsed, children }) {
  if (collapsed) return <div className="mx-3 my-3 h-px bg-sidebar-border" aria-hidden="true" />;
  return (
    <p className="px-3 pt-4 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/**
 * Navigation links shared by the desktop sidebar and the mobile sheet. The active item gets the
 * primary neon treatment; upcoming sections are listed but disabled.
 */
export function SidebarNav({ collapsed = false, onNavigate }) {
  const deviceCount = useDeviceStore((state) => state.ids.length);

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
      <SectionLabel collapsed={collapsed}>Monitor</SectionLabel>
      {PRIMARY_NAV.map(({ to, label, icon: Icon, end, showDeviceCount }) => (
        <CollapsedTooltip key={to} collapsed={collapsed} label={label}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-sidebar-accent text-primary'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]"
                    aria-hidden="true"
                  />
                )}
                <Icon className="size-4.5 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="truncate">{label}</span>}
                {!collapsed && showDeviceCount && deviceCount > 0 && (
                  <span className="ml-auto rounded-md bg-muted/60 px-1.5 text-xs text-muted-foreground tabular-nums">
                    {deviceCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        </CollapsedTooltip>
      ))}

      <SectionLabel collapsed={collapsed}>Coming soon</SectionLabel>
      {UPCOMING_NAV.map(({ label, icon: Icon }) => (
        <CollapsedTooltip key={label} collapsed={collapsed} label={`${label} (coming soon)`}>
          <span
            aria-disabled="true"
            className={cn(
              'flex h-9 cursor-not-allowed items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground/60',
              collapsed && 'justify-center px-0',
            )}
          >
            <Icon className="size-4.5 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{label}</span>}
            {!collapsed && (
              <span className="ml-auto text-[10px] tracking-wide uppercase">Soon</span>
            )}
          </span>
        </CollapsedTooltip>
      ))}
    </nav>
  );
}
