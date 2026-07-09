-- AlterTable
ALTER TABLE "FuelLog" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "opinetStationId" TEXT;
