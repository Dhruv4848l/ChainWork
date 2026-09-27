-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('DEMO', 'TESTNET', 'MAINNET');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('FUND', 'RELEASE', 'REFUND', 'SPLIT', 'WITHDRAW', 'TOPUP', 'MOVE_TO_EXTERNAL', 'STAKE_LOCK', 'STAKE_REFUND', 'STAKE_FORFEIT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SignerKind" AS ENUM ('CUSTODIAL', 'EXTERNAL_WALLET', 'DEMO_SIGNATURE', 'RELAYER');

-- CreateEnum
CREATE TYPE "LedgerBucket" AS ENUM ('WALLET', 'ESCROW');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- AlterEnum
ALTER TYPE "PhaseStatus" ADD VALUE 'RESOLVED';

-- AlterTable
ALTER TABLE "EscrowTransaction" ADD COLUMN     "paymentId" TEXT;

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "payerUserId" TEXT,
    "payeeUserId" TEXT,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "amountInr" DECIMAL(14,2) NOT NULL,
    "splitWorkerBps" INTEGER,
    "assetSymbol" TEXT NOT NULL DEFAULT 'cwINR',
    "assetChainId" INTEGER,
    "assetAddress" TEXT,
    "assetAmount" TEXT,
    "quoteId" TEXT,
    "quoteRate" DECIMAL(24,8),
    "signer" "SignerKind" NOT NULL,
    "operation" TEXT NOT NULL,
    "txHash" TEXT,
    "blockNumber" BIGINT,
    "gasUsed" TEXT,
    "gasFeeWei" TEXT,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "phaseId" TEXT,
    "hireId" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "bucket" "LedgerBucket" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amountInr" DECIMAL(14,2) NOT NULL,
    "memo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_txHash_key" ON "PaymentTransaction"("txHash");

-- CreateIndex
CREATE INDEX "PaymentTransaction_payerUserId_initiatedAt_idx" ON "PaymentTransaction"("payerUserId", "initiatedAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_payeeUserId_initiatedAt_idx" ON "PaymentTransaction"("payeeUserId", "initiatedAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_initiatedAt_idx" ON "PaymentTransaction"("status", "initiatedAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_phaseId_idx" ON "PaymentTransaction"("phaseId");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_paymentId_idx" ON "LedgerEntry"("paymentId");

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_payeeUserId_fkey" FOREIGN KEY ("payeeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
