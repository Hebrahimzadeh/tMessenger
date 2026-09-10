-- NOTE: Prisma's diff proposed `DROP INDEX "spaces_search_text_trgm_idx"`
-- again - the recurring false positive (it cannot see the hand-added
-- pg_trgm GIN index from 20260905152927_space_search). Deliberately
-- removed; dropping it would silently kill Task 11's search performance.

-- CreateTable
CREATE TABLE "awareness_daily_aggregates" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "producedCount" INTEGER NOT NULL,
    "meaningfulViewCount" INTEGER NOT NULL,
    "publicContributionCount" INTEGER NOT NULL,
    "appliedCount" INTEGER NOT NULL,
    "privateChatStartedCount" INTEGER NOT NULL,
    "reservationClosedCount" INTEGER NOT NULL,
    "computedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "awareness_daily_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "awareness_daily_aggregates_date_key" ON "awareness_daily_aggregates"("date");
