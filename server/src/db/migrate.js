/**
 * Migration CLI. Run through npm so .env is loaded:
 *   npm run db:migrate          apply all pending migrations
 *   npm run db:migrate:down     revert the most recent migration
 *   npm run db:migrate:status   list applied and pending migrations
 */
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getMigrationStatus, runMigrations } from './migrator.js';
import { closePool, query } from './pool.js';

const COMMANDS = ['up', 'down', 'status'];

async function main(command) {
  if (!COMMANDS.includes(command)) {
    logger.error(`Unknown command "${command}". Use one of: ${COMMANDS.join(', ')}`);
    return 1;
  }

  const { host, port, name } = config.database.target;
  logger.info({ host, port, database: name }, `Migrations: ${command}`);

  if (command === 'status') {
    const { applied, pending } = await getMigrationStatus(query);
    logger.info({ applied, pending }, pending.length ? `${pending.length} pending` : 'Up to date');
    return 0;
  }

  const migrations = await runMigrations({
    databaseUrl: config.database.url,
    direction: command,
    log: (message) => logger.debug(message),
  });
  const names = migrations.map((migration) => migration.name);
  logger.info(
    { migrations: names },
    names.length ? `${command === 'up' ? 'Applied' : 'Reverted'} ${names.length}` : 'Nothing to do',
  );
  return 0;
}

try {
  process.exitCode = await main(process.argv[2] ?? 'up');
} catch (error) {
  logger.error({ err: error }, 'Migration failed');
  process.exitCode = 1;
} finally {
  await closePool();
}
