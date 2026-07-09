-- AlterTable
ALTER TABLE "MaintenancePresetTemplate" ADD COLUMN "category" "RecordCategory" NOT NULL DEFAULT 'MAINTENANCE';

-- AlterTable
ALTER TABLE "MaintenancePresetTemplate" ALTER COLUMN "fuelType" DROP NOT NULL;

-- DropIndex
DROP INDEX "MaintenancePresetTemplate_fuelType_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "MaintenancePresetTemplate_category_fuelType_name_key" ON "MaintenancePresetTemplate"("category", "fuelType", "name");
