import type { PrismaClient } from '@taavon/database';
import type { AiOutput } from '@taavon/contracts';
import type { OrchestratorRepository } from './orchestrator';

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Accepts the client itself or a function returning it.
 *
 * The lazy form exists for one specific reason: `app.db` is decorated by a
 * plugin `server.ts` registers *after* `buildApp()` returns, so anything that
 * reads `app.db` while wiring routes captures `undefined` and fails on the
 * first query - which the space-creation gate then reports as an outage
 * rather than as the wiring mistake it is.
 */
export function createPrismaOrchestratorRepository(db: PrismaClient | (() => PrismaClient)): OrchestratorRepository {
  const prisma = (): PrismaClient => (typeof db === 'function' ? db() : db);

  return {
    conversationKind: {
      async kindOf(conversationId) {
        const row = await prisma().conversation.findUnique({
          where: { id: conversationId },
          select: { kind: true },
        });
        return row?.kind ?? null;
      },
    },

    async createRequest(input) {
      return prisma().aiRequest.create({
        data: {
          requesterId: input.requesterId,
          capability: input.capability,
          source: input.source,
          promptVersionId: input.promptVersionId,
          inputHash: input.inputHash,
          inputChars: input.inputChars,
        },
        select: { id: true },
      });
    },

    async recordResult(input) {
      await prisma().aiResult.create({
        data: {
          requestId: input.requestId,
          outcome: input.outcome,
          // The validated structured output only. No reasoning trace reaches
          // this column, because none is ever asked for or parsed.
          payload: (input.payload as AiOutput | null) ?? undefined,
          errorCode: input.errorCode,
          latencyMs: input.latencyMs,
        },
      });
    },

    async recordUsage(requestId, usage) {
      await prisma().providerUsage.create({ data: { requestId, ...usage } });
    },

    async countRecentRequests(requesterId, sinceSeconds) {
      return prisma().aiRequest.count({
        where: { requesterId, createdAt: { gte: new Date(Date.now() - sinceSeconds * 1000) } },
      });
    },

    async spentTodayMicros() {
      const sum = await prisma().providerUsage.aggregate({
        where: { createdAt: { gte: startOfToday() } },
        _sum: { costMicros: true },
      });
      return sum._sum.costMicros ?? 0;
    },

    async currentPromptVersion(capability) {
      // The highest version wins. Templates are immutable, so "current" is
      // simply the newest one anyone has added.
      const row = await prisma().promptVersion.findFirst({
        where: { capability },
        orderBy: { version: 'desc' },
        select: { id: true, template: true },
      });
      return row;
    },
  };
}
