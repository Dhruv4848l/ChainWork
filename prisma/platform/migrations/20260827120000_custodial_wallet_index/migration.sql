-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "custodialIndex" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_custodialIndex_key" ON "Wallet"("custodialIndex");
