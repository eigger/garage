import { z } from "zod";

// 관리자가 UI에서 직접 관리하는 외부 연동 키 화이트리스트.
// 새 연동(지도 API 등)을 추가할 때는 여기에만 키를 더하면 된다.
export const settingKeySchema = z.enum([
  "OPINET_API_KEY",
  "EV_CHARGER_API_KEY",
  // data.go.kr 활용신청은 기본 이용기간이 2년이라 갱신을 안 하면 자동 만료된다.
  // 만료일은 API로 조회할 방법이 없어 관리자가 직접 입력해두고, 다가오면 경고를 띄운다.
  "EV_CHARGER_API_KEY_EXPIRES_AT",
  "KAKAO_MAP_APP_KEY",
  "NAVER_MAP_CLIENT_ID",
  "TMAP_APP_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
]);
export type SettingKey = z.infer<typeof settingKeySchema>;

export const settingUpdateSchema = z.object({
  value: z.string().min(1),
});
export type SettingUpdateInput = z.infer<typeof settingUpdateSchema>;
