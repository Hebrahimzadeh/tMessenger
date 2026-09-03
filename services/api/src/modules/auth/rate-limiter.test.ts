import Redis from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { createFakeRateLimiter, createRedisRateLimiter, type RateLimiter } from './rate-limiter';

function rateLimiterContract(name: string, makeLimiter: () => RateLimiter) {
  it(`${name}: allows up to the limit, then rejects with a positive retryAfterSeconds`, async () => {
    const limiter = makeLimiter();
    const key = `${name}-${Date.now()}`;

    for (let i = 0; i < 3; i += 1) {
      await expect(limiter.consume(key)).resolves.toEqual({ allowed: true });
    }

    const rejected = await limiter.consume(key);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  it(`${name}: tracks separate keys independently`, async () => {
    const limiter = makeLimiter();
    const keyA = `${name}-a-${Date.now()}`;
    const keyB = `${name}-b-${Date.now()}`;

    for (let i = 0; i < 3; i += 1) {
      await limiter.consume(keyA);
    }
    await expect(limiter.consume(keyA)).resolves.toMatchObject({ allowed: false });
    await expect(limiter.consume(keyB)).resolves.toEqual({ allowed: true });
  });
}

describe('RateLimiter contract: fake (limit 3 per 60s)', () => {
  rateLimiterContract('fake', () => createFakeRateLimiter(3, 60));

  it('fake: resets after the window elapses', async () => {
    let now = 0;
    const limiter = createFakeRateLimiter(3, 10, () => now);
    const key = 'reset-key';

    for (let i = 0; i < 3; i += 1) await limiter.consume(key);
    await expect(limiter.consume(key)).resolves.toMatchObject({ allowed: false });

    now += 11_000;
    await expect(limiter.consume(key)).resolves.toEqual({ allowed: true });
  });
});

async function probeRedisAvailability(): Promise<Redis | null> {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const client = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 2000, lazyConnect: true });
  try {
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000));
    const attempt = client.connect().then(() => client.ping()).then(() => 'ok' as const);
    const result = await Promise.race([attempt, timeout]);
    if (result !== 'ok') {
      await client.quit().catch(() => undefined);
      return null;
    }
    return client;
  } catch {
    await client.quit().catch(() => undefined);
    return null;
  }
}

const redisClient = await probeRedisAvailability();

describe.skipIf(!redisClient)('RateLimiter contract: Redis (limit 3 per 60s)', () => {
  afterAll(async () => {
    await redisClient?.quit();
  });

  rateLimiterContract('redis', () => createRedisRateLimiter(redisClient!, 3, 60));
});
