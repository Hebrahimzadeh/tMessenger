import type Redis from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  /** Only set when `allowed` is false - seconds until the caller may retry. */
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  /** Consumes one unit of `key`'s budget within a fixed window and reports whether it was allowed. */
  consume(key: string): Promise<RateLimitResult>;
}

/**
 * Fixed-window rate limiter: `key` may be consumed up to `limit` times per
 * `windowSeconds`, then every further call is rejected until the window
 * rolls over. Task 32 adds a general route-level rate-limit plugin later -
 * this one is scoped specifically to OTP request (per Task 06's own
 * acceptance test), keyed by phoneHash so it throttles per target number
 * regardless of which client/IP is asking.
 */
export function createRedisRateLimiter(redis: Redis, limit: number, windowSeconds: number): RateLimiter {
  return {
    async consume(key) {
      const redisKey = `ratelimit:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        // Only the request that actually created the counter sets its
        // expiry, so a concurrent second request can't reset the window.
        await redis.expire(redisKey, windowSeconds);
      }

      if (count > limit) {
        const ttl = await redis.ttl(redisKey);
        return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
      }

      return { allowed: true };
    },
  };
}

/** In-memory RateLimiter for tests - same fixed-window semantics as the Redis-backed one. */
export function createFakeRateLimiter(
  limit: number,
  windowSeconds: number,
  now: () => number = () => Date.now()
): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    async consume(key) {
      const current = now();
      const existing = windows.get(key);

      const window = existing && existing.resetAt > current ? existing : { count: 0, resetAt: current + windowSeconds * 1000 };
      window.count += 1;
      windows.set(key, window);

      if (window.count > limit) {
        return { allowed: false, retryAfterSeconds: Math.ceil((window.resetAt - current) / 1000) };
      }
      return { allowed: true };
    },
  };
}
