-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "externalLinkedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WalletLinkChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletLinkChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletLinkChallenge_nonce_key" ON "WalletLinkChallenge"("nonce");

-- CreateIndex
CREATE INDEX "WalletLinkChallenge_userId_createdAt_idx" ON "WalletLinkChallenge"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WalletLinkChallenge" ADD CONSTRAINT "WalletLinkChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
