import { config } from '../config/index.js';

/**
 * Liveness report for the API process. Step 2 adds dependency checks
 * (e.g. `checks.database`) and a degraded state.
 */
export function getHealth() {
  return {
    status: 'ok',
    service: config.app.name,
    version: config.app.version,
    environment: config.env,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}
