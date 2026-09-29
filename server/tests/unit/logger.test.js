import { describe, expect, it } from 'vitest';
import { serializeError } from '../../src/utils/logger.js';

describe('serializeError', () => {
  it('keeps diagnostic fields but drops driver internals', () => {
    const error = Object.assign(new Error('terminating connection'), {
      code: '57P01',
      client: { connectionParameters: { user: 'netscope', host: 'db.local' } },
    });

    const serialized = serializeError(error);

    expect(serialized).toMatchObject({
      type: 'Error',
      message: 'terminating connection',
      code: '57P01',
    });
    expect(serialized.stack).toEqual(expect.any(String));
    expect(serialized).not.toHaveProperty('client');
  });
});
