import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";
import { APP_TIMEZONE } from "../lib/dateRange.js";
import { REPORT_HEADERS, parseLocale } from "@garage/shared";

// 서버 컨테이너는 TZ가 UTC라 getHours() 등을 쓰면 트립 시각이 KST와 9시간 어긋난다.
// 화면과 같은 기준(Asia/Seoul)으로 찍는다.
const csvDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function formatCsvDate(val: Date): string {
  // sv-SE 포맷은 "YYYY-MM-DD HH:mm:ss"
  return csvDateFormatter.format(val);
}

// 주유·정비 날짜는 날짜만 입력받아 UTC 자정으로 저장된다. KST 시각으로 바꾸면 없는 "09:00:00"이
// 붙으므로 저장된 달력 날짜 그대로 YYYY-MM-DD만 찍는다.
function formatCsvDateOnly(val: Date): string {
  return val.toISOString().slice(0, 10);
}

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) {
    return formatCsvDate(val);
  }
  let str = String(val);
  // 스프레드시트가 수식으로 실행하지 않도록 =, +, -, @, 탭, CR로 시작하는 "문자열"에는 작은따옴표를 붙인다
  // (가족 구성원 누구나 메모·상호명을 입력할 수 있다). 숫자 컬럼(음수 포함)은 건드리지 않는다.
  if (typeof val === "string" && /^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  if (str.includes(",") || str.includes("\"") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function reportsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/vehicles/:id/reports/export
  app.get("/:id/reports/export", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;

    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: { name: true, plate: true, fuelType: true },
    });
    if (!vehicle) return reply.code(404).send({ error: "vehicle not found" });

    const { category, period, lang } = request.query as {
      category: "trips" | "maintenance" | "fuel";
      period?: "week" | "month" | "year" | "all" | "6m" | "1y" | "1w" | "1m";
      lang?: string;
    };

    if (!category || !["trips", "maintenance", "fuel"].includes(category)) {
      return reply.code(400).send({ error: "Invalid category" });
    }

    const locale = parseLocale(lang);
    const headers = REPORT_HEADERS[locale];

    let dateFilter: Date | undefined = undefined;
    if (period && period !== "all") {
      const now = new Date();
      if (period === "week" || period === "1w") {
        dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === "month" || period === "1m") {
        dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (period === "year" || period === "1y") {
        dateFilter = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      } else if (period === "6m") {
        dateFilter = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      }
    }

    let csvContent = "\uFEFF"; // UTF-8 BOM to prevent MS Excel Korean character corruption

    if (category === "trips") {
      // Header
      csvContent += headers.trips;

      const trips = await prisma.trip.findMany({
        where: {
          vehicleId: id,
          ...(dateFilter ? { startTime: { gte: dateFilter } } : {}),
        },
        orderBy: { startTime: "asc" },
      });

      for (const trip of trips) {
        csvContent += [
          escapeCsv(trip.startTime),
          escapeCsv(trip.endTime),
          escapeCsv(trip.distanceKm),
          escapeCsv(trip.avgSpeed),
          escapeCsv(trip.idleTimeSec),
          escapeCsv(trip.notes),
        ].join(",") + "\n";
      }
    } else if (category === "maintenance") {
      // Header
      csvContent += headers.maintenance;

      const records = await prisma.maintenanceRecord.findMany({
        where: {
          vehicleId: id,
          ...(dateFilter ? { date: { gte: dateFilter } } : {}),
        },
        orderBy: { date: "asc" },
      });

      for (const rec of records) {
        const catLabel = rec.category === "ADMINISTRATIVE" ? headers.categoryAdministrative : headers.categoryMaintenance;

        csvContent += [
          escapeCsv(formatCsvDateOnly(rec.date)),
          escapeCsv(rec.odometer),
          escapeCsv(rec.type),
          escapeCsv(catLabel),
          escapeCsv(rec.shop),
          escapeCsv(rec.cost),
          escapeCsv(rec.notes),
        ].join(",") + "\n";
      }
    } else if (category === "fuel") {
      const isEv = vehicle.fuelType === "ELECTRIC";

      // Header
      if (isEv) {
        csvContent += headers.charge;
      } else {
        csvContent += headers.fuel;
      }

      // 연비는 직전 "가득 주유" 이후 넣은 리터 합계로 계산한다(웹의 computeFuelEfficiencyPoints와 동일).
      // 기간 필터 밖의 이전 기록이 필요하므로 전체를 읽고, 출력할 행만 기간으로 거른다.
      const allLogs = await prisma.fuelLog.findMany({
        where: { vehicleId: id },
        orderBy: [{ date: "asc" }, { odometer: "asc" }],
      });

      let prevFullTank: typeof allLogs[0] | null = null;
      let litersSincePrevFullTank = 0;

      for (const log of allLogs) {
        litersSincePrevFullTank += log.liters;
        let efficiency = "";
        if (log.fullTank) {
          if (prevFullTank && log.odometer > prevFullTank.odometer && litersSincePrevFullTank > 0) {
            const distance = log.odometer - prevFullTank.odometer;
            efficiency = (distance / litersSincePrevFullTank).toFixed(2);
          }
          prevFullTank = log;
          litersSincePrevFullTank = 0;
        }

        if (dateFilter && log.date < dateFilter) continue;

        const unitPrice = log.liters > 0 ? Math.round(log.cost / log.liters) : "";

        csvContent += [
          escapeCsv(formatCsvDateOnly(log.date)),
          escapeCsv(log.odometer),
          escapeCsv(log.liters),
          escapeCsv(unitPrice),
          escapeCsv(log.cost),
          escapeCsv(log.location),
          escapeCsv(efficiency),
          escapeCsv(log.fullTank ? headers.yes : headers.no),
          escapeCsv(""), // FuelLog doesn't have a notes field
        ].join(",") + "\n";
      }
    }

    const safePlate = (vehicle.plate || vehicle.name || "vehicle").replace(/[^a-zA-Z0-9가-힣]/g, "_");
    const filename = `${safePlate}_${category}_${period || "all"}_${formatCsvDate(new Date()).slice(0, 10)}.csv`;

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      // ASCII 대체 이름(filename)과 UTF-8 이름(filename*)을 함께 준다. 퍼센트 인코딩 값을 따옴표 안의
      // 일반 filename에 넣으면 디코딩하지 않는 브라우저에서 한글 번호판 파일명이 깨진다.
      .header(
        "Content-Disposition",
        `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      )
      .send(csvContent);
  });
}
