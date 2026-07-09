-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "vehicleId" TEXT;

-- AlterTable
ALTER TABLE "FuelLog" ADD COLUMN     "location" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "apiToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_apiToken_key" ON "Vehicle"("apiToken");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
