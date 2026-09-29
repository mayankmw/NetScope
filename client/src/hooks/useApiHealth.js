import { useCallback, useEffect, useState } from 'react';
import { getHealth } from '@/services/healthService';

/**
 * @typedef {object} ApiHealthState
 * @property {'loading' | 'success' | 'error'} status
 * @property {import('@/types/api').HealthStatus | null} data
 * @property {import('@/services/apiClient').ApiError | null} error
 * @property {number | null} checkedAt Epoch ms of the last completed check.
 */

/** @type {ApiHealthState} */
const INITIAL_STATE = { status: 'loading', data: null, error: null, checkedAt: null };

/**
 * Fetches GET /api/health on mount and whenever `refresh` is called. Each request is
 * aborted when superseded or on unmount, so a stale response can never overwrite state.
 */
export function useApiHealth() {
  const [state, setState] = useState(INITIAL_STATE);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    getHealth({ signal: controller.signal }).then(
      (data) => {
        if (controller.signal.aborted) return;
        setState({ status: 'success', data, error: null, checkedAt: Date.now() });
      },
      (error) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', data: null, error, checkedAt: Date.now() });
      },
    );

    return () => controller.abort();
  }, [requestKey]);

  const refresh = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading' }));
    setRequestKey((key) => key + 1);
  }, []);

  return { ...state, refresh };
}
