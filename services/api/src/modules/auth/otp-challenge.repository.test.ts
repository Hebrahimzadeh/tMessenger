import Redis from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeOtpChallengeRepository } from './fake-otp-challenge-repository';
import { createRedisOtpChallengeRepository, type OtpChallengeData, type OtpChallengeRepository } from './otp-challenge.repository';

const sampleChallenge: OtpChallengeData = {
  deliverable: true,
  phoneHash: 'hash-abc',
  phoneCiphertext: 'ciphertext-abc',
  codeHmac: 'code-hmac-abc',
  attempts: 0,
  consumed: false,
  termsVersion: 1,
  privacyVersion: 1,
};

/** One shared contract, run against every OtpChallengeRepository implementation - same pattern as storage.test.ts's StorageProvider contract. */
function otpChallengeRepositoryContract(name: string, getRepo: () => OtpChallengeRepository) {
  it(`${name}: get returns null for a challenge that was never saved`, async () => {
    await expect(getRepo().get(`never-saved-${name}`)).resolves.toBeNull();
  });

  it(`${name}: save then get round-trips the full record`, async () => {
    const id = `roundtrip-${name}-${Date.now()}`;
    const repo = getRepo();
    await repo.save(id, sampleChallenge, 300);
    await expect(repo.get(id)).resolves.toEqual(sampleChallenge);
  });

  it(`${name}: save preserves a non-deliverable challenge's null fields`, async () => {
    const id = `nondeliverable-${name}-${Date.now()}`;
    const repo = getRepo();
    const nonDeliverable: OtpChallengeData = {
      ...sampleChallenge,
      deliverable: false,
      phoneHash: null,
      phoneCiphertext: null,
      codeHmac: null,
    };
    await repo.save(id, nonDeliverable, 300);
    await expect(repo.get(id)).resolves.toEqual(nonDeliverable);
  });

  it(`${name}: incrementAttempts increases the count and persists it`, async () => {
    const id = `attempts-${name}-${Date.now()}`;
    const repo = getRepo();
    await repo.save(id, sampleChallenge, 300);

    await expect(repo.incrementAttempts(id)).resolves.toBe(1);
    await expect(repo.incrementAttempts(id)).resolves.toBe(2);
    await expect(repo.get(id)).resolves.toMatchObject({ attempts: 2 });
  });

  it(`${name}: markConsumed flips consumed without touching other fields`, async () => {
    const id = `consumed-${name}-${Date.now()}`;
    const repo = getRepo();
    await repo.save(id, sampleChallenge, 300);

    await repo.markConsumed(id);

    await expect(repo.get(id)).resolves.toEqual({ ...sampleChallenge, consumed: true });
  });
}

describe('OtpChallengeRepository contract: fake', () => {
  otpChallengeRepositoryContract('fake', () => new FakeOtpChallengeRepository());

  it('fake: expires a challenge after its TTL', async () => {
    let now = 1_000_000;
    const repo = new FakeOtpChallengeRepository(() => now);
    await repo.save('expiring', sampleChallenge, 5);

    now += 4_000;
    await expect(repo.get('expiring')).resolves.not.toBeNull();

    now += 2_000;
    await expect(repo.get('expiring')).resolves.toBeNull();
  });
});

// The Redis-backed contract needs a real Redis (`docker compose up -d
// redis`). Gated on a real runtime probe at module top-level, before Vitest
// collects the describe/it tree - same pattern storage.test.ts and
// bootstrap.test.ts already established: `npm run test` never hard-fails
// without the real dependency, `npm run test:integration` genuinely
// exercises it wherever that stack is actually up.
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

describe.skipIf(!redisClient)('OtpChallengeRepository contract: Redis', () => {
  afterAll(async () => {
    await redisClient?.quit();
  });

  otpChallengeRepositoryContract('redis', () => createRedisOtpChallengeRepository(redisClient!));
});
