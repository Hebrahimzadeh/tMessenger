import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaMessagingRepository } from './messaging.repository';
import { internalServiceCredential, sendSystemMessage } from './messaging.service';

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

describe.skipIf(!databaseAvailable)('MessagingRepository: real Postgres', () => {
  const prisma = getPrisma();
  const repo = createPrismaMessagingRepository(prisma);

  let alice: string;
  let bob: string;
  let mallory: string;
  const createdConversationIds: string[] = [];
  /** Extra people a single test needed; torn down with the rest. */
  const extraUserIds: string[] = [];

  /** Deletes the given conversations and everything referencing them, children first. */
  async function purgeConversations(ids: string[]) {
    if (ids.length === 0) return;
    const messageIds = (
      await prisma.message.findMany({ where: { conversationId: { in: ids } }, select: { id: true } })
    ).map((m) => m.id);

    await prisma.messageRevision.deleteMany({ where: { messageId: { in: messageIds } } });
    // Audit rows have no foreign key by design, so they are cleaned by the
    // ids this run created rather than by a cascade.
    await prisma.auditEvent.deleteMany({ where: { targetType: 'Message', targetId: { in: messageIds } } });
    await prisma.messageReceipt.deleteMany({ where: { conversationId: { in: ids } } });
    await prisma.message.deleteMany({ where: { conversationId: { in: ids } } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: { in: ids } } });
    await prisma.conversation.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    const [a, b, m] = await Promise.all([
      prisma.user.create({ data: {} }),
      prisma.user.create({ data: {} }),
      prisma.user.create({ data: {} }),
    ]);
    alice = a.id;
    bob = b.id;
    mallory = m.id;
  });

  afterAll(async () => {
    const everyone = [alice, bob, mallory, ...extraUserIds];
    // Sweep by membership rather than only by the ids this run recorded, so
    // a test that died before registering its conversation still gets
    // cleaned up instead of blocking the user deletes below.
    const theirs = await prisma.conversation.findMany({
      where: { members: { some: { userId: { in: everyone } } } },
      select: { id: true },
    });
    await purgeConversations([...new Set([...createdConversationIds, ...theirs.map((c) => c.id)])]);
    await prisma.user.deleteMany({ where: { id: { in: everyone } } });
  });

  async function newDirect(userAId: string, userBId: string) {
    const conversation = await repo.getOrCreateDirect(userAId, userBId);
    if (!createdConversationIds.includes(conversation.id)) createdConversationIds.push(conversation.id);
    return conversation;
  }

  it('resolves the same pair of people to one conversation, in either order', async () => {
    const first = await newDirect(alice, bob);
    const second = await newDirect(bob, alice);

    expect(second.id).toBe(first.id);
    expect([...first.memberIds].sort()).toEqual([alice, bob].sort());

    const rows = await prisma.conversation.count({ where: { id: first.id } });
    expect(rows).toBe(1);
  });

  it('survives two concurrent first requests for the same pair without creating two conversations', async () => {
    const [x, y] = await Promise.all([repo.getOrCreateDirect(alice, mallory), repo.getOrCreateDirect(mallory, alice)]);
    createdConversationIds.push(x.id);

    expect(y.id).toBe(x.id);
    const pairRows = await prisma.conversation.count({
      where: { pairKey: [alice, mallory].sort().join(':') },
    });
    expect(pairRows).toBe(1);
  });

  it('gives each person exactly one assistant thread, with only them in it', async () => {
    const first = await repo.getOrCreateAssistant(alice);
    const second = await repo.getOrCreateAssistant(alice);
    createdConversationIds.push(first.id);

    expect(second.id).toBe(first.id);
    expect(first.kind).toBe('SYSTEM_ASSISTANT');
    expect(first.memberIds).toEqual([alice]);

    // Someone else's assistant thread is a different row entirely.
    const bobs = await repo.getOrCreateAssistant(bob);
    createdConversationIds.push(bobs.id);
    expect(bobs.id).not.toBe(first.id);
  });

  it('reports membership truthfully, which is what every access check rests on', async () => {
    const convo = await newDirect(alice, bob);

    await expect(repo.isMember(convo.id, alice)).resolves.toBe(true);
    await expect(repo.isMember(convo.id, bob)).resolves.toBe(true);
    await expect(repo.isMember(convo.id, mallory)).resolves.toBe(false);
  });

  it('pages messages newest-first and returns every message exactly once across pages', async () => {
    const convo = await newDirect(alice, bob);
    const sent: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const m = await repo.insertMessage({
        conversationId: convo.id,
        senderId: i % 2 === 0 ? alice : bob,
        senderKind: 'USER',
        body: `پیام شمارهٔ ${i}`,
      });
      sent.push(m.id);
    }

    const page1 = await repo.listMessages(convo.id, { limit: 3, before: null });
    expect(page1).toHaveLength(3);
    const last = page1[2]!;
    const page2 = await repo.listMessages(convo.id, {
      limit: 3,
      before: { createdAt: last.createdAt.toISOString(), id: last.id },
    });

    const seen = [...page1, ...page2].map((m) => m.id);
    expect(new Set(seen).size).toBe(seen.length); // nothing repeated
    expect([...seen].sort()).toEqual([...sent].sort()); // nothing missed
  });

  it('keeps an edit as a new revision and never rewrites the old one', async () => {
    const convo = await newDirect(alice, bob);
    const original = await repo.insertMessage({
      conversationId: convo.id,
      senderId: alice,
      senderKind: 'USER',
      body: 'نسخهٔ اول',
    });

    const edited = await repo.addRevision({ messageId: original.id, editorId: alice, body: 'نسخهٔ دوم' });
    expect(edited.body).toBe('نسخهٔ دوم');
    expect(edited.revisionCount).toBe(2);

    const revisions = await prisma.messageRevision.findMany({
      where: { messageId: original.id },
      orderBy: { revisionNumber: 'asc' },
      select: { revisionNumber: true, body: true },
    });
    expect(revisions).toEqual([
      { revisionNumber: 1, body: 'نسخهٔ اول' },
      { revisionNumber: 2, body: 'نسخهٔ دوم' },
    ]);
  });

  it('clears the text on a soft delete but keeps the row and its revisions', async () => {
    const convo = await newDirect(alice, bob);
    const m = await repo.insertMessage({
      conversationId: convo.id,
      senderId: alice,
      senderKind: 'USER',
      body: 'متن حذف‌شدنی',
    });

    const deleted = await repo.softDelete({ messageId: m.id, actorId: alice, correlationId: 'corr-delete' });
    expect(deleted.status).toBe('DELETED');
    expect(deleted.body).toBeNull();

    const row = await prisma.message.findUnique({ where: { id: m.id }, select: { id: true, deletedAt: true } });
    expect(row?.deletedAt).not.toBeNull();

    const revisions = await prisma.messageRevision.findMany({ where: { messageId: m.id }, select: { body: true } });
    expect(revisions).toEqual([{ body: 'متن حذف‌شدنی' }]);
  });

  it('writes an audit row for a deletion that carries metadata only, never the message text', async () => {
    const convo = await newDirect(alice, bob);
    const secret = `متن-محرمانه-${Date.now()}`;
    const m = await repo.insertMessage({ conversationId: convo.id, senderId: alice, senderKind: 'USER', body: secret });
    await repo.softDelete({ messageId: m.id, actorId: alice, correlationId: 'corr-audit' });

    const audit = await prisma.auditEvent.findFirst({
      where: { targetType: 'Message', targetId: m.id },
      select: { action: true, actorId: true, metadata: true },
    });

    expect(audit).toMatchObject({ action: 'message.deleted', actorId: alice });
    expect(JSON.stringify(audit?.metadata)).not.toContain(secret);
    expect(audit?.metadata).toEqual({ conversationId: convo.id });
  });

  it('counts unread for the reader alone, and stops counting once they mark it read', async () => {
    // Its own pair of people: getOrCreateDirect deliberately reuses one
    // conversation per pair, so sharing alice/bob here would inherit every
    // message the earlier tests sent.
    const reader = await prisma.user.create({ data: {} });
    const writer = await prisma.user.create({ data: {} });
    extraUserIds.push(reader.id, writer.id);
    const convo = await newDirect(writer.id, reader.id);
    const alice = writer.id;
    const bob = reader.id;

    const first = await repo.insertMessage({
      conversationId: convo.id,
      senderId: alice,
      senderKind: 'USER',
      body: 'یک',
    });
    await repo.insertMessage({ conversationId: convo.id, senderId: alice, senderKind: 'USER', body: 'دو' });

    // Bob has two waiting; Alice has none, because they are her own.
    await expect(repo.countUnread(convo.id, bob)).resolves.toBe(2);
    await expect(repo.countUnread(convo.id, alice)).resolves.toBe(0);

    const latest = (await repo.listMessages(convo.id, { limit: 1, before: null }))[0]!;
    await repo.upsertReceipt({ conversationId: convo.id, userId: bob, lastReadMessageId: latest.id });
    await expect(repo.countUnread(convo.id, bob)).resolves.toBe(0);

    // Marking read twice is an upsert, not a duplicate row.
    await repo.upsertReceipt({ conversationId: convo.id, userId: bob, lastReadMessageId: first.id });
    const receipts = await prisma.messageReceipt.count({ where: { conversationId: convo.id, userId: bob } });
    expect(receipts).toBe(1);
  });

  it('lists a person\'s conversations and nobody else\'s', async () => {
    const shared = await newDirect(alice, bob);
    const theirs = await newDirect(bob, mallory);

    const forAlice = await repo.listConversationsForUser(alice, { limit: 50, before: null });
    const ids = forAlice.map((c) => c.id);

    expect(ids).toContain(shared.id);
    expect(ids).not.toContain(theirs.id);
  });
});

/**
 * The canary: send a message containing a value that exists nowhere else in
 * the database, then look for that value in every text-ish column of every
 * table. It must appear only in `messages` and `message_revisions`.
 *
 * Written as a full scan rather than a list of forbidden tables on purpose.
 * M5 and M6 add AiRequest, recommendation and report tables, and a check
 * that named today's tables would silently stop covering the ones that
 * matter most. This one starts failing the moment any future write path
 * copies private text somewhere new, without anybody remembering to update
 * it - which is the only kind of canary worth having.
 */
describe.skipIf(!databaseAvailable)('private message text reaches no other table', () => {
  const prisma = getPrisma();
  const repo = createPrismaMessagingRepository(prisma);

  it('appears only in messages and message_revisions, nowhere else in the database', async () => {
    const alice = await prisma.user.create({ data: {} });
    const bob = await prisma.user.create({ data: {} });
    const sentinel = `canary-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const convo = await repo.getOrCreateDirect(alice.id, bob.id);
    const sent = await repo.insertMessage({
      conversationId: convo.id,
      senderId: alice.id,
      senderKind: 'USER',
      body: `یک پیام کاملاً خصوصی ${sentinel}`,
    });

    // Reading it back is part of what is under test: neither sending nor
    // reading may produce a copy anywhere.
    await repo.listMessages(convo.id, { limit: 50, before: null });
    await repo.upsertReceipt({ conversationId: convo.id, userId: bob.id, lastReadMessageId: sent.id });
    await repo.countUnread(convo.id, bob.id);

    const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('text', 'character varying', 'json', 'jsonb')
    `;
    expect(columns.length).toBeGreaterThan(0);

    const found: string[] = [];
    for (const { table_name, column_name } of columns) {
      const hits = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "${table_name}" WHERE "${column_name}"::text LIKE $1`,
        `%${sentinel}%`
      );
      if (Number(hits[0]?.n ?? 0) > 0) found.push(`${table_name}.${column_name}`);
    }

    expect([...new Set(found.map((f) => f.split('.')[0]))].sort()).toEqual(['message_revisions', 'messages']);

    // And nothing at all was logged as awareness or queued to the outbox by
    // sending or reading a private message.
    await expect(prisma.awarenessEvent.count({ where: { subjectId: convo.id } })).resolves.toBe(0);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: convo.id } })).resolves.toBe(0);

    await prisma.messageRevision.deleteMany({ where: { message: { conversationId: convo.id } } });
    await prisma.messageReceipt.deleteMany({ where: { conversationId: convo.id } });
    await prisma.message.deleteMany({ where: { conversationId: convo.id } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convo.id } });
    await prisma.conversation.delete({ where: { id: convo.id } });
    await prisma.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
  });

  it('is not written even by the assistant path, which is the only writer with no human sender', async () => {
    const owner = await prisma.user.create({ data: {} });
    const sentinel = `canary-assistant-${Date.now()}`;

    const convo = await repo.getOrCreateAssistant(owner.id);
    await sendSystemMessage(repo, internalServiceCredential(), convo.id, { body: `راهنمایی ${sentinel}` });

    await expect(prisma.awarenessEvent.count({ where: { subjectId: convo.id } })).resolves.toBe(0);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: convo.id } })).resolves.toBe(0);
    await expect(prisma.auditEvent.count({ where: { targetId: convo.id } })).resolves.toBe(0);

    const stored = await prisma.message.findFirst({
      where: { conversationId: convo.id },
      select: { senderId: true, senderKind: true },
    });
    expect(stored).toEqual({ senderId: null, senderKind: 'SYSTEM_ASSISTANT' });

    await prisma.messageRevision.deleteMany({ where: { message: { conversationId: convo.id } } });
    await prisma.message.deleteMany({ where: { conversationId: convo.id } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convo.id } });
    await prisma.conversation.delete({ where: { id: convo.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });
});

/**
 * The assistant suggesting something must never be the same event as the
 * thing happening. These run against real Postgres so "nothing was created"
 * is a statement about rows, not about a stub not being called.
 */
describe.skipIf(!databaseAvailable)('an assistant suggestion publishes nothing on its own', () => {
  const prisma = getPrisma();
  const repo = createPrismaMessagingRepository(prisma);

  async function withAssistantProposal() {
    const owner = await prisma.user.create({ data: {} });
    const convo = await repo.getOrCreateAssistant(owner.id);
    const message = await sendSystemMessage(repo, internalServiceCredential(), convo.id, {
      body: 'پیشنهاد می‌کنم این کارت را بسازید.',
      proposedAction: { kind: 'CARD_DRAFT', title: 'کارت پیشنهادی', summary: 'خلاصه', spaceId: null },
    });
    return { owner, convo, message };
  }

  async function cleanUp(ownerId: string, conversationId: string) {
    await prisma.messageRevision.deleteMany({ where: { message: { conversationId } } });
    await prisma.message.deleteMany({ where: { conversationId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId } });
    await prisma.conversation.delete({ where: { id: conversationId } });
    await prisma.user.delete({ where: { id: ownerId } });
  }

  it('stores the suggestion as pending and creates no card, space or outbox event', async () => {
    const cardsBefore = await prisma.card.count();
    const spacesBefore = await prisma.space.count();
    const { owner, convo, message } = await withAssistantProposal();

    expect(message.proposalState).toBe('PENDING');
    expect(message.proposedAction).toMatchObject({ kind: 'CARD_DRAFT', title: 'کارت پیشنهادی' });

    // Nothing at all happened beyond a message being stored.
    await expect(prisma.card.count()).resolves.toBe(cardsBefore);
    await expect(prisma.space.count()).resolves.toBe(spacesBefore);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: convo.id } })).resolves.toBe(0);
    await expect(prisma.awarenessEvent.count({ where: { subjectId: convo.id } })).resolves.toBe(0);

    await cleanUp(owner.id, convo.id);
  });

  it('still creates nothing when the person confirms - there is no tool to run until M5, and the decision alone is not one', async () => {
    const cardsBefore = await prisma.card.count();
    const { owner, convo, message } = await withAssistantProposal();

    const decided = await repo.decideProposal({ messageId: message.id, decision: 'CONFIRM' });
    expect(decided.proposalState).toBe('CONFIRMED');
    await expect(prisma.card.count()).resolves.toBe(cardsBefore);

    await cleanUp(owner.id, convo.id);
  });

  it('records a rejection without creating anything either', async () => {
    const cardsBefore = await prisma.card.count();
    const { owner, convo, message } = await withAssistantProposal();

    const decided = await repo.decideProposal({ messageId: message.id, decision: 'REJECT' });
    expect(decided.proposalState).toBe('REJECTED');
    await expect(prisma.card.count()).resolves.toBe(cardsBefore);

    await cleanUp(owner.id, convo.id);
  });

  it('reads back an unrecognisable stored proposal as no proposal, rather than passing it on', async () => {
    const owner = await prisma.user.create({ data: {} });
    const convo = await repo.getOrCreateAssistant(owner.id);
    const message = await repo.insertMessage({
      conversationId: convo.id,
      senderId: null,
      senderKind: 'SYSTEM_ASSISTANT',
      body: 'x',
    });
    // A row written by some older or wrong shape.
    await prisma.message.update({
      where: { id: message.id },
      data: { proposedAction: { kind: 'SOMETHING_ELSE', danger: true }, proposalState: 'PENDING' },
    });

    const read = await repo.findMessage(message.id);
    expect(read?.proposedAction).toBeNull();

    await cleanUp(owner.id, convo.id);
  });
});

describe.skipIf(!databaseAvailable)('per-person conversation preferences', () => {
  const prisma = getPrisma();
  const repo = createPrismaMessagingRepository(prisma);

  it('are stored per member, so one side muting or hiding never moves the other', async () => {
    const alice = await prisma.user.create({ data: {} });
    const bob = await prisma.user.create({ data: {} });
    const convo = await repo.getOrCreateDirect(alice.id, bob.id);

    await expect(repo.getPreferences(convo.id, alice.id)).resolves.toEqual({ muted: false, hidden: false });

    await repo.setPreferences(convo.id, alice.id, { muted: true, hidden: true });
    await expect(repo.getPreferences(convo.id, alice.id)).resolves.toEqual({ muted: true, hidden: true });
    await expect(repo.getPreferences(convo.id, bob.id)).resolves.toEqual({ muted: false, hidden: false });

    // Alice's list loses it; Bob's does not.
    const aliceList = await repo.listConversationsForUser(alice.id, { limit: 50, before: null });
    const bobList = await repo.listConversationsForUser(bob.id, { limit: 50, before: null });
    expect(aliceList.map((c) => c.id)).not.toContain(convo.id);
    expect(bobList.map((c) => c.id)).toContain(convo.id);

    // And it comes straight back.
    await repo.setPreferences(convo.id, alice.id, { hidden: false });
    const restored = await repo.listConversationsForUser(alice.id, { limit: 50, before: null });
    expect(restored.map((c) => c.id)).toContain(convo.id);
    await expect(repo.getPreferences(convo.id, alice.id)).resolves.toEqual({ muted: true, hidden: false });

    await prisma.conversationMember.deleteMany({ where: { conversationId: convo.id } });
    await prisma.conversation.delete({ where: { id: convo.id } });
    await prisma.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
  });
});
