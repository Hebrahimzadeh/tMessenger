import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaDirectConversationPort } from './direct-conversation.repository';

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

describe.skipIf(!databaseAvailable)('DirectConversationPort: real Postgres', () => {
  const port = createPrismaDirectConversationPort();
  let userA: string;
  let userB: string;
  let userC: string;

  beforeAll(async () => {
    userA = (await getPrisma().user.create({ data: {} })).id;
    userB = (await getPrisma().user.create({ data: {} })).id;
    userC = (await getPrisma().user.create({ data: {} })).id;
  });

  afterEach(async () => {
    const members = await getPrisma().conversationMember.findMany({
      where: { userId: { in: [userA, userB, userC] } },
      select: { conversationId: true },
    });
    const conversationIds = [...new Set(members.map((m) => m.conversationId))];
    await getPrisma().conversationMember.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await getPrisma().conversation.deleteMany({ where: { id: { in: conversationIds } } });
  });

  afterAll(async () => {
    await getPrisma().user.deleteMany({ where: { id: { in: [userA, userB, userC] } } });
  });

  it('creates a conversation with both members on first call', async () => {
    const result = await getPrisma().$transaction((tx) => port.getOrCreateDirectConversation(tx, userA, userB));
    expect(result.created).toBe(true);

    const members = await getPrisma().conversationMember.findMany({ where: { conversationId: result.conversationId } });
    expect(members.map((m) => m.userId).sort()).toEqual([userA, userB].sort());
  });

  it('is idempotent regardless of argument order', async () => {
    const first = await getPrisma().$transaction((tx) => port.getOrCreateDirectConversation(tx, userA, userB));
    const second = await getPrisma().$transaction((tx) => port.getOrCreateDirectConversation(tx, userB, userA));
    expect(second.conversationId).toBe(first.conversationId);
    expect(second.created).toBe(false);

    const count = await getPrisma().conversation.count({ where: { id: first.conversationId } });
    expect(count).toBe(1);
  });

  it('gives a different conversation for a different pair', async () => {
    const ab = await getPrisma().$transaction((tx) => port.getOrCreateDirectConversation(tx, userA, userB));
    const ac = await getPrisma().$transaction((tx) => port.getOrCreateDirectConversation(tx, userA, userC));
    expect(ac.conversationId).not.toBe(ab.conversationId);
  });

  it('resolves to exactly one conversation when two requests race for the same new pair', async () => {
    const [first, second] = await Promise.all([
      getPrisma().$transaction((tx) => port.getOrCreateDirectConversation(tx, userA, userB)),
      getPrisma().$transaction((tx) => port.getOrCreateDirectConversation(tx, userA, userB)),
    ]);
    expect(first.conversationId).toBe(second.conversationId);

    const count = await getPrisma().conversation.count({ where: { id: first.conversationId } });
    expect(count).toBe(1);
  });
});
