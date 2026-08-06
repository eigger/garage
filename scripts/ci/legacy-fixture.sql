-- 업그레이드 검증용 "이미 운영 중이던 설치"를 흉내내는 최소 데이터.
--
-- 직전 릴리스 태그의 스키마에 들어가야 하므로, 기본값이 있는 컬럼은 일부러 생략하고
-- 오래전부터 존재해온 필수 컬럼만 채운다. 새 마이그레이션이 기존 행을 건드릴 때
-- (컬럼 추가, 값 변환, 제약 추가 등) 깨지지 않는지 보는 것이 목적이다.
--
-- 이메일에 대문자를 섞어둔 이유: 정규화처럼 기존 행을 UPDATE하는 마이그레이션이
-- 실제로 동작하는지 보려면 정규화가 필요한 데이터가 있어야 한다.

INSERT INTO "User" (id, name, email, "passwordHash", role, "createdAt") VALUES
  ('fixture-admin',  '관리자', 'Fixture.Admin@Example.COM', 'not-a-real-hash', 'ADMIN',   now()),
  ('fixture-member', '배우자', 'fixture.member@example.com', 'not-a-real-hash', 'GENERAL', now());

INSERT INTO "Vehicle" (id, name, "createdAt") VALUES
  ('fixture-vehicle', '아이오닉 5', now());

INSERT INTO "UserVehicleAccess" ("userId", "vehicleId", "canViewLocation") VALUES
  ('fixture-member', 'fixture-vehicle', true);

INSERT INTO "FuelLog" (id, "vehicleId", "userId", date, odometer, liters, cost) VALUES
  ('fixture-fuel-log', 'fixture-vehicle', 'fixture-member', now(), 12000, 40.5, 65000);
