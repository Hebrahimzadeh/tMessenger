-- NOTE: Prisma's diff proposed `DROP INDEX "spaces_search_text_trgm_idx"`
-- again - the recurring false positive (it cannot see the hand-added
-- pg_trgm GIN index from 20260905152927_space_search). Deliberately
-- removed; dropping it would silently kill Task 11's search performance.

-- CreateEnum
CREATE TYPE "AiInputSource" AS ENUM ('PUBLIC_USER_INPUT', 'PUBLIC_SPACE_DATA', 'ASSISTANT_CONVERSATION', 'MODERATION_GRANTED_CONTEXT');

-- CreateEnum
CREATE TYPE "AiCapability" AS ENUM ('SPACE_GUIDANCE', 'CARD_DRAFT', 'ASSISTANT_REPLY', 'MODERATION_ASSIST');

-- CreateEnum
CREATE TYPE "AiOutcome" AS ENUM ('SUGGESTION', 'FALLBACK', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "ai_requests" (
    "id" UUID NOT NULL,
    "requesterId" UUID,
    "capability" "AiCapability" NOT NULL,
    "source" "AiInputSource" NOT NULL,
    "promptVersionId" UUID,
    "inputHash" TEXT NOT NULL,
    "inputChars" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_results" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "outcome" "AiOutcome" NOT NULL,
    "payload" JSONB,
    "errorCode" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" UUID NOT NULL,
    "capability" "AiCapability" NOT NULL,
    "version" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_usage" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costMicros" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_requests_requesterId_createdAt_idx" ON "ai_requests"("requesterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_results_requestId_key" ON "ai_results"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_capability_version_key" ON "prompt_versions"("capability", "version");

-- CreateIndex
CREATE UNIQUE INDEX "provider_usage_requestId_key" ON "provider_usage"("requestId");

-- CreateIndex
CREATE INDEX "provider_usage_createdAt_idx" ON "provider_usage"("createdAt");

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "prompt_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
