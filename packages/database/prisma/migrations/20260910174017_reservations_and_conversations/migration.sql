-- CreateEnum
CREATE TYPE "ReservationState" AS ENUM ('ACTIVE', 'RESERVED', 'IN_USE', 'RESERVATION_CLOSED');

-- CreateEnum
CREATE TYPE "ReservationCloseReason" AS ENUM ('RETURNED', 'COMPLETED', 'TIME_ENDED', 'OWNER_CLOSED');

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('DIRECT');

-- CreateEnum
CREATE TYPE "AwarenessEventType" AS ENUM ('PRODUCED', 'MEANINGFUL_VIEW', 'PUBLIC_CONTRIBUTION', 'RESERVED', 'PRIVATE_CHAT_STARTED', 'APPLIED', 'RESERVATION_CLOSED');

-- NOTE: Prisma's diff proposed `DROP INDEX "spaces_search_text_trgm_idx"`
-- again - the recurring false positive (it cannot see the hand-added
-- pg_trgm GIN index from 20260905152927_space_search). Deliberately
-- removed; dropping it would silently kill Task 11's search performance.

-- CreateTable
CREATE TABLE "card_reservations" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "reserverId" UUID,
    "state" "ReservationState" NOT NULL DEFAULT 'RESERVED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "conversationId" UUID,
    "releaseReason" TEXT,
    "closeReason" "ReservationCloseReason",
    "reservedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inUseAt" TIMESTAMPTZ(6),
    "closedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "card_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "kind" "ConversationKind" NOT NULL DEFAULT 'DIRECT',
    "pairKey" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "awareness_events" (
    "id" UUID NOT NULL,
    "type" "AwarenessEventType" NOT NULL,
    "actorId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "deepLink" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "awareness_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_reservations_cardId_key" ON "card_reservations"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_pairKey_key" ON "conversations"("pairKey");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_members_conversationId_userId_key" ON "conversation_members"("conversationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scope_actorId_key_key" ON "idempotency_records"("scope", "actorId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "awareness_events_idempotencyKey_key" ON "awareness_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "awareness_events_actorId_createdAt_idx" ON "awareness_events"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "card_reservations" ADD CONSTRAINT "card_reservations_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_reservations" ADD CONSTRAINT "card_reservations_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_reservations" ADD CONSTRAINT "card_reservations_reserverId_fkey" FOREIGN KEY ("reserverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
