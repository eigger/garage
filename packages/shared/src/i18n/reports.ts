import type { Locale } from "./locale.js";

export const REPORT_HEADERS: Record<
  Locale,
  {
    trips: string;
    maintenance: string;
    fuel: string;
    charge: string;
    categoryMaintenance: string;
    categoryAdministrative: string;
    yes: string;
    no: string;
  }
> = {
  ko: {
    trips: "출발시간,도착시간,주행거리(km),평균속도(km/h),공회전시간(초),메모\n",
    maintenance: "정비일자,누적주행거리(km),항목,구분,정비업체,비용(원),메모\n",
    fuel: "주유일자,누적주행거리(km),주유량(L),단가(원/L),결제금액(원),주유소,연비(km/L),가득채움여부,메모\n",
    charge: "충전일자,누적주행거리(km),충전량(kWh),단가(원/kWh),결제금액(원),충전소,전비(km/kWh),가득채움여부,메모\n",
    categoryMaintenance: "정비",
    categoryAdministrative: "행정·법정",
    yes: "예",
    no: "아니오",
  },
  en: {
    trips: "Start Time,End Time,Distance (km),Average Speed (km/h),Idle Time (s),Notes\n",
    maintenance: "Date,Odometer (km),Item,Category,Shop,Cost,Notes\n",
    fuel: "Date,Odometer (km),Amount (L),Unit Price,Total Cost,Gas Station,Efficiency (km/L),Full Tank,Notes\n",
    charge: "Date,Odometer (km),Amount (kWh),Unit Price,Total Cost,Charging Station,Efficiency (km/kWh),Full Charge,Notes\n",
    categoryMaintenance: "Maintenance",
    categoryAdministrative: "Administrative",
    yes: "Yes",
    no: "No",
  },
};
