import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.schema.js';

const appInfo = { name: 'netscope-server', version: '0.0.0-test' };

describe('parseEnv', () => {
  it('applies safe defaults when nothing is set', () => {
    const config = parseEnv({}, appInfo);

    expect(config.env).toBe('development');
    expect(config.server).toEqual({ host: '127.0.0.1', port: 4000 });
    expect(config.log.level).toBe('info');
    expect(config.cors.origins).toEqual(['http://localhost:5173']);
  });

  it('coerces PORT and splits CORS_ORIGIN', () => {
    const config = parseEnv(
      { PORT: '8080', CORS_ORIGIN: 'http://a.test, https://b.test' },
      appInfo,
    );

    expect(config.server.port).toBe(8080);
    expect(config.cors.origins).toEqual(['http://a.test', 'https://b.test']);
  });

  it.each([
    [{ PORT: 'abc' }, 'PORT'],
    [{ PORT: '70000' }, 'PORT'],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
    [{ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
    [{ CORS_ORIGIN: 'not-a-url' }, 'CORS_ORIGIN'],
    [{ CORS_ORIGIN: 'ftp://files.test' }, 'CORS_ORIGIN'],
  ])('rejects invalid input %o', (env, variable) => {
    expect(() => parseEnv(env, appInfo)).toThrow(variable);
  });
});
