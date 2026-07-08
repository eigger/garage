-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('GASOLINE', 'DIESEL', 'LPG', 'ELECTRIC');

-- AlterTable
ALTER TABLE "ConsumablePart" ADD COLUMN     "presetTemplateId" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "fuelType" "FuelType";

-- CreateTable
CREATE TABLE "MaintenancePresetTemplate" (
    "id" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "name" TEXT NOT NULL,
    "intervalKm" INTEGER,
    "intervalMonths" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenancePresetTemplate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ConsumablePart" ADD CONSTRAINT "ConsumablePart_presetTemplateId_fkey" FOREIGN KEY ("presetTemplateId") REFERENCES "MaintenancePresetTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
