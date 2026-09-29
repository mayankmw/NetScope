import { readFileSync } from 'node:fs';
import { parseEnv } from './env.schema.js';

// .env loading is a process-launch concern (`node --env-file-if-exists=.env`), not a config
// concern. This module only validates what is already in process.env, so production can
// inject variables however it likes.

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

function loadConfig() {
  try {
    return parseEnv(process.env, { name: 'netscope-server', version: pkg.version });
  } catch (error) {
    // The logger depends on config, so it cannot be used yet. Fail fast with a readable message.
    console.error(error.message);
    process.exit(1);
  }
}

function deepFreeze(object) {
  for (const value of Object.values(object)) {
    if (value && typeof value === 'object') deepFreeze(value);
  }
  return Object.freeze(object);
}

/** Validated, immutable application configuration. */
export const config = deepFreeze(loadConfig());
