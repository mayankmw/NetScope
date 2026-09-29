import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { toAppError } from '../../src/db/errors.js';

function databaseError(code) {
  const error = new pg.DatabaseError('database error', 0, 'error');
  error.code = code;
  return error;
}

function systemError(code) {
  return Object.assign(new Error(`connect ${code}`), { code });
}

describe('toAppError', () => {
  it('maps unique violations to 409 CONFLICT, keeping the driver error as cause', () => {
    const cause = databaseError('23505');
    const error = toAppError(cause);

    expect(error).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(error.cause).toBe(cause);
  });

  it.each([
    ['08006', 'connection failure'],
    ['28P01', 'bad password'],
    ['3D000', 'database does not exist'],
    ['53300', 'too many connections'],
    ['57P01', 'server shutting down'],
    ['57014', 'statement timeout'],
  ])('maps SQLSTATE %s (%s) to 503 DATABASE_UNAVAILABLE', (code) => {
    expect(toAppError(databaseError(code))).toMatchObject({
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
    });
  });

  it.each(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'])(
    'maps socket error %s to 503 DATABASE_UNAVAILABLE',
    (code) => {
      expect(toAppError(systemError(code))).toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    },
  );

  it('maps pool connection timeouts to 503 DATABASE_UNAVAILABLE', () => {
    const error = new Error('timeout exceeded when trying to connect');

    expect(toAppError(error)).toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
  });

  it.each([
    ['23514', 'check violation'],
    ['23503', 'foreign key violation'],
    ['42601', 'syntax error'],
  ])('leaves SQLSTATE %s (%s) unmapped so it surfaces as a 500', (code) => {
    expect(toAppError(databaseError(code))).toBeNull();
  });

  it('leaves unrelated errors unmapped', () => {
    expect(toAppError(new Error('boom'))).toBeNull();
    expect(toAppError('not an error')).toBeNull();
  });
});
