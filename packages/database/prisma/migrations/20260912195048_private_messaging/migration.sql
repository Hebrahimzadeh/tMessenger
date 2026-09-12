-- NOTE: Prisma's diff proposed `DROP INDEX "spaces_search_text_trgm_idx"`
-- again - the recurring false positive (it cannot see the hand-added
-- pg_trgm GIN index from 20260905152927_space_search). Deliberately
-- removed; dropping it would silently kill Task 11's search performance.

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('VISIBLE', 'DELETED');

-- CreateEnum
CREATE TYPE "MessageSenderKind" AS ENUM ('USER', 'SYSTEM_ASSISTANT');

-- AlterEnum
ALTER TYPE "ConversationKind" ADD VALUE 'SYSTEM_ASSISTANT';

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID,
    "senderKind" "MessageSenderKind" NOT NULL DEFAULT 'USER',
    "status" "MessageStatus" NOT NULL DEFAULT 'VISIBLE',
    "body" TEXT,
    "revisionCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_revisions" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "editorId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_receipts" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadMessageId" UUID,
    "lastReadAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_id_idx" ON "messages"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "message_revisions_messageId_revisionNumber_key" ON "message_revisions"("messageId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "message_receipts_conversationId_userId_key" ON "message_receipts"("conversationId", "userId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_revisions" ADD CONSTRAINT "message_revisions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
