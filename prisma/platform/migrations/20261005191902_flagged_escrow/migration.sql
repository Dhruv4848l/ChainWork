-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'REVIEWED');

-- CreateTable
CREATE TABLE "FlaggedEscrow" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "onchainClient" TEXT NOT NULL,
    "onchainWorker" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amountRaw" TEXT NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlaggedEscrow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlaggedEscrow_phaseId_key" ON "FlaggedEscrow"("phaseId");

-- CreateIndex
CREATE INDEX "FlaggedEscrow_status_detectedAt_idx" ON "FlaggedEscrow"("status", "detectedAt");

-- AddForeignKey
ALTER TABLE "FlaggedEscrow" ADD CONSTRAINT "FlaggedEscrow_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
