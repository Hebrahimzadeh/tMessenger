-- CreateEnum
CREATE TYPE "CardKind" AS ENUM ('AWARENESS', 'OBSERVATION', 'REUSABLE_RESOURCE', 'CONSUMABLE_RESOURCE', 'REQUEST', 'SERVICE', 'PARTICIPATION', 'EVENT');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'REMOVED');

-- CreateEnum
CREATE TYPE "CardAttachmentKind" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO', 'FILE', 'LINK', 'APPROXIMATE_LOCATION');

-- CreateEnum
CREATE TYPE "CardAttachmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'REJECTED');

-- NOTE: Prisma's diff proposed `DROP INDEX "spaces_search_text_trgm_idx"`
-- again - the recurring false positive (it can't see the hand-added
-- pg_trgm index from migration 20260905152927_space_search). Deliberately
-- removed; dropping it would silently kill Task 11's search performance.

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "kind" "CardKind" NOT NULL DEFAULT 'AWARENESS',
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "publishedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_revisions" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "editorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_semantic_profiles" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "inferredKind" "CardKind" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_semantic_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_attachments" (
    "id" UUID NOT NULL,
    "cardId" UUID,
    "ownerId" UUID NOT NULL,
    "kind" "CardAttachmentKind" NOT NULL,
    "status" "CardAttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "objectKey" TEXT,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "checksumSha256" TEXT,
    "linkUrl" TEXT,
    "locationLabel" TEXT,
    "approxLat" DOUBLE PRECISION,
    "approxLng" DOUBLE PRECISION,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "card_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_events" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorId" UUID,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cards_spaceId_publishedAt_idx" ON "cards"("spaceId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "card_revisions_cardId_revisionNumber_key" ON "card_revisions"("cardId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "card_semantic_profiles_cardId_key" ON "card_semantic_profiles"("cardId");

-- CreateIndex
CREATE INDEX "card_attachments_cardId_idx" ON "card_attachments"("cardId");

-- CreateIndex
CREATE INDEX "card_attachments_ownerId_status_idx" ON "card_attachments"("ownerId", "status");

-- CreateIndex
CREATE INDEX "card_events_cardId_createdAt_idx" ON "card_events"("cardId", "createdAt");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_revisions" ADD CONSTRAINT "card_revisions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_revisions" ADD CONSTRAINT "card_revisions_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_semantic_profiles" ADD CONSTRAINT "card_semantic_profiles_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_attachments" ADD CONSTRAINT "card_attachments_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_attachments" ADD CONSTRAINT "card_attachments_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_events" ADD CONSTRAINT "card_events_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
