-- CreateTable
CREATE TABLE "HyundaiAccountLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HyundaiAccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HyundaiVehicleLink" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "accountLinkId" TEXT NOT NULL,
    "hyundaiCarId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HyundaiVehicleLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HyundaiAccountLink_userId_key" ON "HyundaiAccountLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HyundaiVehicleLink_vehicleId_key" ON "HyundaiVehicleLink"("vehicleId");

-- AddForeignKey
ALTER TABLE "HyundaiAccountLink" ADD CONSTRAINT "HyundaiAccountLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HyundaiVehicleLink" ADD CONSTRAINT "HyundaiVehicleLink_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HyundaiVehicleLink" ADD CONSTRAINT "HyundaiVehicleLink_accountLinkId_fkey" FOREIGN KEY ("accountLinkId") REFERENCES "HyundaiAccountLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

