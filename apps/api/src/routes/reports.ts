import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) {
    // Format date cleanly: YYYY-MM-DD HH:mm:ss
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, "0");
    const dd = String(val.getDate()).padStart(2, "0");
    const hh = String(val.getHours()).padStart(2, "0");
    const min = String(val.getMinutes()).padStart(2, "0");
    const ss = String(val.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  }
  const str = String(val);
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
      period?: "week" | "month" | "year" | "all";
      lang?: "ko" | "en";
    };

    if (!category || !["trips", "maintenance", "fuel"].includes(category)) {
      return reply.code(400).send({ error: "Invalid category" });
    }

    const isEn = lang === "en";
    let dateFilter: Date | undefined = undefined;
    if (period && period !== "all") {
      const now = new Date();
      if (period === "week") {
        dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === "month") {
        dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (period === "year") {
        dateFilter = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      }
    }

    let csvContent = "\uFEFF"; // UTF-8 BOM to prevent MS Excel Korean character corruption

    if (category === "trips") {
      // Header
      csvContent += isEn
        ? "Start Time,End Time,Distance (km),Average Speed (km/h),Idle Time (s),Notes\n"
        : "출발시간,도착시간,주행거리(km),평균속도(km/h),공회전시간(초),메모\n";

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
      csvContent += isEn
        ? "Date,Odometer (km),Item,Category,Shop,Cost,Notes\n"
        : "정비일자,누적주행거리(km),항목,구분,정비업체,비용(원),메모\n";

      const records = await prisma.maintenanceRecord.findMany({
        where: {
          vehicleId: id,
          ...(dateFilter ? { date: { gte: dateFilter } } : {}),
        },
        orderBy: { date: "asc" },
      });

      for (const rec of records) {
        const catLabel = isEn
          ? rec.category === "ADMINISTRATIVE" ? "Administrative" : "Maintenance"
          : rec.category === "ADMINISTRATIVE" ? "행정·법정" : "정비";

        csvContent += [
          escapeCsv(rec.date),
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
        csvContent += isEn
          ? "Date,Odometer (km),Amount (kWh),Unit Price,Total Cost,Charging Station,Efficiency (km/kWh),Full Charge,Notes\n"
          : "충전일자,누적주행거리(km),충전량(kWh),단가(원/kWh),결제금액(원),충전소,전비(km/kWh),가득채움여부,메모\n";
      } else {
        csvContent += isEn
          ? "Date,Odometer (km),Amount (L),Unit Price,Total Cost,Gas Station,Efficiency (km/L),Full Tank,Notes\n"
          : "주유일자,누적주행거리(km),주유량(L),단가(원/L),결제금액(원),주유소,연비(km/L),가득채움여부,메모\n";
      }

      const logs = await prisma.fuelLog.findMany({
        where: {
          vehicleId: id,
          ...(dateFilter ? { date: { gte: dateFilter } } : {}),
        },
        orderBy: { date: "asc" },
      });

      let prevFullTank: typeof logs[0] | null = null;

      for (const log of logs) {
        let efficiency = "";
        if (log.fullTank) {
          if (prevFullTank && log.odometer > prevFullTank.odometer && log.liters > 0) {
            const distance = log.odometer - prevFullTank.odometer;
            const eff = distance / log.liters;
            efficiency = eff.toFixed(2);
          }
          prevFullTank = log;
        }

        const unitPrice = log.liters > 0 ? Math.round(log.cost / log.liters) : "";

        csvContent += [
          escapeCsv(log.date),
          escapeCsv(log.odometer),
          escapeCsv(log.liters),
          escapeCsv(unitPrice),
          escapeCsv(log.cost),
          escapeCsv(log.location),
          escapeCsv(efficiency),
          escapeCsv(log.fullTank ? (isEn ? "Yes" : "예") : (isEn ? "No" : "아니오")),
          escapeCsv(""), // FuelLog doesn't have a notes field
        ].join(",") + "\n";
      }
    }

    const safePlate = (vehicle.plate || vehicle.name || "vehicle").replace(/[^a-zA-Z0-9가-힣]/g, "_");
    const filename = `${safePlate}_${category}_${period || "all"}_${new Date().toISOString().slice(0, 10)}.csv`;

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`)
      .send(csvContent);
  });
}
