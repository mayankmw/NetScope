import { create } from 'zustand';

/** State of the real-time connection, for the live indicator and for store decisions. */
export const useConnectionStore = create((set) => ({
  /** @type {import('@/services/realtimeClient').ConnectionStatus} */
  status: 'idle',
  attempt: 0,
  /** @type {number | null} epoch ms of the next reconnection attempt */
  nextRetryAt: null,
  /** @type {number | null} */
  connectedAt: null,
  /** @type {string | null} */
  serverVersion: null,

  /** @param {import('@/services/realtimeClient').StatusInfo} info */
  setStatus: ({ status, attempt, nextRetryAt }) =>
    set((state) => ({
      status,
      attempt,
      nextRetryAt,
      connectedAt: status === 'open' ? Date.now() : state.connectedAt,
    })),

  setServerInfo: ({ serverVersion }) => set({ serverVersion: serverVersion ?? null }),
}));

/** True when real-time events are flowing. */
export function isRealtimeConnected() {
  return useConnectionStore.getState().status === 'open';
}
