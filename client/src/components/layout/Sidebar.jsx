import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/useUiStore';
import { Brand } from './Brand';
import { SidebarNav } from './SidebarNav';

/** Desktop sidebar (≥ lg). Collapses to an icon rail; the choice is remembered per browser. */
export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar backdrop-blur-xl transition-[width] duration-200 ease-out lg:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-14 items-center px-4', collapsed && 'justify-center px-0')}>
        <Brand compact={collapsed} />
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className={cn(
            'w-full justify-start text-muted-foreground',
            collapsed && 'justify-center',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          <ToggleIcon aria-hidden="true" />
          {!collapsed && 'Collapse'}
        </Button>
      </div>
    </aside>
  );
}
