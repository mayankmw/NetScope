import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Storage that silently degrades (private mode, blocked storage) instead of throwing. */
const safeLocalStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Preference is simply not remembered.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Nothing to remove.
    }
  },
};

/** Per-browser UI preferences. */
export const useUiStore = create(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      /** @type {'radial' | 'tree'} */
      topologyLayout: 'radial',
      topologyShowOffline: true,
      setTopologyLayout: (topologyLayout) => set({ topologyLayout }),
      setTopologyShowOffline: (topologyShowOffline) => set({ topologyShowOffline }),
    }),
    {
      name: 'netscope:ui',
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);
