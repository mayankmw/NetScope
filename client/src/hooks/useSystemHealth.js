import { useEffect } from 'react';
import { useSystemStore } from '@/stores/useSystemStore';

/**
 * Health of the API and its database. Triggers one check per session; `refresh` re-checks.
 * `state` is "checking" | "online" | "degraded" (API up, database down) | "offline" (API down).
 */
export function useSystemHealth() {
  const health = useSystemStore((state) => state.health);
  const ensureHealth = useSystemStore((state) => state.ensureHealth);
  const refresh = useSystemStore((state) => state.checkHealth);

  useEffect(() => {
    ensureHealth();
  }, [ensureHealth]);

  let state = 'checking';
  if (health.status === 'error') state = 'offline';
  else if (health.data) state = health.data.status === 'ok' ? 'online' : 'degraded';

  return { ...health, state, isChecking: health.status === 'loading', refresh };
}
