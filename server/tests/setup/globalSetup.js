import { runMigrations } from '../../src/db/migrator.js';

/**
 * Runs once before the test suite: checks that TEST_DATABASE_URL points at a disposable
 * database, then applies all migrations to it.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Add it to server/.env (see server/.env.example).',
    );
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid URL.');
  }

  // Tests truncate tables. Refuse anything that is not clearly a test database.
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL must name a database ending in "_test" (got "${databaseName}").`,
    );
  }

  await runMigrations({ databaseUrl: url, direction: 'up' });
}
