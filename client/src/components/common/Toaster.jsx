import { Toaster as Sonner } from 'sonner';

/** App-wide toast outlet, themed with the NetScope tokens. */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      style={{
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        '--border-radius': 'var(--radius)',
      }}
      toastOptions={{ classNames: { description: '!text-muted-foreground' } }}
    />
  );
}
