import { cn } from '@/lib/utils';

/** Frosted, bordered surface used for every content panel. */
export function GlassPanel({ as: Component = 'div', className, ...props }) {
  return <Component className={cn('rounded-xl glass-panel', className)} {...props} />;
}

/** Standard panel header row: title (and optional description) with actions on the right. */
export function PanelHeader({ title, description, actions, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
