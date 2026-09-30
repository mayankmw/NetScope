import { useEffect, useState } from 'react';

/**
 * Current time (epoch ms), updated every `intervalMs`, so relative timestamps ("2 min ago")
 * stay accurate without reloading data.
 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
