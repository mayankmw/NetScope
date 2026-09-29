import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.schema.js';

const appInfo = { name: 'netscope-server', version: '0.0.0-test' };
const DATABASE_URL = 'postgres://netscope:s3cr3t-pa55@db.local:6543/netscope';

describe('parseEnv', () => {
  it('applies safe defaults when only DATABASE_URL is set', () => {
    const config = parseEnv({ DATABASE_URL }, appInfo);

    expect(config.env).toBe('development');
    expect(config.server).toEqual({ host: '127.0.0.1', port: 4000 });
    expect(config.log.level).toBe('info');
    expect(config.cors.origins).toEqual(['http://localhost:5173']);
    expect(config.database).toMatchObject({
      poolMax: 10,
      connectionTimeoutMs: 5000,
      statementTimeoutMs: 15000,
    });
  });

  it('coerces PORT and splits CORS_ORIGIN', () => {
    const config = parseEnv(
      { DATABASE_URL, PORT: '8080', CORS_ORIGIN: 'http://a.test, https://b.test' },
      appInfo,
    );

    expect(config.server.port).toBe(8080);
    expect(config.cors.origins).toEqual(['http://a.test', 'https://b.test']);
  });

  it('describes the database target without credentials', () => {
    const config = parseEnv({ DATABASE_URL }, appInfo);

    expect(config.database.target).toEqual({ host: 'db.local', port: 6543, name: 'netscope' });
    expect(JSON.stringify(config.database.target)).not.toContain('s3cr3t-pa55');
  });

  it('defaults the database port to 5432', () => {
    const config = parseEnv({ DATABASE_URL: 'postgresql://u:p@localhost/netscope' }, appInfo);

    expect(config.database.target.port).toBe(5432);
  });

  it('requires DATABASE_URL', () => {
    expect(() => parseEnv({}, appInfo)).toThrow('DATABASE_URL: is required');
  });

  it.each([
    [{ PORT: 'abc' }, 'PORT'],
    [{ PORT: '70000' }, 'PORT'],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
    [{ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
    [{ CORS_ORIGIN: 'not-a-url' }, 'CORS_ORIGIN'],
    [{ CORS_ORIGIN: 'ftp://files.test' }, 'CORS_ORIGIN'],
    [{ DATABASE_URL: 'mysql://u:p@localhost/netscope' }, 'DATABASE_URL'],
    [{ DATABASE_URL: 'postgres://u:p@localhost' }, 'DATABASE_URL'],
    [{ DATABASE_POOL_MAX: '0' }, 'DATABASE_POOL_MAX'],
    [{ DATABASE_STATEMENT_TIMEOUT_MS: 'soon' }, 'DATABASE_STATEMENT_TIMEOUT_MS'],
  ])('rejects invalid input %o', (overrides, variable) => {
    expect(() => parseEnv({ DATABASE_URL, ...overrides }, appInfo)).toThrow(variable);
  });

  it('never includes the database URL in validation errors', () => {
    const secretUrl = 'mysql://netscope:s3cr3t-pa55@localhost/netscope';

    expect(() => parseEnv({ DATABASE_URL: secretUrl }, appInfo)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('s3cr3t-pa55') }),
    );
  });
});
