-- CreateEnum
CREATE TYPE "SpaceHealthStatus" AS ENUM ('NEW', 'ACTIVE', 'FRAGILE', 'DORMANT');

-- NOTE: Prisma's own diff wanted to `DROP INDEX "spaces_search_text_trgm_idx"`
-- here - it has no way to see that index (added by hand in migration
-- 20260905152927_space_search, since gin_trgm_ops isn't expressible in
-- schema.prisma) and treats it as drift to remove. Deliberately deleted
-- from this migration - dropping it would silently destroy Task 11's
-- search performance without changing anything this task actually asked
-- for. Any *future* migrate diff will keep proposing the same drop for the
-- same reason; keep deleting it, the same way this comment does now.

-- CreateTable
CREATE TABLE "space_health_snapshots" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "status" "SpaceHealthStatus" NOT NULL,
    "cardCount" INTEGER NOT NULL DEFAULT 0,
    "contributorCount" INTEGER NOT NULL DEFAULT 0,
    "meaningfulViewCount" INTEGER NOT NULL DEFAULT 0,
    "firstUseLatencySeconds" INTEGER,
    "roleActivity" JSONB NOT NULL,
    "crossRoleCardRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "appliedRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservationClosedRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reportQuality" DOUBLE PRECISION,
    "lastActivityAt" TIMESTAMPTZ(6),
    "suggestions" JSONB NOT NULL,
    "computedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "space_health_snapshots_spaceId_key" ON "space_health_snapshots"("spaceId");

-- AddForeignKey
ALTER TABLE "space_health_snapshots" ADD CONSTRAINT "space_health_snapshots_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
