import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

// Messages never echo the input value: DATABASE_URL contains credentials.
const postgresUrl = z
  .url({
    protocol: /^postgres(ql)?$/,
    error: (issue) =>
      issue.input === undefined ? 'is required' : 'must be a postgres:// or postgresql:// URL',
  })
  .refine((value) => new URL(value).pathname.length > 1, 'must include a database name');

const milliseconds = (min, max, fallback) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

/**
 * Environment variables the server reads. Later steps extend this schema
 * (WS_*, SCAN_*, ...) — see docs/ARCHITECTURE.md#9-environment-variables.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1)),

  DATABASE_URL: postgresUrl,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_CONNECTION_TIMEOUT_MS: milliseconds(100, 60_000, 5_000),
  DATABASE_STATEMENT_TIMEOUT_MS: milliseconds(100, 600_000, 15_000),
});

/**
 * Non-secret description of the database target, safe to log.
 * @param {string} databaseUrl
 */
function describeDatabase(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 5432,
    name: decodeURIComponent(url.pathname.slice(1)),
  };
}

/**
 * Validates raw environment variables and maps them to the app's config shape.
 * Pure function: callers decide what to do with a failure.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ name: string, version: string }} appInfo
 */
export function parseEnv(env, appInfo) {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const vars = result.data;

  return {
    env: vars.NODE_ENV,
    isProduction: vars.NODE_ENV === 'production',
    isDevelopment: vars.NODE_ENV === 'development',
    isTest: vars.NODE_ENV === 'test',
    app: {
      name: appInfo.name,
      version: appInfo.version,
    },
    server: {
      host: vars.HOST,
      port: vars.PORT,
    },
    log: {
      level: vars.LOG_LEVEL,
    },
    cors: {
      origins: vars.CORS_ORIGIN,
    },
    database: {
      /** Contains credentials. Pass it to the driver only; never log or return it. */
      url: vars.DATABASE_URL,
      /** Host, port, and database name: safe to log. */
      target: describeDatabase(vars.DATABASE_URL),
      poolMax: vars.DATABASE_POOL_MAX,
      connectionTimeoutMs: vars.DATABASE_CONNECTION_TIMEOUT_MS,
      statementTimeoutMs: vars.DATABASE_STATEMENT_TIMEOUT_MS,
    },
  };
}
