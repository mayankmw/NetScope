import { cn } from '@/lib/utils';

/** Centered placeholder for "nothing here yet" and "nothing matches" situations. */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="grid size-12 place-items-center rounded-full border border-primary/25 bg-primary/10 text-primary shadow-[0_0_24px_-6px_var(--primary)]">
          <Icon className="size-6" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
