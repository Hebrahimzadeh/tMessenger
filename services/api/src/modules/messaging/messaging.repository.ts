import type { PrismaClient } from '@taavon/database';
import { createPrismaDirectConversationPort } from './direct-conversation.repository';
import type { ConversationRecord, MessageRecord, MessagingRepository, ReceiptRecord } from './messaging.service';

/** Mirrors direct-conversation.repository.ts's own pair key, for the assistant's one-per-person thread. */
function assistantPairKey(userId: string): string {
  return `assistant:${userId}`;
}

type ConversationRow = {
  id: string;
  kind: 'DIRECT' | 'SYSTEM_ASSISTANT';
  createdAt: Date;
  members: { userId: string }[];
  messages: { createdAt: Date }[];
};

function toConversationRecord(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.createdAt,
    memberIds: row.members.map((m) => m.userId),
    lastMessageAt: row.messages[0]?.createdAt ?? null,
  };
}

/**
 * Selects a conversation's members as bare user ids and its latest activity
 * as a bare timestamp. Nothing here reaches for the member's `user`
 * relation, so a phone number, identity claim or profile cannot travel with
 * a conversation even if a later serializer forgot to strip it - the row
 * never holds one.
 */
const CONVERSATION_SHAPE = {
  members: { select: { userId: true }, orderBy: { createdAt: 'asc' as const } },
  messages: { select: { createdAt: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
};

type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderKind: 'USER' | 'SYSTEM_ASSISTANT';
  status: 'VISIBLE' | 'DELETED';
  body: string | null;
  revisionCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function toMessageRecord(row: MessageRow): MessageRecord {
  return { ...row };
}

async function loadConversation(prisma: PrismaClient, id: string): Promise<ConversationRecord | null> {
  const row = await prisma.conversation.findUnique({ where: { id }, include: CONVERSATION_SHAPE });
  return row ? toConversationRecord(row as ConversationRow) : null;
}

export function createPrismaMessagingRepository(prisma: PrismaClient): MessagingRepository {
  const directPort = createPrismaDirectConversationPort();

  return {
    findConversation(conversationId) {
      return loadConversation(prisma, conversationId);
    },

    async isMember(conversationId, userId) {
      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
        select: { id: true },
      });
      return member !== null;
    },

    async userExists(userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      return user !== null;
    },

    async getOrCreateDirect(userAId, userBId) {
      // Task 16's port, reused through its existing signature rather than
      // reimplemented: one definition of "the same pair is the same
      // conversation", shared by the reservation flow and by this module.
      try {
        const { conversationId } = await prisma.$transaction((tx) =>
          directPort.getOrCreateDirectConversation(tx, userAId, userBId)
        );
        return (await loadConversation(prisma, conversationId))!;
      } catch (err) {
        // The port already retries a lost race, but it does so with the
        // same transaction client that just hit the unique violation, and
        // Postgres refuses every further statement in a transaction after
        // an error ("current transaction is aborted"). So its recovery can
        // only ever succeed when the caller supplies a *fresh* transaction,
        // which is what this does. The port's own signature is untouched,
        // per Task 19's constraint; the retry simply happens where it can
        // actually work.
        const raced = await prisma.conversation.findUnique({
          where: { pairKey: [userAId, userBId].sort().join(':') },
          select: { id: true },
        });
        if (raced) return (await loadConversation(prisma, raced.id))!;
        throw err;
      }
    },

    async getOrCreateAssistant(userId) {
      const pairKey = assistantPairKey(userId);

      const existing = await prisma.conversation.findUnique({ where: { pairKey }, select: { id: true } });
      if (existing) return (await loadConversation(prisma, existing.id))!;

      try {
        const created = await prisma.$transaction(async (tx) => {
          const conversation = await tx.conversation.create({
            data: { kind: 'SYSTEM_ASSISTANT', pairKey },
            select: { id: true },
          });
          // The owner is the only member. The assistant has no user row and
          // is deliberately not a member of its own thread, so there is
          // nothing to add anyone to and no identity to impersonate.
          await tx.conversationMember.create({ data: { conversationId: conversation.id, userId } });
          return conversation;
        });
        return (await loadConversation(prisma, created.id))!;
      } catch {
        // Two first requests raced; the unique pairKey decided the winner.
        // Read that row rather than failing a request that asked for
        // something which now exists.
        const raced = await prisma.conversation.findUnique({ where: { pairKey }, select: { id: true } });
        if (raced) return (await loadConversation(prisma, raced.id))!;
        throw new Error('Assistant conversation could not be created or found.');
      }
    },

    async listConversationsForUser(userId, { limit, before }) {
      // Ordered by most recent activity, falling back to creation for a
      // thread nobody has written in yet, with `id` breaking exact ties so
      // the keyset boundary is stable.
      const rows = await prisma.conversation.findMany({
        where: { members: { some: { userId } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: CONVERSATION_SHAPE,
      });

      const records = rows
        .map((row) => toConversationRecord(row as ConversationRow))
        .sort((a, b) => {
          const aAt = (a.lastMessageAt ?? a.createdAt).getTime();
          const bAt = (b.lastMessageAt ?? b.createdAt).getTime();
          return bAt - aAt || (a.id < b.id ? 1 : -1);
        });

      const after = before
        ? records.findIndex(
            (r) => (r.lastMessageAt ?? r.createdAt).toISOString() === before.lastActivityAt && r.id === before.id
          )
        : -1;

      return records.slice(after + 1, after + 1 + limit);
    },

    async countUnread(conversationId, userId) {
      const receipt = await prisma.messageReceipt.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
        select: { lastReadAt: true },
      });

      return prisma.message.count({
        where: {
          conversationId,
          status: 'VISIBLE',
          // The caller's own messages are never unread to them.
          NOT: { senderId: userId },
          ...(receipt ? { createdAt: { gt: receipt.lastReadAt } } : {}),
        },
      });
    },

    async listMessages(conversationId, { limit, before }) {
      const rows = await prisma.message.findMany({
        where: {
          conversationId,
          ...(before
            ? {
                OR: [
                  { createdAt: { lt: new Date(before.createdAt) } },
                  { createdAt: new Date(before.createdAt), id: { lt: before.id } },
                ],
              }
            : {}),
        },
        // Newest first: a chat opens at the bottom, and paging back walks
        // into history.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
      return rows.map((row) => toMessageRecord(row as MessageRow));
    },

    async findMessage(messageId) {
      const row = await prisma.message.findUnique({ where: { id: messageId } });
      return row ? toMessageRecord(row as MessageRow) : null;
    },

    async insertMessage({ conversationId, senderId, senderKind, body }) {
      const row = await prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: { conversationId, senderId, senderKind, body, revisionCount: 1 },
        });
        await tx.messageRevision.create({
          data: { messageId: message.id, revisionNumber: 1, body, editorId: senderId },
        });
        // No awareness event, no outbox event, no audit row carrying text.
        // Task 16 already logs PRIVATE_CHAT_STARTED when a reservation opens
        // the conversation, which is the only awareness signal private
        // messaging produces - counting messages would turn private
        // conversation into a measured activity, which this milestone's
        // whole premise rules out. The canary test asserts this directly.
        return message;
      });
      return toMessageRecord(row as MessageRow);
    },

    async addRevision({ messageId, editorId, body }) {
      const row = await prisma.$transaction(async (tx) => {
        const latest = await tx.messageRevision.findFirst({
          where: { messageId },
          orderBy: { revisionNumber: 'desc' },
          select: { revisionNumber: true },
        });
        const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
        await tx.messageRevision.create({ data: { messageId, revisionNumber, body, editorId } });
        return tx.message.update({ where: { id: messageId }, data: { body, revisionCount: revisionNumber } });
      });
      return toMessageRecord(row as MessageRow);
    },

    async softDelete({ messageId, actorId, correlationId }) {
      const row = await prisma.$transaction(async (tx) => {
        const message = await tx.message.update({
          where: { id: messageId },
          // Clearing `body` is what makes this a real deletion from every
          // reader's point of view; the revision rows keep the original for
          // M6's report path, which is the only path allowed to see it.
          data: { status: 'DELETED', deletedAt: new Date(), body: null },
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'message.deleted',
            targetType: 'Message',
            targetId: messageId,
            correlationId,
            // "audit فقط metadata لازم داشته باشد، نه متن پیام" - the
            // conversation id and nothing else. No body, no excerpt, no
            // length, no recipient.
            metadata: { conversationId: message.conversationId },
          },
        });
        return message;
      });
      return toMessageRecord(row as MessageRow);
    },

    async upsertReceipt({ conversationId, userId, lastReadMessageId }): Promise<ReceiptRecord> {
      const now = new Date();
      const row = await prisma.messageReceipt.upsert({
        where: { conversationId_userId: { conversationId, userId } },
        create: { conversationId, userId, lastReadMessageId, lastReadAt: now },
        update: { lastReadMessageId, lastReadAt: now },
      });
      return {
        conversationId: row.conversationId,
        userId: row.userId,
        lastReadMessageId: row.lastReadMessageId,
        lastReadAt: row.lastReadAt,
      };
    },
  };
}
