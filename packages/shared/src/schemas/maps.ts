import { z } from "zod";

export const mapProviderSchema = z.enum(["osm", "kakao", "naver", "tmap"]);
export type MapProvider = z.infer<typeof mapProviderSchema>;
