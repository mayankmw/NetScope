import { config } from '../config/index.js';
import { checkDatabaseConnection } from '../db/pool.js';
import { logger } from '../utils/logger.js';

/**
 * @returns {Promise<{ status: 'up', latencyMs: number } | { status: 'down' }>}
 */
async function checkDatabase() {
  try {
    const { latencyMs } = await checkDatabaseConnection();
    return { status: 'up', latencyMs };
  } catch (error) {
    // The cause is logged here; the response only says "down" (no hosts, no driver messages).
    logger.warn({ err: error }, 'Health check: PostgreSQL is not reachable');
    return { status: 'down' };
  }
}

/**
 * Reports whether the API process is running and its dependencies are reachable.
 * `status` is "ok" only when every check is up.
 */
export async function getHealth() {
  const database = await checkDatabase();

  return {
    status: database.status === 'up' ? 'ok' : 'degraded',
    service: config.app.name,
    version: config.app.version,
    environment: config.env,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      api: { status: 'up' },
      database,
    },
  };
}
