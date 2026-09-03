import type Redis from 'ioredis';

/**
 * `deliverable: false` represents a challenge that was issued (so the HTTP
 * response is identical to a real one - see auth.service.ts's requestOtp)
 * but can never be completed: an unparseable phone number or a country with
 * no active SMS route. `phoneHash`/`phoneCiphertext`/`codeHmac` are null in
 * that case - there is nothing valid to check a code against, so verify
 * fails the same way a wrong code would.
 */
export interface OtpChallengeData {
  deliverable: boolean;
  phoneHash: string | null;
  phoneCiphertext: string | null;
  codeHmac: string | null;
  attempts: number;
  consumed: boolean;
  termsVersion: number;
  privacyVersion: number;
}

export interface OtpChallengeRepository {
  save(challengeId: string, data: OtpChallengeData, ttlSeconds: number): Promise<void>;
  get(challengeId: string): Promise<OtpChallengeData | null>;
  /** Atomically increments and returns the new attempt count. */
  incrementAttempts(challengeId: string): Promise<number>;
  /** Marks the challenge used, without resetting its remaining TTL - a replay of an already-consumed challengeId still gets a real (not "not found") response until it naturally expires. */
  markConsumed(challengeId: string): Promise<void>;
}

function keyFor(challengeId: string): string {
  return `otp:challenge:${challengeId}`;
}

const NULLABLE_STRING_FIELDS = ['phoneHash', 'phoneCiphertext', 'codeHmac'] as const;

/** Redis-backed OtpChallengeRepository. Stored as a hash so incrementAttempts (HINCRBY) is atomic under concurrent verify attempts. */
export function createRedisOtpChallengeRepository(redis: Redis): OtpChallengeRepository {
  return {
    async save(challengeId, data, ttlSeconds) {
      const key = keyFor(challengeId);
      const fields: Record<string, string> = {
        deliverable: data.deliverable ? '1' : '0',
        consumed: data.consumed ? '1' : '0',
        attempts: String(data.attempts),
        termsVersion: String(data.termsVersion),
        privacyVersion: String(data.privacyVersion),
      };
      // Redis hash fields can't hold null - nullable fields are simply
      // omitted when null, and read back as null by `get` when absent.
      for (const field of NULLABLE_STRING_FIELDS) {
        if (data[field] !== null) fields[field] = data[field];
      }

      await redis.del(key); // clears any stale fields from a previous save under the same id (should never happen, but keeps `save` a true replace, not a merge)
      await redis.hset(key, fields);
      await redis.expire(key, ttlSeconds);
    },

    async get(challengeId) {
      const raw = await redis.hgetall(keyFor(challengeId));
      if (!raw || Object.keys(raw).length === 0) return null;

      const result = {
        deliverable: raw.deliverable === '1',
        consumed: raw.consumed === '1',
        attempts: Number(raw.attempts ?? '0'),
        termsVersion: Number(raw.termsVersion),
        privacyVersion: Number(raw.privacyVersion),
      } as OtpChallengeData;

      for (const field of NULLABLE_STRING_FIELDS) {
        result[field] = raw[field] ?? null;
      }

      return result;
    },

    async incrementAttempts(challengeId) {
      return redis.hincrby(keyFor(challengeId), 'attempts', 1);
    },

    async markConsumed(challengeId) {
      await redis.hset(keyFor(challengeId), { consumed: '1' });
    },
  };
}
