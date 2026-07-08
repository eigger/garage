// 최초 관리자 계정과 연료타입별 정비 마스터 프리셋을 만드는 시드 스크립트.
// 공개 회원가입이 없기 때문에 배포 후 한 번 `npm run seed -w apps/api`로 실행해야 한다.
// 여러 번 실행해도 안전하다 (계정은 이메일 중복 체크, 프리셋은 upsert).
import bcrypt from "bcryptjs";
import { PrismaClient, type FuelType } from "@prisma/client";

const prisma = new PrismaClient();

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "changeme123";
  const name = process.env.ADMIN_NAME ?? "관리자";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`이미 존재하는 계정입니다: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: { name, email, passwordHash, role: "ADMIN" },
  });

  console.log(`관리자 계정 생성 완료: ${admin.email} (id: ${admin.id})`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`기본 비밀번호(${password})를 사용했습니다. 로그인 후 즉시 변경하세요.`);
  }
}

type PresetSeed = {
  fuelType: FuelType;
  name: string;
  intervalKm?: number;
  intervalMonths?: number;
};

// 차에 대해 잘 몰라도 이 목록만 따라가면 기본적인 관리가 가능하도록 구성한 연료타입별
// 정비 마스터 프리셋. 국내 통상 권장 주기 기준의 기본값 — 필요에 맞게 관리자가 수정 가능.
const PRESETS: PresetSeed[] = [
  // 공통성 항목은 연료타입마다 반복 정의 (타입별로 독립적으로 수정 가능해야 하므로)
  { fuelType: "GASOLINE", name: "엔진오일·오일필터 교체", intervalKm: 10000, intervalMonths: 6 },
  { fuelType: "GASOLINE", name: "엔진 에어필터 교체", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "GASOLINE", name: "에어컨(캐빈) 필터 교체", intervalKm: 15000, intervalMonths: 12 },
  { fuelType: "GASOLINE", name: "점화플러그 교체", intervalKm: 40000 },
  { fuelType: "GASOLINE", name: "흡기 계통(스로틀바디·인젝터) 클리닝", intervalKm: 20000 },
  { fuelType: "GASOLINE", name: "연료필터 교체", intervalKm: 40000 },
  { fuelType: "GASOLINE", name: "브레이크 패드 점검", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "GASOLINE", name: "브레이크액 교체", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "GASOLINE", name: "냉각수(부동액) 교체", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "GASOLINE", name: "변속기 오일 교체", intervalKm: 40000 },
  { fuelType: "GASOLINE", name: "타이어 위치 교환", intervalKm: 10000 },
  { fuelType: "GASOLINE", name: "배터리 점검", intervalMonths: 24 },
  { fuelType: "GASOLINE", name: "와이퍼 블레이드 교체", intervalMonths: 12 },

  { fuelType: "DIESEL", name: "엔진오일·오일필터 교체", intervalKm: 10000, intervalMonths: 6 },
  { fuelType: "DIESEL", name: "경유(연료) 필터 교체", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "DIESEL", name: "엔진 에어필터 교체", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "DIESEL", name: "에어컨(캐빈) 필터 교체", intervalKm: 15000, intervalMonths: 12 },
  { fuelType: "DIESEL", name: "DPF(매연저감장치) 점검·클리닝", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "DIESEL", name: "요소수(AdBlue) 보충 점검", intervalKm: 10000 },
  { fuelType: "DIESEL", name: "글로우플러그 점검", intervalKm: 60000 },
  { fuelType: "DIESEL", name: "브레이크 패드 점검", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "DIESEL", name: "브레이크액 교체", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "DIESEL", name: "냉각수(부동액) 교체", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "DIESEL", name: "변속기 오일 교체", intervalKm: 40000 },
  { fuelType: "DIESEL", name: "타이어 위치 교환", intervalKm: 10000 },
  { fuelType: "DIESEL", name: "배터리 점검", intervalMonths: 24 },
  { fuelType: "DIESEL", name: "와이퍼 블레이드 교체", intervalMonths: 12 },

  { fuelType: "LPG", name: "엔진오일·오일필터 교체", intervalKm: 10000, intervalMonths: 6 },
  { fuelType: "LPG", name: "LPG 필터 교체", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "LPG", name: "엔진 에어필터 교체", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "LPG", name: "에어컨(캐빈) 필터 교체", intervalKm: 15000, intervalMonths: 12 },
  { fuelType: "LPG", name: "점화플러그 교체", intervalKm: 40000 },
  { fuelType: "LPG", name: "인젝터·솔레노이드밸브 클리닝", intervalKm: 20000 },
  { fuelType: "LPG", name: "LPG 봄베(연료탱크) 밸브 점검", intervalMonths: 12 },
  { fuelType: "LPG", name: "LPG 용기 재검사(법정)", intervalMonths: 60 },
  { fuelType: "LPG", name: "브레이크 패드 점검", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "LPG", name: "브레이크액 교체", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "LPG", name: "냉각수(부동액) 교체", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "LPG", name: "타이어 위치 교환", intervalKm: 10000 },
  { fuelType: "LPG", name: "배터리 점검", intervalMonths: 24 },
  { fuelType: "LPG", name: "와이퍼 블레이드 교체", intervalMonths: 12 },

  { fuelType: "ELECTRIC", name: "감속기(리덕션기어) 오일 교체", intervalKm: 60000 },
  { fuelType: "ELECTRIC", name: "에어컨(캐빈) 필터 교체", intervalKm: 15000, intervalMonths: 12 },
  { fuelType: "ELECTRIC", name: "브레이크 패드 점검", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "ELECTRIC", name: "브레이크액 교체", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "ELECTRIC", name: "냉각수(배터리·모터 냉각) 교체", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "ELECTRIC", name: "타이어 위치 교환", intervalKm: 10000 },
  { fuelType: "ELECTRIC", name: "12V 보조배터리 점검", intervalMonths: 12 },
  { fuelType: "ELECTRIC", name: "구동모터·배터리 상태 점검", intervalMonths: 12 },
  { fuelType: "ELECTRIC", name: "와이퍼 블레이드 교체", intervalMonths: 12 },
];

async function seedMaintenancePresets() {
  for (let i = 0; i < PRESETS.length; i++) {
    const preset = PRESETS[i];
    await prisma.maintenancePresetTemplate.upsert({
      where: { fuelType_name: { fuelType: preset.fuelType, name: preset.name } },
      update: {
        intervalKm: preset.intervalKm ?? null,
        intervalMonths: preset.intervalMonths ?? null,
      },
      create: {
        fuelType: preset.fuelType,
        name: preset.name,
        intervalKm: preset.intervalKm ?? null,
        intervalMonths: preset.intervalMonths ?? null,
        sortOrder: i,
      },
    });
  }
  console.log(`정비 마스터 프리셋 ${PRESETS.length}건 확인/생성 완료`);
}

async function main() {
  await seedAdmin();
  await seedMaintenancePresets();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
