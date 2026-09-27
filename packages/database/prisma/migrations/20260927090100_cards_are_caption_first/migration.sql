-- A card is an image, a caption and four actions (owner decision
-- 2026-09-27, docs/decisions/2026-09-27-cards-are-caption-first.md).
--
-- Three changes, all of them the same decision:
--
--   1. `card_revisions.title` goes. A card has no name and no title; its
--      caption is `body`, which may be empty when the card is an image.
--      Dropping the column rather than leaving it nullable is deliberate -
--      a column nothing writes is a title waiting to come back.
--   2. `space_definition_versions.card_hints` goes. A space no longer
--      carries labelled sample cards on its definition: it opens with
--      three real cards, written by its creator, each with a comment
--      underneath (see space.service.ts's buildSpaceFromPrompt).
--   3. `card_bookmarks` arrives - a private "keep this", visible to nobody
--      but the person who made it and counted in no public total.

-- DropColumn
ALTER TABLE "card_revisions" DROP COLUMN "title";

-- DropColumn
ALTER TABLE "space_definition_versions" DROP COLUMN "cardHints";

-- CreateTable
CREATE TABLE "card_bookmarks" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_bookmarks_cardId_userId_key" ON "card_bookmarks"("cardId", "userId");

-- CreateIndex
CREATE INDEX "card_bookmarks_userId_createdAt_idx" ON "card_bookmarks"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "card_bookmarks" ADD CONSTRAINT "card_bookmarks_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_bookmarks" ADD CONSTRAINT "card_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
