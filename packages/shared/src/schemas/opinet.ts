import { z } from "zod";

export const opinetFuelPriceSchema = z.object({
  prodCd: z.string(),
  price: z.number(),
});

export type OpinetFuelPriceSummary = z.infer<typeof opinetFuelPriceSchema>;

export const opinetStationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string(),
  brandLabel: z.string(),
  distance: z.number(),
  /** 차량 주유종(primaryProdCd) 단가. 정렬·이득순 계산에 쓴다. */
  price: z.number(),
  primaryProdCd: z.string(),
  /** 취급 유종 전체(주유종 포함). 표시 순서용. */
  prices: z.array(opinetFuelPriceSchema),
  // aroundAll.do가 내려주는 GIS 좌표를 WGS84로 변환한 값. 파싱 실패 시 null.
  lat: z.number().nullable(),
  lon: z.number().nullable(),
});

export const opinetStationDetailSchema = opinetStationSummarySchema.extend({
  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  tel: z.string().nullable(),
});

export type OpinetStationSummary = z.infer<typeof opinetStationSummarySchema>;
export type OpinetStationDetail = z.infer<typeof opinetStationDetailSchema>;

// "이득순" — 지역 최저가 후보 중, 가까운 주유소 대비 왕복 기름값을 제하고도
// 실제로 이득인 곳만 순이득(원) 내림차순으로 추려서 보여준다.
export const opinetValuePickSchema = z.object({
  id: z.string(),
  name: z.string(),
  brandLabel: z.string(),
  lat: z.number(),
  lon: z.number(),
  distanceM: z.number(),
  price: z.number(),
  primaryProdCd: z.string(),
  prices: z.array(opinetFuelPriceSchema),
  extraRoundTripKm: z.number(),
  netGain: z.number(),
});

export const opinetValuePicksResponseSchema = z.object({
  baseline: z
    .object({
      id: z.string(),
      name: z.string(),
      brandLabel: z.string(),
      distanceM: z.number(),
      price: z.number(),
    })
    .nullable(),
  insufficientData: z.boolean(),
  picks: z.array(opinetValuePickSchema),
});

export type OpinetValuePick = z.infer<typeof opinetValuePickSchema>;
export type OpinetValuePicksResponse = z.infer<typeof opinetValuePicksResponseSchema>;
