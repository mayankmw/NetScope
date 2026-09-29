import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

/**
 * Environment variables consumed in Step 1. Later steps extend this schema
 * (DATABASE_URL, WS_*, SCAN_*, ...) — see docs/ARCHITECTURE.md#environment-variables.
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
});

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
  };
}
