import { createHash } from 'node:crypto';
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
      // One transaction, so a recorded request always has its prompt. An
      // archive that can be half missing is one nobody can draw a
      // conclusion from - "no prompt stored" would mean both "we did not
      // keep it" and "the second write failed".
      return prisma().$transaction(async (tx) => {
        // Stored once per distinct wording, not once per request: the
        // space-builder document is 8KB and identical across every build.
        let documentId: string | null = null;
        const instruction = input.archive.systemInstruction;
        if (instruction !== null) {
          const contentHash = createHash('sha256').update(instruction).digest('hex');
          const document = await tx.aiPromptDocument.upsert({
            where: { contentHash },
            // Never rewritten: the same hash is the same words by
            // definition, so there is nothing an update could correct.
            update: {},
            create: { ref: `${input.capability}:${contentHash.slice(0, 12)}`, contentHash, text: instruction },
            select: { id: true },
          });
          documentId = document.id;
        }

        return tx.aiRequest.create({
          data: {
            requesterId: input.requesterId,
            capability: input.capability,
            source: input.source,
            promptVersionId: input.promptVersionId,
            inputHash: input.inputHash,
            inputChars: input.inputChars,
            archive: {
              create: {
                userText: input.archive.userText,
                renderedPrompt: input.archive.renderedPrompt,
                documentId,
              },
            },
          },
          select: { id: true },
        });
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
