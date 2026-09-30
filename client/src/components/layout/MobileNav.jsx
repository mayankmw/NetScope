import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Brand } from './Brand';
import { SidebarNav } from './SidebarNav';

/** Slide-out navigation for screens narrower than lg. Closes after navigating. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 border-sidebar-border bg-background/95 p-0 backdrop-blur-xl"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">NetScope sections</SheetDescription>
        <div className="flex h-14 items-center px-4">
          <Brand onNavigate={close} />
        </div>
        <SidebarNav onNavigate={close} />
      </SheetContent>
    </Sheet>
  );
}
