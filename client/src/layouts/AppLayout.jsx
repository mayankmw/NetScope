import { Radar } from 'lucide-react';
import { Link, Outlet } from 'react-router';

/**
 * Application shell. Step 4 grows this into the full layout
 * (sidebar navigation, top bar with scan controls and live-connection indicator).
 */
export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Radar className="size-5 text-primary" aria-hidden="true" />
            NetScope
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
