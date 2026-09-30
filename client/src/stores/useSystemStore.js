import { create } from 'zustand';
import { getHealth } from '@/services/healthService';

/**
 * API + database health, shared by the top-bar indicator and the dashboard card so the
 * app makes one request instead of one per component.
 */

let healthController = null;

export const useSystemStore = create((set, get) => ({
  health: {
    /** @type {'idle' | 'loading' | 'success' | 'error'} */
    status: 'idle',
    /** @type {import('@/types/api').HealthStatus | null} */
    data: null,
    /** @type {import('@/services/apiClient').ApiError | null} */
    error: null,
    /** @type {number | null} */
    checkedAt: null,
  },

  /** Fetches /api/health. A new call cancels one still in flight. */
  async checkHealth() {
    healthController?.abort();
    const controller = new AbortController();
    healthController = controller;
    set((state) => ({ health: { ...state.health, status: 'loading' } }));

    try {
      const data = await getHealth({ signal: controller.signal });
      set({ health: { status: 'success', data, error: null, checkedAt: Date.now() } });
    } catch (error) {
      if (controller.signal.aborted) return;
      set({ health: { status: 'error', data: null, error, checkedAt: Date.now() } });
    } finally {
      if (healthController === controller) healthController = null;
    }
  },

  /** Checks once per session unless a check already happened or is running. */
  ensureHealth() {
    const { health, checkHealth } = get();
    if (health.status === 'idle') checkHealth();
  },
}));
