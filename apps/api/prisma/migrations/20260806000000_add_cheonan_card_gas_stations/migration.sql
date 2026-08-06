-- CreateTable
CREATE TABLE "CheonanCardMerchant" (
    "konaSeq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "tel" TEXT,
    "bizType" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "opinetId" TEXT,
    "matchMethod" TEXT,
    "opinetName" TEXT,
    "brand" TEXT,
    "roadAddress" TEXT,
    "opinetLat" DOUBLE PRECISION,
    "opinetLon" DOUBLE PRECISION,
    "lpgYn" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheonanCardMerchant_pkey" PRIMARY KEY ("konaSeq")
);

-- CreateTable
CREATE TABLE "CheonanCardStationPrice" (
    "opinetId" TEXT NOT NULL,
    "prodCd" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "tradeAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheonanCardStationPrice_pkey" PRIMARY KEY ("opinetId","prodCd")
);

-- CreateTable
CREATE TABLE "CheonanCardSyncState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "merchantSyncedAt" TIMESTAMP(3),
    "pricesSyncedAt" TIMESTAMP(3),
    "merchantSyncStartedAt" TIMESTAMP(3),
    "priceSyncStartedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheonanCardSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheonanCardMerchant_opinetId_idx" ON "CheonanCardMerchant"("opinetId");
