import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const validEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY: 'access-key',
  S3_SECRET_KEY: 'secret-key',
  SESSION_HMAC_KEY: 'a-reasonably-long-dev-session-key',
  PHONE_ENCRYPTION_KEY: 'a-reasonably-long-dev-phone-key',
  APP_ORIGIN: 'http://localhost:4300',
};

describe('parseEnv', () => {
  it('parses a valid, complete environment', () => {
    const env = parseEnv(validEnv);
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.NODE_ENV).toBe('development');
  });

  it('defaults NODE_ENV to development and PORT to 4000', () => {
    const { NODE_ENV: _omit, ...rest } = validEnv;
    const env = parseEnv(rest);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
  });

  const requiredKeys = [
    'DATABASE_URL',
    'REDIS_URL',
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'SESSION_HMAC_KEY',
    'PHONE_ENCRYPTION_KEY',
    'APP_ORIGIN',
  ] as const;

  for (const key of requiredKeys) {
    it(`rejects a missing ${key}`, () => {
      const rest = { ...validEnv };
      delete (rest as Record<string, string | undefined>)[key];
      expect(() => parseEnv(rest)).toThrow();
    });
  }

  it('rejects an APP_ORIGIN that is not a URL', () => {
    expect(() => parseEnv({ ...validEnv, APP_ORIGIN: 'not-a-url' })).toThrow();
  });

  it('rejects a SESSION_HMAC_KEY shorter than 16 characters, even in development', () => {
    expect(() => parseEnv({ ...validEnv, SESSION_HMAC_KEY: 'too-short' })).toThrow();
  });

  it('allows a 16+ character secret in development', () => {
    expect(() => parseEnv({ ...validEnv, SESSION_HMAC_KEY: 'short-dev-key-16' })).not.toThrow();
  });

  it('fails fast in production when SESSION_HMAC_KEY is shorter than 32 characters', () => {
    expect(() =>
      parseEnv({ ...validEnv, NODE_ENV: 'production', SESSION_HMAC_KEY: 'sixteen-plus-chars-but-not-32' })
    ).toThrow(/at least 32 characters/);
  });

  it('fails fast in production when PHONE_ENCRYPTION_KEY is shorter than 32 characters', () => {
    expect(() =>
      parseEnv({ ...validEnv, NODE_ENV: 'production', PHONE_ENCRYPTION_KEY: 'sixteen-plus-chars-but-not-32' })
    ).toThrow(/at least 32 characters/);
  });

  it('fails fast in production when a secret matches a known placeholder pattern', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NODE_ENV: 'production',
        SESSION_HMAC_KEY: 'changeme-changeme-changeme-please-32chars',
      })
    ).toThrow(/placeholder/);
  });

  it('accepts a long, non-placeholder secret in production', () => {
    const strongKey = 'x7f2kQ9mZ1pR4vT6wY8bC0dE3gH5jL7nA9sD2fG4hJ6k';
    expect(() =>
      parseEnv({
        ...validEnv,
        NODE_ENV: 'production',
        SESSION_HMAC_KEY: strongKey,
        PHONE_ENCRYPTION_KEY: strongKey,
      })
    ).not.toThrow();
  });

  it('does not fail-fast on strength in non-production environments', () => {
    expect(() => parseEnv({ ...validEnv, NODE_ENV: 'test', SESSION_HMAC_KEY: 'changeme-16chars' })).not.toThrow();
  });
});
