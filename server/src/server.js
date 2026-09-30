import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { getMigrationStatus } from './db/migrator.js';
import { closePool, getDatabaseInfo, query } from './db/pool.js';
import { cancelActiveDiscovery, recoverInterruptedScans } from './services/discovery.service.js';
import { logger } from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const server = http.createServer(createApp());
// Step 5 attaches the WebSocket manager to this same HTTP server (shared port, path /ws).

/**
 * Startup database check. The API starts even when PostgreSQL is down: /api/health then reports
 * 503, and the pool connects automatically once the database is back. Failing to start would
 * hide that diagnostic from the UI.
 */
async function verifyDatabase() {
  const { host, port, name } = config.database.target;
  try {
    const info = await getDatabaseInfo();
    logger.info(
      { host, port, database: info.database, serverVersion: info.version },
      'Connected to PostgreSQL',
    );

    const { pending } = await getMigrationStatus(query);
    if (pending.length > 0) {
      logger.warn({ pending }, 'Database schema is out of date. Run: npm run db:migrate');
      return;
    }

    const interrupted = await recoverInterruptedScans();
    if (interrupted.length > 0) {
      logger.warn(
        { scanIds: interrupted },
        'Marked scans left running by a previous process as failed',
      );
    }
  } catch (error) {
    logger.error(
      { err: error, host, port, database: name },
      'PostgreSQL is not reachable. The API is running; /api/health reports 503 until it is.',
    );
  }
}

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.fatal(`Port ${config.server.port} is already in use. Set PORT to a free port.`);
  } else {
    logger.fatal({ err: error }, 'HTTP server error');
  }
  process.exit(1);
});

server.listen(config.server.port, config.server.host, () => {
  const { host, port } = config.server;
  logger.info({ host, port, env: config.env }, `NetScope API listening on http://${host}:${port}`);

  if (!LOOPBACK_HOSTS.has(host)) {
    logger.warn(
      { host },
      'API is reachable from other machines, but NetScope has no authentication yet. ' +
        'Keep HOST=127.0.0.1 until auth lands (Step 12).',
    );
  }

  verifyDatabase();
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out; forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  // Order matters: cancel a running discovery (its request then finishes quickly), stop
  // accepting requests and let in-flight ones finish (they may still need the database), then
  // close the pool. Step 5 adds: close WebSocket clients.
  cancelActiveDiscovery();
  server.close(async (serverError) => {
    let exitCode = 0;
    if (serverError) {
      logger.error({ err: serverError }, 'Error while closing HTTP server');
      exitCode = 1;
    }

    try {
      await closePool();
      logger.info('Database pool closed');
    } catch (poolError) {
      logger.error({ err: poolError }, 'Error while closing database pool');
      exitCode = 1;
    }

    logger.info('Shutdown complete');
    process.exit(exitCode);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// A process in an unknown state must not keep serving. Log and exit; the supervisor restarts it.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});
