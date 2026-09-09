-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "endOdometer" INTEGER;

-- 기존 트립 백필: 원시 텔레메트리는 1년치만 보관하므로(telemetryRetention),
-- 아직 남아 있는 포인트가 있는 트립만 종료 시점의 계기판 값으로 채운다.
UPDATE "Trip" t
SET "endOdometer" = last_point.odometer
FROM (
  SELECT DISTINCT ON ("tripId") "tripId", odometer
  FROM "TelemetryRaw"
  WHERE "tripId" IS NOT NULL AND odometer IS NOT NULL AND odometer > 0
  ORDER BY "tripId", time DESC
) AS last_point
WHERE t.id = last_point."tripId";
