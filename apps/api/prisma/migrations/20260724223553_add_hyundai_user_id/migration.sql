-- AlterTable
ALTER TABLE "HyundaiAccountLink" ADD COLUMN     "hyundaiUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "HyundaiAccountLink_hyundaiUserId_key" ON "HyundaiAccountLink"("hyundaiUserId");

