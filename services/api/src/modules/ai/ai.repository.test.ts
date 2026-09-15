import { afterAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { AI_ERROR_CODES } from '@taavon/contracts';
import { createPrismaMessagingRepository } from '../messaging/messaging.repository';
import { createPrismaOrchestratorRepository } from './ai.repository';
import { AiOrchestrator } from './orchestrator';
import { PolicyViolationError } from './policy-guard';
import { FakeAiProvider } from './providers/fake-provider';

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

const GOOD_REPLY = JSON.stringify({ kind: 'ASSISTANT_REPLY', reply: 'پاسخ' });

/**
 * The guard's central claim can only be tested here: whether a conversation
 * is private is a fact in the database, and the whole design rests on asking
 * it rather than believing the caller.
 */
describe.skipIf(!databaseAvailable)('AI against real Postgres', () => {
  const prisma = getPrisma();
  const repo = createPrismaOrchestratorRepository(prisma);
  const messaging = createPrismaMessagingRepository(prisma);

  const userIds: string[] = [];
  const conversationIds: string[] = [];

  afterAll(async () => {
    await prisma.providerUsage.deleteMany({ where: { request: { requesterId: { in: userIds } } } });
    await prisma.aiResult.deleteMany({ where: { request: { requesterId: { in: userIds } } } });
    await prisma.aiRequest.deleteMany({ where: { requesterId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { recipientId: { in: userIds } } });
    await prisma.messageRevision.deleteMany({ where: { message: { conversationId: { in: conversationIds } } } });
    await prisma.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function newUser() {
    const user = await prisma.user.create({ data: {} });
    userIds.push(user.id);
    return user.id;
  }

  function orchestrator(provider: FakeAiProvider | null = new FakeAiProvider([{ kind: 'ok', text: GOOD_REPLY }])) {
    return new AiOrchestrator({ provider, repository: repo, dailyBudgetMicros: null });
  }

  it('refuses a real DIRECT conversation, identified from the database', async () => {
    const alice = await newUser();
    const bob = await newUser();
    const direct = await messaging.getOrCreateDirect(alice, bob);
    conversationIds.push(direct.id);

    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_REPLY }]);
    const error = await orchestrator(provider)
      .generate(
        {
          capability: 'ASSISTANT_REPLY',
          source: 'ASSISTANT_CONVERSATION',
          text: 'چیزی که دو نفر به هم گفته‌اند',
          provenance: { kind: 'ASSISTANT_THREAD', conversationId: direct.id },
        },
        alice
      )
      .catch((e: unknown) => e);

    expect((error as PolicyViolationError).code).toBe(AI_ERROR_CODES.privateInputForbidden);
    // Nothing was sent, and nothing was recorded.
    expect(provider.calls).toHaveLength(0);
    await expect(prisma.aiRequest.count({ where: { requesterId: alice } })).resolves.toBe(0);
  });

  it('allows a real assistant thread from the same lookup', async () => {
    const owner = await newUser();
    const assistant = await messaging.getOrCreateAssistant(owner);
    conversationIds.push(assistant.id);

    const result = await orchestrator().generate(
      {
        capability: 'ASSISTANT_REPLY',
        source: 'ASSISTANT_CONVERSATION',
        text: 'سلام همیار',
        provenance: { kind: 'ASSISTANT_THREAD', conversationId: assistant.id },
      },
      owner
    );

    expect(result.outcome).toBe('SUGGESTION');
  });

  /**
   * The request row records the shape of an input, never the input itself -
   * "prompt و model metadata را بدون متن خصوصی غیرضروری ذخیره کن".
   *
   * A result payload is a different matter, deliberately: it is the answer
   * the person asked for, and for a card draft the honest fallback is their
   * own words back. So this asserts the accurate invariant rather than a
   * blanket one - the text may appear in `ai_results` as part of a
   * suggestion, and nowhere else. The first draft of this test claimed
   * "nowhere at all", which was simply false, and a test that has to be
   * weakened later teaches nobody anything.
   */
  it('records an input\'s hash and length, never the input itself', async () => {
    const user = await newUser();
    const secret = `ورودی-محرمانه-${Date.now()}`;

    await orchestrator().generate(
      { capability: 'CARD_DRAFT', source: 'PUBLIC_USER_INPUT', text: secret, provenance: { kind: 'USER_TYPED' } },
      user
    );

    const request = await prisma.aiRequest.findFirst({ where: { requesterId: user } });
    expect(request?.inputChars).toBe(secret.length);
    expect(request?.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(request)).not.toContain(secret);

    // A database-wide scan, the same discipline as the messaging canary.
    const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'json', 'jsonb')
    `;
    const found = new Set<string>();
    for (const { table_name, column_name } of columns) {
      const hits = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "${table_name}" WHERE "${column_name}"::text LIKE $1`,
        `%${secret}%`
      );
      if (Number(hits[0]?.n ?? 0) > 0) found.add(table_name);
    }

    // `ai_results` only, because the card fallback hands back the person's
    // own words as the draft. Nothing copied it anywhere else - not the
    // request row, not usage, not any log table.
    expect([...found]).toEqual(['ai_results']);
    expect(found.has('ai_requests')).toBe(false);
  });

  it('records usage, so the budget has something real to count', async () => {
    const user = await newUser();

    await orchestrator().generate(
      { capability: 'CARD_DRAFT', source: 'PUBLIC_USER_INPUT', text: 'ورودی', provenance: { kind: 'USER_TYPED' } },
      user
    );

    const usage = await prisma.providerUsage.findFirst({ where: { request: { requesterId: user } } });
    expect(usage?.costMicros).toBeGreaterThan(0);
    await expect(repo.spentTodayMicros()).resolves.toBeGreaterThan(0);
  });

  it('counts a person\'s recent requests for the quota', async () => {
    const user = await newUser();

    for (let i = 0; i < 3; i += 1) {
      await orchestrator().generate(
        { capability: 'CARD_DRAFT', source: 'PUBLIC_USER_INPUT', text: `ورودی ${i}`, provenance: { kind: 'USER_TYPED' } },
        user
      );
    }

    await expect(repo.countRecentRequests(user, 3600)).resolves.toBe(3);
  });

  it('stores a fallback outcome with its reason when there is no provider', async () => {
    const user = await newUser();

    const result = await orchestrator(null).generate(
      { capability: 'CARD_DRAFT', source: 'PUBLIC_USER_INPUT', text: 'ورودی', provenance: { kind: 'USER_TYPED' } },
      user
    );

    const stored = await prisma.aiResult.findUnique({ where: { requestId: result.requestId } });
    expect(stored?.outcome).toBe('FALLBACK');
    expect(stored?.errorCode).toBe(AI_ERROR_CODES.disabled);
    // No usage row, because no provider was called - the distinction the
    // separate table exists to keep.
    await expect(prisma.providerUsage.count({ where: { requestId: result.requestId } })).resolves.toBe(0);
  });
});
