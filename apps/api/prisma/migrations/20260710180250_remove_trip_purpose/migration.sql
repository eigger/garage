/*
  Warnings:

  - You are about to drop the column `purpose` on the `Trip` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Trip" DROP COLUMN "purpose";

-- DropEnum
DROP TYPE "TripPurpose";
