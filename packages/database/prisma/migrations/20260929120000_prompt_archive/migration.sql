-- Prompt archival for review (owner request 2026-09-29). Additive only:
-- three new tables and one new enum, nothing dropped and nothing altered.
--
-- Why this exists, and why it is not a licence to hoard, is on the models
-- themselves in schema.prisma. The short of it: a platform that has a model
-- design its spaces must be able to answer "what was it asked, and what did
-- we send it" later; the policy guard still keeps private correspondence
-- away from a model entirely; and a daily job nulls the text after 90 days,
-- leaving the decision and its reasons behind.

-- CreateEnum
CREATE TYPE "SpaceBuildDecision" AS ENUM ('PUBLISH', 'HUMAN_REVIEW', 'BLOCK');

-- CreateTable
CREATE TABLE "ai_prompt_documents" (
    "id" UUID NOT NULL,
    "ref" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_prompt_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_documents_contentHash_key" ON "ai_prompt_documents"("contentHash");

-- CreateIndex
CREATE INDEX "ai_prompt_documents_ref_idx" ON "ai_prompt_documents"("ref");

-- CreateTable
CREATE TABLE "ai_prompt_archive" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "userText" TEXT,
    "renderedPrompt" TEXT,
    "documentId" UUID,
    "textPurgedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_prompt_archive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_archive_requestId_key" ON "ai_prompt_archive"("requestId");

-- CreateIndex
CREATE INDEX "ai_prompt_archive_createdAt_idx" ON "ai_prompt_archive"("createdAt");

-- AddForeignKey
ALTER TABLE "ai_prompt_archive" ADD CONSTRAINT "ai_prompt_archive_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompt_archive" ADD CONSTRAINT "ai_prompt_archive_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ai_prompt_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "space_build_attempts" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "spaceId" UUID,
    "userPrompt" TEXT,
    "textPurgedAt" TIMESTAMPTZ(6),
    "requestId" UUID,
    "documentRef" TEXT,
    "decision" "SpaceBuildDecision" NOT NULL,
    "reason" TEXT NOT NULL,
    "policyVersionRef" TEXT NOT NULL,
    "matchedPolicyRules" JSONB NOT NULL,
    "creativityApplied" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_build_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "space_build_attempts_requestId_key" ON "space_build_attempts"("requestId");

-- CreateIndex
CREATE INDEX "space_build_attempts_createdAt_idx" ON "space_build_attempts"("createdAt");

-- CreateIndex
CREATE INDEX "space_build_attempts_decision_createdAt_idx" ON "space_build_attempts"("decision", "createdAt");

-- AddForeignKey
ALTER TABLE "space_build_attempts" ADD CONSTRAINT "space_build_attempts_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_build_attempts" ADD CONSTRAINT "space_build_attempts_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_build_attempts" ADD CONSTRAINT "space_build_attempts_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ai_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
