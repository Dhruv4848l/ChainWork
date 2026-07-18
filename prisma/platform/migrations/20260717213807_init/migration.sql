-- CreateEnum
CREATE TYPE "Role" AS ENUM ('WORKER', 'CLIENT');

-- CreateEnum
CREATE TYPE "KycTier" AS ENUM ('UNVERIFIED', 'BASIC', 'VERIFIED', 'TRUSTED');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "SkillProficiency" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'SKILLED', 'EXPERT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'EXPIRED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FundingMode" AS ENUM ('FUND_NOW', 'FUND_AT_HIRE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'HIRED');

-- CreateEnum
CREATE TYPE "HireStatus" AS ENUM ('ACTIVE', 'NO_SHOW_FLAGGED', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('PENDING_FUNDING', 'FUNDED', 'IN_PROGRESS', 'DELIVERED', 'VERIFICATION_WINDOW_OPEN', 'RELEASED', 'DISPUTED', 'AUTO_CANCELLED');

-- CreateEnum
CREATE TYPE "EscrowTxType" AS ENUM ('FUND', 'RELEASE', 'REFUND', 'SPLIT', 'STAKE_LOCK', 'STAKE_FORFEIT', 'STAKE_REFUND');

-- CreateEnum
CREATE TYPE "EscrowTxStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "StakeStatus" AS ENUM ('LOCKED', 'FORFEITED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReviewDirection" AS ENUM ('CLIENT_TO_WORKER', 'WORKER_TO_CLIENT');

-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('QUALITY', 'NO_SHOW', 'PAYMENT', 'CONDUCT', 'DAMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "TriageLane" AS ENUM ('TRIVIAL', 'POLICY', 'FINANCIAL', 'FRAUD');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'TRIAGED', 'ESCALATED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('APPLICATION', 'ESCROW', 'PAYMENT', 'REMINDER', 'DISPUTE', 'JURY', 'MESSAGE', 'REVIEW', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "kycTier" "KycTier" NOT NULL DEFAULT 'UNVERIFIED',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "experienceYears" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "locationRadiusKm" INTEGER NOT NULL DEFAULT 10,
    "availability" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "portfolioImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedJobsCount" INTEGER NOT NULL DEFAULT 0,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingPunctuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCommunication" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "juryOptIn" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientType" "ClientType" NOT NULL DEFAULT 'INDIVIDUAL',
    "companyName" TEXT,
    "address" TEXT,
    "businessRegNumber" TEXT,
    "escrowReliabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "hiresCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerSkill" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "proficiency" "SkillProficiency" NOT NULL DEFAULT 'SKILLED',

    CONSTRAINT "WorkerSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "hoursPerDay" INTEGER,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "fundingMode" "FundingMode" NOT NULL DEFAULT 'FUND_AT_HIRE',
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRoleLineItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "skillId" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "perPersonRate" DECIMAL(12,2) NOT NULL,
    "hiredCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobRoleLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "roleLineItemId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "coverNote" TEXT,
    "proposedRate" DECIMAL(12,2),
    "fitScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hire" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "roleLineItemId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" "HireStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalValue" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "hireId" TEXT NOT NULL,
    "totalValue" DECIMAL(12,2) NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "scope" TEXT NOT NULL,
    "cancellationTerms" TEXT,
    "onChainEscrowAddress" TEXT,
    "acceptedByClient" BOOLEAN NOT NULL DEFAULT false,
    "acceptedByWorker" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" TEXT NOT NULL,
    "hireId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "PhaseStatus" NOT NULL DEFAULT 'PENDING_FUNDING',
    "deliveredAt" TIMESTAMP(3),
    "verificationDeadline" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "onChainEscrowAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowTransaction" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT,
    "type" "EscrowTxType" NOT NULL,
    "status" "EscrowTxStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "onChainTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscrowTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryStake" (
    "id" TEXT NOT NULL,
    "hireId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "StakeStatus" NOT NULL DEFAULT 'LOCKED',
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "onChainTxHash" TEXT,

    CONSTRAINT "DeliveryStake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "custodialAddress" TEXT NOT NULL,
    "externalAddress" TEXT,
    "balanceCache" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "hireId" TEXT NOT NULL,
    "direction" "ReviewDirection" NOT NULL,
    "authorId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "ratingOverall" INTEGER NOT NULL,
    "ratingPunctuality" INTEGER,
    "ratingQuality" INTEGER,
    "ratingCommunication" INTEGER,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "hireId" TEXT NOT NULL,
    "phaseId" TEXT,
    "filedById" TEXT NOT NULL,
    "category" "ComplaintCategory" NOT NULL,
    "triageLane" "TriageLane",
    "description" TEXT NOT NULL,
    "evidenceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "hireId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkUrl" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerProfile_userId_key" ON "WorkerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_userId_key" ON "ClientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerSkill_workerProfileId_skillId_key" ON "WorkerSkill"("workerProfileId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_roleLineItemId_workerId_key" ON "JobApplication"("roleLineItemId", "workerId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_hireId_key" ON "Contract"("hireId");

-- CreateIndex
CREATE UNIQUE INDEX "Phase_hireId_index_key" ON "Phase"("hireId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryStake_hireId_key" ON "DeliveryStake"("hireId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_custodialAddress_key" ON "Wallet"("custodialAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_externalAddress_key" ON "Wallet"("externalAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Review_hireId_direction_key" ON "Review"("hireId", "direction");

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerSkill" ADD CONSTRAINT "WorkerSkill_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerSkill" ADD CONSTRAINT "WorkerSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRoleLineItem" ADD CONSTRAINT "JobRoleLineItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRoleLineItem" ADD CONSTRAINT "JobRoleLineItem_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_roleLineItemId_fkey" FOREIGN KEY ("roleLineItemId") REFERENCES "JobRoleLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hire" ADD CONSTRAINT "Hire_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hire" ADD CONSTRAINT "Hire_roleLineItemId_fkey" FOREIGN KEY ("roleLineItemId") REFERENCES "JobRoleLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hire" ADD CONSTRAINT "Hire_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hire" ADD CONSTRAINT "Hire_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_hireId_fkey" FOREIGN KEY ("hireId") REFERENCES "Hire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_hireId_fkey" FOREIGN KEY ("hireId") REFERENCES "Hire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryStake" ADD CONSTRAINT "DeliveryStake_hireId_fkey" FOREIGN KEY ("hireId") REFERENCES "Hire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_hireId_fkey" FOREIGN KEY ("hireId") REFERENCES "Hire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_hireId_fkey" FOREIGN KEY ("hireId") REFERENCES "Hire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_hireId_fkey" FOREIGN KEY ("hireId") REFERENCES "Hire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
