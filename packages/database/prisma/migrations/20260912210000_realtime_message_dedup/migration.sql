-- NOTE: Prisma's diff proposed `DROP INDEX "spaces_search_text_trgm_idx"`
-- again - the recurring false positive (it cannot see the hand-added
-- pg_trgm GIN index from 20260905152927_space_search). Deliberately
-- removed; dropping it would silently kill Task 11's search performance.

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "clientMessageId" VARCHAR(64);

-- CreateIndex
-- Postgres treats NULLs as distinct in a unique index, so every REST-sent
-- message (clientMessageId IS NULL) coexists freely; only two socket sends
-- claiming the same client id within one conversation collide, which is
-- exactly the retry this is here to collapse.
CREATE UNIQUE INDEX "messages_conversationId_clientMessageId_key" ON "messages"("conversationId", "clientMessageId");
