import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

// Deliberately independent of the app config and pool, so the test setup can migrate the
// test database without loading the application's configuration.

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));
export const MIGRATIONS_TABLE = 'pgmigrations';

const UNDEFINED_TABLE = '42P01';

/**
 * Applies (`up`: all pending) or reverts (`down`: the latest one) SQL migrations.
 * node-pg-migrate runs each migration in its own transaction and holds an advisory lock, so
 * two concurrent runs cannot interleave.
 *
 * @param {{ databaseUrl: string, direction: 'up' | 'down', count?: number, log?: (message: string) => void }} options
 */
export function runMigrations({ databaseUrl, direction, count, log = () => {} }) {
  return runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    migrationsTable: MIGRATIONS_TABLE,
    direction,
    count: count ?? (direction === 'up' ? Infinity : 1),
    checkOrder: true,
    log,
  });
}

/** Migration names (file names without extension), oldest first. */
export async function listMigrationNames() {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith('.sql'))
    .map((file) => file.slice(0, -'.sql'.length))
    .sort();
}

/**
 * Compares migration files on disk with the migrations recorded in the database.
 *
 * @param {(text: string) => Promise<{ rows: Array<{ name: string }> }>} query
 */
export async function getMigrationStatus(query) {
  const names = await listMigrationNames();

  let applied = [];
  try {
    const { rows } = await query(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY run_on, id`);
    applied = rows.map((row) => row.name);
  } catch (error) {
    // No migrations table yet means nothing has been applied.
    if (error.code !== UNDEFINED_TABLE) throw error;
  }

  const appliedSet = new Set(applied);
  return { applied, pending: names.filter((name) => !appliedSet.has(name)) };
}
