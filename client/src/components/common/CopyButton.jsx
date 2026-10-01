import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Copies `value` to the clipboard and confirms with a check mark. Renders nothing where the
 * Clipboard API is unavailable (plain http on a LAN address is not a secure context).
 */
export function CopyButton({ value, label, className }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (typeof navigator === 'undefined' || !navigator.clipboard) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      title={label}
      className={cn('shrink-0 text-muted-foreground hover:text-foreground', className)}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}
