import { SystemStatusCard } from '@/components/system/SystemStatusCard';

/**
 * Step 1 landing page: verifies the client → API wiring end to end.
 * Replaced by the dashboard in a later step.
 */
export function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">NetScope</h1>
        <p className="max-w-2xl text-muted-foreground">
          Local network intelligence and monitoring. The project foundation is in place; features
          arrive step by step.
        </p>
      </section>

      <div className="max-w-md">
        <SystemStatusCard />
      </div>
    </div>
  );
}
