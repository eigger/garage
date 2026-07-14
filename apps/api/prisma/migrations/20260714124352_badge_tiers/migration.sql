-- 뱃지 카탈로그가 개별 키(first_maintenance 등)에서 등급형(maintenance_master 등)으로
-- 바뀌면서 기존 badgeKey 값이 전부 무효해진다. 다음 XP 적립 때 새 키로 재계산되므로 안전하게 비운다.
DELETE FROM "VehicleBadge";

-- AlterTable
ALTER TABLE "VehicleBadge"
  ADD COLUMN "tier" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
