import { Prisma } from '@taavon/database';
import type { DirectConversationPort, DirectConversationResult } from './direct-conversation.port';

function pairKeyFor(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join(':');
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export function createPrismaDirectConversationPort(): DirectConversationPort {
  return {
    async getOrCreateDirectConversation(tx, userAId, userBId): Promise<DirectConversationResult> {
      const pairKey = pairKeyFor(userAId, userBId);

      const existing = await tx.conversation.findUnique({ where: { pairKey }, select: { id: true } });
      if (existing) return { conversationId: existing.id, created: false };

      try {
        const conversation = await tx.conversation.create({ data: { kind: 'DIRECT', pairKey } });
        await tx.conversationMember.createMany({
          data: [
            { conversationId: conversation.id, userId: userAId },
            { conversationId: conversation.id, userId: userBId },
          ],
        });
        return { conversationId: conversation.id, created: true };
      } catch (err) {
        // A concurrent reserve between the same two users raced us to
        // create the pair's conversation - the unique `pairKey` constraint
        // is what actually serializes this, not application logic. Fall
        // back to reading the winner's row rather than surfacing an error.
        if (isUniqueConstraintViolation(err)) {
          const raced = await tx.conversation.findUnique({ where: { pairKey }, select: { id: true } });
          if (raced) return { conversationId: raced.id, created: false };
        }
        throw err;
      }
    },
  };
}
