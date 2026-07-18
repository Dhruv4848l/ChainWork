-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ROOT_SUPER_ADMIN', 'VERIFICATION_OFFICER', 'MODERATION_OFFICER', 'SUPPORT_AGENT', 'FINANCE_COMPLIANCE_OFFICER', 'ANALYST', 'JURY');

-- CreateEnum
CREATE TYPE "JurorStatus" AS ENUM ('PENDING', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ValueTier" AS ENUM ('SMALL', 'STANDARD', 'LARGE');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('INTAKE', 'EVIDENCE', 'COMMIT', 'REVEAL', 'VERDICT', 'EXECUTED', 'APPEALED', 'CLOSED');

-- CreateEnum
CREATE TYPE "VerdictChoice" AS ENUM ('RELEASE_WORKER', 'REFUND_CLIENT', 'SPLIT');

-- CreateEnum
CREATE TYPE "ConfigValueType" AS ENUM ('STRING', 'NUMBER', 'PERCENT', 'DURATION', 'JSON');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "totpSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JurorProfile" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "stakeBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "agreementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "casesCount" INTEGER NOT NULL DEFAULT 0,
    "status" "JurorStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JurorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorAdminId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeCase" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT,
    "subjectHireId" TEXT NOT NULL,
    "subjectPhaseId" TEXT NOT NULL,
    "clientLabel" TEXT NOT NULL,
    "workerLabel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "valueTier" "ValueTier" NOT NULL,
    "panelSize" INTEGER NOT NULL,
    "escrowAmount" DECIMAL(12,2) NOT NULL,
    "escrowInstanceAddress" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'INTAKE',
    "commitDeadline" TIMESTAMP(3),
    "revealDeadline" TIMESTAMP(3),
    "verdictChoice" "VerdictChoice",
    "verdictSplitPct" INTEGER,
    "appealOfCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisputeCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JuryAssignment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "jurorId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JuryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JuryVote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "jurorId" TEXT NOT NULL,
    "commitHash" TEXT,
    "committedAt" TIMESTAMP(3),
    "revealedChoice" "VerdictChoice",
    "revealedSplitPct" INTEGER,
    "salt" TEXT,
    "revealedAt" TIMESTAMP(3),
    "isMajority" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JuryVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "submittedByLabel" TEXT NOT NULL,
    "fileRef" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" "ConfigValueType" NOT NULL DEFAULT 'STRING',
    "category" TEXT NOT NULL,
    "hint" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "JurorProfile_platformUserId_key" ON "JurorProfile"("platformUserId");

-- CreateIndex
CREATE UNIQUE INDEX "JuryAssignment_caseId_jurorId_key" ON "JuryAssignment"("caseId", "jurorId");

-- CreateIndex
CREATE UNIQUE INDEX "JuryVote_caseId_jurorId_key" ON "JuryVote"("caseId", "jurorId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConfig_key_key" ON "PlatformConfig"("key");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JuryAssignment" ADD CONSTRAINT "JuryAssignment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DisputeCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JuryAssignment" ADD CONSTRAINT "JuryAssignment_jurorId_fkey" FOREIGN KEY ("jurorId") REFERENCES "JurorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JuryVote" ADD CONSTRAINT "JuryVote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DisputeCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JuryVote" ADD CONSTRAINT "JuryVote_jurorId_fkey" FOREIGN KEY ("jurorId") REFERENCES "JurorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DisputeCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
