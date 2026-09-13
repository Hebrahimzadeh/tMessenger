-- NOTE: Prisma's diff proposed `DROP INDEX "spaces_search_text_trgm_idx"`
-- again - the recurring false positive (it cannot see the hand-added
-- pg_trgm GIN index from 20260905152927_space_search). Deliberately
-- removed; dropping it would silently kill Task 11's search performance.

-- CreateEnum
CREATE TYPE "MessageProposalState" AS ENUM ('NONE', 'PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
-- Per-person, per-conversation. The member row is already one per person,
-- so muting or hiding here cannot affect the other side of a conversation.
ALTER TABLE "conversation_members" ADD COLUMN     "mutedAt" TIMESTAMPTZ(6),
ADD COLUMN     "hiddenAt" TIMESTAMPTZ(6);

-- AlterTable
-- A suggestion the assistant is making, and where it stands. Nothing reads
-- a PENDING proposal as authority to act; only the person it was shown to
-- can move it off PENDING.
ALTER TABLE "messages" ADD COLUMN     "proposedAction" JSONB,
ADD COLUMN     "proposalState" "MessageProposalState" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "proposalDecidedAt" TIMESTAMPTZ(6);
