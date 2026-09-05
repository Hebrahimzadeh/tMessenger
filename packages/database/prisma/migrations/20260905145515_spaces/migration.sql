-- CreateEnum
CREATE TYPE "SpaceStatus" AS ENUM ('DRAFT', 'PRECHECK_REQUIRED', 'HUMAN_REVIEW', 'PUBLISHED', 'TEMPORARILY_SUSPENDED', 'ARCHIVED', 'REMOVED');

-- CreateEnum
CREATE TYPE "SpaceGateVerdict" AS ENUM ('ALLOW', 'REVISE', 'HUMAN_REVIEW', 'BLOCK');

-- CreateTable
CREATE TABLE "spaces" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "SpaceStatus" NOT NULL DEFAULT 'DRAFT',
    "creatorId" UUID NOT NULL,
    "publishedAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_definition_versions" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "audience" TEXT,
    "participationMethods" JSONB NOT NULL,
    "cardHints" JSONB,
    "primaryRoleIds" JSONB NOT NULL,
    "supplementaryRoleIds" JSONB NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "gateVerdict" "SpaceGateVerdict",
    "gateReason" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_definition_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_participation_roles" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_participation_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_role_memberships" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_role_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_invites" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_followers" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_followers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spaces_slug_key" ON "spaces"("slug");

-- CreateIndex
CREATE INDEX "spaces_status_idx" ON "spaces"("status");

-- CreateIndex
CREATE UNIQUE INDEX "space_definition_versions_spaceId_versionNumber_key" ON "space_definition_versions"("spaceId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "space_participation_roles_spaceId_key_key" ON "space_participation_roles"("spaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "space_role_memberships_userId_roleId_key" ON "space_role_memberships"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "space_invites_token_key" ON "space_invites"("token");

-- CreateIndex
CREATE INDEX "space_invites_spaceId_idx" ON "space_invites"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "space_followers_spaceId_userId_key" ON "space_followers"("spaceId", "userId");

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_definition_versions" ADD CONSTRAINT "space_definition_versions_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_definition_versions" ADD CONSTRAINT "space_definition_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_participation_roles" ADD CONSTRAINT "space_participation_roles_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_role_memberships" ADD CONSTRAINT "space_role_memberships_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_role_memberships" ADD CONSTRAINT "space_role_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_role_memberships" ADD CONSTRAINT "space_role_memberships_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "space_participation_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_invites" ADD CONSTRAINT "space_invites_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_invites" ADD CONSTRAINT "space_invites_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_followers" ADD CONSTRAINT "space_followers_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_followers" ADD CONSTRAINT "space_followers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
