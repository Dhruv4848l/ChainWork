-- Worker reference charges (per hour / per week) shown on the profile + applicant card.
ALTER TABLE "WorkerProfile" ADD COLUMN     "rateHourly" DECIMAL(10,2);
ALTER TABLE "WorkerProfile" ADD COLUMN     "rateWeekly" DECIMAL(12,2);

-- Contract digital-signature block. Escrow funding is gated on both signatures.
ALTER TABLE "Contract" ADD COLUMN     "documentHash" TEXT;
ALTER TABLE "Contract" ADD COLUMN     "clientSignature" TEXT;
ALTER TABLE "Contract" ADD COLUMN     "clientSignedAt" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN     "clientSignedIp" TEXT;
ALTER TABLE "Contract" ADD COLUMN     "workerSignature" TEXT;
ALTER TABLE "Contract" ADD COLUMN     "workerSignedAt" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN     "workerSignedIp" TEXT;
