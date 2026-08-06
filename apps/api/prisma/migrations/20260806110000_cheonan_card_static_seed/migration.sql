-- 정적 seed 전환: 런타임 가맹점 테이블·옛 SyncState 제거, 가격 동기 상태만 유지.

DROP TABLE IF EXISTS "CheonanCardMerchant";

DROP TABLE IF EXISTS "CheonanCardSyncState";

CREATE TABLE IF NOT EXISTS "CheonanCardPriceSyncState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "pricesSyncedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheonanCardPriceSyncState_pkey" PRIMARY KEY ("id")
);
