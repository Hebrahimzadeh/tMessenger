import type { PrismaClient } from '@taavon/database';
import type { NotificationRecord, NotificationRepository } from './notification.service';

const DEFAULT_PREFERENCES = { privateMessagePreview: true };

export function createPrismaNotificationRepository(prisma: PrismaClient): NotificationRepository {
  return {
    async listForRecipient(recipientId, { limit, before }) {
      const rows = await prisma.notification.findMany({
        // Scoped to the recipient in the query itself, not filtered
        // afterwards - there is no shape of input that could widen it.
        where: {
          recipientId,
          ...(before
            ? {
                OR: [
                  { createdAt: { lt: new Date(before.createdAt) } },
                  { createdAt: new Date(before.createdAt), id: { lt: before.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
      return rows as NotificationRecord[];
    },

    async countUnread(recipientId) {
      return prisma.notification.count({ where: { recipientId, readAt: null } });
    },

    async markRead(recipientId, ids) {
      const result = await prisma.notification.updateMany({
        // `recipientId` is always part of the filter, so naming someone
        // else's id marks nothing and reports nothing back about it.
        where: {
          recipientId,
          readAt: null,
          ...(ids === 'all' ? {} : { id: { in: ids } }),
        },
        data: { readAt: new Date() },
      });
      return result.count;
    },

    async getPreferences(recipientId) {
      const row = await prisma.notificationPreference.findUnique({
        where: { userId: recipientId },
        select: { privateMessagePreview: true },
      });
      // Absent means the defaults, so someone who never opened settings still
      // has working, predictable behaviour.
      return row ?? DEFAULT_PREFERENCES;
    },

    async setPreferences(recipientId, prefs) {
      const row = await prisma.notificationPreference.upsert({
        where: { userId: recipientId },
        create: { userId: recipientId, ...DEFAULT_PREFERENCES, ...prefs },
        update: { ...prefs },
        select: { privateMessagePreview: true },
      });
      return row;
    },

    async resolveMessagePreviews(recipientId, messageIds) {
      if (messageIds.length === 0) return new Map();

      const rows = await prisma.message.findMany({
        where: {
          id: { in: messageIds },
          status: 'VISIBLE',
          // Membership is re-checked here rather than trusted from the
          // notification row: a notification is a pointer, and a pointer must
          // never be the thing that authorises a read. A message in a
          // conversation this person is no longer in yields no preview.
          conversation: { members: { some: { userId: recipientId } } },
        },
        select: { id: true, body: true },
      });

      const previews = new Map<string, string>();
      for (const row of rows) {
        if (row.body) previews.set(row.id, row.body);
      }
      return previews;
    },
  };
}
