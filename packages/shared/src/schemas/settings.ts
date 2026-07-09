import { z } from "zod";

// 관리자가 UI에서 직접 관리하는 외부 연동 키 화이트리스트.
// 새 연동(지도 API 등)을 추가할 때는 여기에만 키를 더하면 된다.
export const settingKeySchema = z.enum([
  "OPINET_API_KEY",
  "KAKAO_MAP_APP_KEY",
  "NAVER_MAP_CLIENT_ID",
  "TMAP_APP_KEY",
]);
export type SettingKey = z.infer<typeof settingKeySchema>;

export const settingUpdateSchema = z.object({
  value: z.string().min(1),
});
export type SettingUpdateInput = z.infer<typeof settingUpdateSchema>;
