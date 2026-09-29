import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

// Tests never use the development database. TEST_DATABASE_URL comes from the shell or from
// server/.env; tests/setup/globalSetup.js validates it and migrates it before any test runs.
const envFile = new URL('./.env', import.meta.url);
if (!process.env.TEST_DATABASE_URL && existsSync(envFile)) {
  const { TEST_DATABASE_URL } = parseEnv(readFileSync(envFile, 'utf8'));
  if (TEST_DATABASE_URL) process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: ['tests/setup/globalSetup.js'],
    // Database tests share one database; run files one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
    },
  },
});
