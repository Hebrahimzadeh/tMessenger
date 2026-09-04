-- CreateEnum
CREATE TYPE "MfaStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateTable
CREATE TABLE "mfa_enrollments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "status" "MfaStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mfa_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mfa_enrollments_userId_key" ON "mfa_enrollments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_recovery_codes_codeHash_key" ON "mfa_recovery_codes"("codeHash");

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_enrollmentId_idx" ON "mfa_recovery_codes"("enrollmentId");

-- AddForeignKey
ALTER TABLE "mfa_enrollments" ADD CONSTRAINT "mfa_enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "mfa_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
