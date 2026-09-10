import type { Prisma } from '@taavon/database';

export interface DirectConversationResult {
  conversationId: string;
  /** True only when this call is the one that actually created the row - useful for tests/telemetry, never required for correctness. */
  created: boolean;
}

/**
 * "getOrCreateDirectConversation(ownerId,reserverId) را idempotent بساز" -
 * the same unordered pair of users always resolves to the same one
 * conversation, reused across every reservation they ever share. Takes an
 * already-open transaction client so a caller (reservation.repository.ts)
 * can compose it into its own transaction - "شکست ساخت گفتگو رزرو
 * نیمه‌کاره باقی نگذارد": if this throws, the whole transaction (including
 * the reservation write) rolls back together.
 */
export interface DirectConversationPort {
  getOrCreateDirectConversation(
    tx: Prisma.TransactionClient,
    userAId: string,
    userBId: string
  ): Promise<DirectConversationResult>;
}
