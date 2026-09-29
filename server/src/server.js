import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const server = http.createServer(createApp());
// Step 5 attaches the WebSocket manager to this same HTTP server (shared port, path /ws).

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

  // Later steps also stop here: WebSocket clients (5), running scans (3/7), DB pool (2).
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Error while closing HTTP server');
      process.exit(1);
    }
    logger.info('Shutdown complete');
    process.exit(0);
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
