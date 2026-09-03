import { randomUUID } from 'node:crypto';
import type { NewSession, SessionRecord, SessionRepository } from './session.repository';

/** In-memory SessionRepository for tests - same semantics as the Prisma-backed one. */
export class FakeSessionRepository implements SessionRepository {
  private readonly byId = new Map<string, SessionRecord>();
  private readonly byRefreshHash = new Map<string, string>();

  async create(input: NewSession): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenFamilyId: input.tokenFamilyId,
      refreshHash: input.refreshHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      deviceId: input.deviceId ?? null,
    };
    this.byId.set(record.id, record);
    this.byRefreshHash.set(record.refreshHash, record.id);
    return { ...record };
  }

  async findByRefreshHash(refreshHash: string): Promise<SessionRecord | null> {
    const id = this.byRefreshHash.get(refreshHash);
    if (!id) return null;
    const record = this.byId.get(id);
    return record ? { ...record } : null;
  }

  async revoke(sessionId: string): Promise<void> {
    const record = this.byId.get(sessionId);
    if (record && !record.revokedAt) record.revokedAt = new Date();
  }

  async revokeFamily(tokenFamilyId: string): Promise<void> {
    const now = new Date();
    for (const record of this.byId.values()) {
      if (record.tokenFamilyId === tokenFamilyId && !record.revokedAt) {
        record.revokedAt = now;
      }
    }
  }
}
