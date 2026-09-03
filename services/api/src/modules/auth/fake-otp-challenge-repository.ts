import type { OtpChallengeData, OtpChallengeRepository } from './otp-challenge.repository';

interface Entry {
  data: OtpChallengeData;
  expiresAt: number;
}

/** In-memory OtpChallengeRepository for tests - same TTL/expiry semantics as the real Redis-backed one, without needing a real Redis. */
export class FakeOtpChallengeRepository implements OtpChallengeRepository {
  private readonly store = new Map<string, Entry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private read(challengeId: string): Entry | undefined {
    const entry = this.store.get(challengeId);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(challengeId);
      return undefined;
    }
    return entry;
  }

  async save(challengeId: string, data: OtpChallengeData, ttlSeconds: number): Promise<void> {
    this.store.set(challengeId, { data: { ...data }, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async get(challengeId: string): Promise<OtpChallengeData | null> {
    return this.read(challengeId)?.data ?? null;
  }

  async incrementAttempts(challengeId: string): Promise<number> {
    const entry = this.read(challengeId);
    if (!entry) return 0;
    entry.data.attempts += 1;
    return entry.data.attempts;
  }

  async markConsumed(challengeId: string): Promise<void> {
    const entry = this.read(challengeId);
    if (entry) entry.data.consumed = true;
  }
}
