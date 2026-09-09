import { describe, expect, it } from 'vitest';
import { parseWorkerEnv } from './env';

describe('parseWorkerEnv', () => {
  it('parses a valid environment', () => {
    const env = parseWorkerEnv({ DATABASE_URL: 'postgres://x', REDIS_URL: 'redis://x' });
    expect(env).toEqual({ DATABASE_URL: 'postgres://x', REDIS_URL: 'redis://x' });
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => parseWorkerEnv({ REDIS_URL: 'redis://x' })).toThrow('DATABASE_URL');
  });

  it('rejects a missing REDIS_URL', () => {
    expect(() => parseWorkerEnv({ DATABASE_URL: 'postgres://x' })).toThrow('REDIS_URL');
  });
});
