import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { toAppError } from './errors.js';

/**
 * The application's single PostgreSQL connection pool. Nothing outside src/db/ talks to `pg`
 * directly: repositories use `query` / `withTransaction`, which convert driver errors into
 * AppErrors (see ./errors.js) so infrastructure failures surface as clean 503s.
 */
const pool = new pg.Pool({
  connectionString: config.database.url,
  max: config.database.poolMax,
  connectionTimeoutMillis: config.database.connectionTimeoutMs,
  statement_timeout: config.database.statementTimeoutMs,
  application_name: config.app.name,
});

// Errors on idle clients (e.g. PostgreSQL restarted) are emitted here. Without a listener they
// would crash the process. The pool discards the broken client and reconnects on next use.
pool.on('error', (error) => {
  logger.warn({ err: error }, 'Lost an idle PostgreSQL connection; the pool will reconnect');
});

function rethrow(error) {
  throw toAppError(error) ?? error;
}

/**
 * Runs one parameterized statement. Always pass values via `params` ($1, $2, ...), never by
 * interpolating them into `text`.
 *
 * @param {string} text
 * @param {unknown[]} [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (error) {
    return rethrow(error);
  }
}

/**
 * Executor for repository functions outside a transaction. Repositories accept any object with
 * a `query` method, so the same function works with this or with a transaction's client.
 */
export const db = Object.freeze({ query });

/**
 * Runs `work` inside a transaction on a dedicated client. Commits if it resolves, rolls back if
 * it throws. Use the provided client for every statement that belongs to the transaction.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTransaction(work) {
  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    return rethrow(error);
  }

  let brokenConnection;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // The connection is unusable; destroy it instead of returning it to the pool.
      brokenConnection = rollbackError;
    }
    return rethrow(error);
  } finally {
    client.release(brokenConnection);
  }
}

/** Round-trip check used by the health endpoint. */
export async function checkDatabaseConnection() {
  const startedAt = performance.now();
  await query('SELECT 1');
  return { latencyMs: Math.round((performance.now() - startedAt) * 10) / 10 };
}

/** Non-secret server details, logged at startup. */
export async function getDatabaseInfo() {
  const { rows } = await query(
    "SELECT current_database() AS database, current_setting('server_version') AS version",
  );
  return rows[0];
}

let closing;

/** Closes every pooled connection. Idempotent; called during graceful shutdown. */
export function closePool() {
  closing ??= pool.end();
  return closing;
}
