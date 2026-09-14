import { afterAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaNotificationJobRepository } from '@taavon/notifications';
import { createPrismaMessagingRepository } from '../messaging/messaging.repository';
import { createPrismaNotificationRepository } from './notification.repository';
import { listNotifications, markNotificationsRead } from './notification.service';

async function probeDatabaseAvailability(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000));
    const probe = getPrisma().$queryRaw`SELECT 1`.then(() => 'ok' as const);
    return (await Promise.race([probe, timeout])) === 'ok';
  } catch {
    return false;
  }
}

const databaseAvailable = await probeDatabaseAvailability();

describe.skipIf(!databaseAvailable)('notifications against real Postgres', () => {
  const prisma = getPrisma();
  const repo = createPrismaNotificationRepository(prisma);
  const createdUserIds: string[] = [];
  const createdConversationIds: string[] = [];

  async function newUser() {
    const user = await prisma.user.create({ data: {} });
    createdUserIds.push(user.id);
    return user.id;
  }

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { recipientId: { in: createdUserIds } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.messageRevision.deleteMany({ where: { message: { conversationId: { in: createdConversationIds } } } });
    await prisma.message.deleteMany({ where: { conversationId: { in: createdConversationIds } } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: { in: createdConversationIds } } });
    await prisma.conversation.deleteMany({ where: { id: { in: createdConversationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it('refuses a second notification under the same dedupKey, which is what makes the consumer safe to retry', async () => {
    const jobRepo = createPrismaNotificationJobRepository(prisma);
    const recipientId = await newUser();
    const intent = {
      recipientId,
      type: 'NEW_PUBLIC_REPLY' as const,
      dedupKey: `dedup-test-${Date.now()}`,
      subjectType: 'CardComment',
      subjectId: recipientId,
      deepLink: '/cards/x',
    };

    await expect(jobRepo.createIfNew(intent)).resolves.toBe(true);
    // The unique index decides, not the consumer's memory of what it has done.
    await expect(jobRepo.createIfNew(intent)).resolves.toBe(false);

    const rows = await prisma.notification.count({ where: { dedupKey: intent.dedupKey } });
    expect(rows).toBe(1);
  });

  it('creates exactly one IN_APP delivery alongside the notification', async () => {
    const jobRepo = createPrismaNotificationJobRepository(prisma);
    const recipientId = await newUser();
    const dedupKey = `delivery-test-${Date.now()}`;

    await jobRepo.createIfNew({
      recipientId,
      type: 'SPACE_GUIDANCE',
      dedupKey,
      subjectType: 'Space',
      subjectId: recipientId,
      deepLink: '/spaces/x',
    });

    const notification = await prisma.notification.findUnique({
      where: { dedupKey },
      include: { deliveries: { select: { channel: true, deliveredAt: true } } },
    });
    expect(notification?.deliveries).toHaveLength(1);
    expect(notification?.deliveries[0]?.channel).toBe('IN_APP');
    expect(notification?.deliveries[0]?.deliveredAt).not.toBeNull();
  });

  it('never lets one person mark, or even see, another\'s', async () => {
    const alice = await newUser();
    const bob = await newUser();

    const hers = await prisma.notification.create({
      data: {
        recipientId: alice,
        type: 'NEW_PUBLIC_REPLY',
        dedupKey: `scope-a-${Date.now()}`,
        subjectType: 'CardComment',
        subjectId: alice,
        deepLink: '/cards/a',
      },
    });

    const bobsView = await listNotifications(repo, bob, { limit: 50 });
    expect(bobsView.items.map((n) => n.id)).not.toContain(hers.id);

    const attempt = await markNotificationsRead(repo, bob, { ids: [hers.id] });
    expect(attempt.updated).toBe(0);
    await expect(
      prisma.notification.findUnique({ where: { id: hers.id }, select: { readAt: true } })
    ).resolves.toEqual({ readAt: null });
  });

  it('marks everything of the caller\'s and nothing of anyone else\'s', async () => {
    const alice = await newUser();
    const bob = await newUser();
    const stamp = Date.now();

    for (const [owner, tag] of [[alice, 'a1'], [alice, 'a2'], [bob, 'b1']] as const) {
      await prisma.notification.create({
        data: {
          recipientId: owner,
          type: 'NEW_PUBLIC_REPLY',
          dedupKey: `readall-${tag}-${stamp}`,
          subjectType: 'CardComment',
          subjectId: owner,
          deepLink: '/cards/x',
        },
      });
    }

    const result = await markNotificationsRead(repo, alice, { all: true });
    expect(result.updated).toBe(2);
    expect(result.unreadCount).toBe(0);
    await expect(repo.countUnread(bob)).resolves.toBe(1);
  });

  describe('a private message', () => {
    async function conversationWithMessage(body: string) {
      const messaging = createPrismaMessagingRepository(prisma);
      const sender = await newUser();
      const recipient = await newUser();
      const conversation = await messaging.getOrCreateDirect(sender, recipient);
      createdConversationIds.push(conversation.id);
      const message = await messaging.insertMessage({
        conversationId: conversation.id,
        senderId: sender,
        senderKind: 'USER',
        body,
      });
      return { sender, recipient, conversation, message };
    }

    it('notifies the other side, and writes no outbox row while doing it', async () => {
      const { sender, recipient, conversation, message } = await conversationWithMessage('سلام، فردا میام');

      const forRecipient = await prisma.notification.findMany({
        where: { recipientId: recipient, type: 'NEW_PRIVATE_MESSAGE', subjectId: message.id },
      });
      expect(forRecipient).toHaveLength(1);

      // Nobody is told about their own message.
      await expect(
        prisma.notification.count({ where: { recipientId: sender, subjectId: message.id } })
      ).resolves.toBe(0);

      // Task 19's canary holds: private correspondence still leaves no trace
      // in the general-purpose outbox that other consumers read.
      await expect(prisma.outboxEvent.count({ where: { aggregateId: conversation.id } })).resolves.toBe(0);
    });

    it('stores no text in the notification row - the preview is resolved from the message', async () => {
      const secret = `متن-خصوصی-${Date.now()}`;
      const { recipient, message } = await conversationWithMessage(secret);

      const row = await prisma.notification.findFirst({ where: { subjectId: message.id, recipientId: recipient } });
      expect(JSON.stringify(row)).not.toContain(secret);

      // But the recipient still sees it, read live from the message.
      const view = await listNotifications(repo, recipient, { limit: 50 });
      expect(view.items.find((n) => n.subjectId === message.id)?.preview).toBe(secret);
    });

    it('stops previewing the moment the recipient switches previews off', async () => {
      const secret = `خاموش-${Date.now()}`;
      const { recipient, message } = await conversationWithMessage(secret);

      await repo.setPreferences(recipient, { privateMessagePreview: false });
      const view = await listNotifications(repo, recipient, { limit: 50 });
      const item = view.items.find((n) => n.subjectId === message.id);

      expect(item).toBeDefined();
      expect(item?.preview).toBeNull();
    });

    it('re-checks membership when resolving a preview, rather than trusting the notification', async () => {
      const outsider = await newUser();
      const { message } = await conversationWithMessage('محرمانه');

      // A notification is a pointer; a pointer must never be what authorises
      // a read. Pointing an outsider's notification at the message yields
      // nothing.
      const previews = await repo.resolveMessagePreviews(outsider, [message.id]);
      expect(previews.size).toBe(0);
    });

    it('has no preview once the message is deleted, because nothing was ever copied', async () => {
      const messaging = createPrismaMessagingRepository(prisma);
      const { sender, recipient, message } = await conversationWithMessage('حذف‌شدنی');

      await messaging.softDelete({ messageId: message.id, actorId: sender, correlationId: 'corr-notif' });

      const view = await listNotifications(repo, recipient, { limit: 50 });
      expect(view.items.find((n) => n.subjectId === message.id)?.preview).toBeNull();
    });
  });
});
