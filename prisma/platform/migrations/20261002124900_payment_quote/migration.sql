-- CreateTable
CREATE TABLE "PaymentQuote" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "assetKey" TEXT NOT NULL,
    "assetSymbol" TEXT NOT NULL,
    "assetAddress" TEXT,
    "assetDecimals" INTEGER NOT NULL,
    "chainId" INTEGER,
    "rate" DECIMAL(24,8) NOT NULL,
    "amountInr" DECIMAL(14,2) NOT NULL,
    "assetAmount" TEXT NOT NULL,
    "workerAddress" TEXT NOT NULL,
    "escrowAddress" TEXT,
    "pricesStale" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentQuote_phaseId_createdAt_idx" ON "PaymentQuote"("phaseId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentQuote_userId_createdAt_idx" ON "PaymentQuote"("userId", "createdAt");
