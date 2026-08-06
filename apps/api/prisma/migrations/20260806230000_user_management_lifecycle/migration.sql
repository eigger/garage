-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE');

-- 이메일 소문자 정규화 전 안전장치: 대소문자만 다른 중복 계정이 이미 있으면
-- UPDATE가 unique 제약에 걸려 알 수 없는 에러로 죽는다. 그 전에 어떤 주소가 문제인지
-- 명확히 알려주고 마이그레이션을 멈춘다(관리자가 한쪽 계정을 정리한 뒤 재시도).
DO $$
DECLARE dups TEXT;
BEGIN
  SELECT string_agg(e, ', ') INTO dups FROM (
    SELECT lower(email) AS e FROM "User" GROUP BY lower(email) HAVING count(*) > 1
  ) t;
  IF dups IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot normalize emails to lowercase: these addresses exist more than once ignoring case (%). Remove or rename the duplicate accounts, then re-run the migration.', dups;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 기존 계정 이메일을 소문자로 정규화
UPDATE "User" SET email = lower(email) WHERE email <> lower(email);

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "createdByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Vehicle_createdByUserId_idx" ON "Vehicle"("createdByUserId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
