-- AlterTable
ALTER TABLE "JurorProfile" ADD COLUMN     "adminUserId" TEXT;

-- AlterTable
ALTER TABLE "JuryAssignment" ADD COLUMN     "removedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "JurorProfile_adminUserId_key" ON "JurorProfile"("adminUserId");

-- AddForeignKey
ALTER TABLE "JurorProfile" ADD CONSTRAINT "JurorProfile_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

