-- CreateEnum
CREATE TYPE "RecordCategory" AS ENUM ('MAINTENANCE', 'ADMINISTRATIVE');

-- AlterTable
ALTER TABLE "MaintenanceRecord" ADD COLUMN     "category" "RecordCategory" NOT NULL DEFAULT 'MAINTENANCE';

-- AlterTable
ALTER TABLE "ConsumablePart" ADD COLUMN     "category" "RecordCategory" NOT NULL DEFAULT 'MAINTENANCE';
