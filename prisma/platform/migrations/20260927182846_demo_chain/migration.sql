-- CreateTable
CREATE TABLE "DemoAccount" (
    "address" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lockedCredit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoAccount_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "DemoEscrow" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "worker" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL,
    "releaseEligibleAfter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoEscrow_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "DemoEscrow_refId_idx" ON "DemoEscrow"("refId");
