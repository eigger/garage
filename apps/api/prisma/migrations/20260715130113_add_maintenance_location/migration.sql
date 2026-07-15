-- AlterTable
ALTER TABLE "MaintenanceRecord" ADD COLUMN     "address" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "VehicleBadge" ALTER COLUMN "updatedAt" DROP DEFAULT;
