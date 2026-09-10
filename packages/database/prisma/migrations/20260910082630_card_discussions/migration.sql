-- CreateEnum
CREATE TYPE "CardCommentStatus" AS ENUM ('VISIBLE', 'DELETED');

-- CreateEnum
CREATE TYPE "CardReactionType" AS ENUM ('SUPPORT', 'USEFUL', 'INTERESTED', 'CELEBRATE');

-- NOTE: Prisma's diff proposed `DROP INDEX "spaces_search_text_trgm_idx"`
-- again - the recurring false positive (it cannot see the hand-added
-- pg_trgm GIN index from 20260905152927_space_search). Deliberately
-- removed; dropping it would silently kill Task 11's search performance.

-- CreateTable
CREATE TABLE "card_comments" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "parentId" UUID,
    "status" "CardCommentStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "card_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_comment_revisions" (
    "id" UUID NOT NULL,
    "commentId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "editorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_comment_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_reactions" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "CardReactionType" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_pins" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "pinnedById" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_pins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_comments_cardId_createdAt_idx" ON "card_comments"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "card_comments_parentId_idx" ON "card_comments"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "card_comment_revisions_commentId_revisionNumber_key" ON "card_comment_revisions"("commentId", "revisionNumber");

-- CreateIndex
CREATE INDEX "card_reactions_cardId_idx" ON "card_reactions"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "card_reactions_cardId_userId_type_key" ON "card_reactions"("cardId", "userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "card_pins_cardId_key" ON "card_pins"("cardId");

-- CreateIndex
CREATE INDEX "card_pins_spaceId_position_idx" ON "card_pins"("spaceId", "position");

-- AddForeignKey
ALTER TABLE "card_comments" ADD CONSTRAINT "card_comments_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_comments" ADD CONSTRAINT "card_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_comments" ADD CONSTRAINT "card_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "card_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_comment_revisions" ADD CONSTRAINT "card_comment_revisions_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "card_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_comment_revisions" ADD CONSTRAINT "card_comment_revisions_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_reactions" ADD CONSTRAINT "card_reactions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_reactions" ADD CONSTRAINT "card_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_pins" ADD CONSTRAINT "card_pins_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_pins" ADD CONSTRAINT "card_pins_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_pins" ADD CONSTRAINT "card_pins_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
