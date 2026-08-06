#!/usr/bin/env node
/**
 * 천안사랑카드 가맹 주유소 ↔ 오피넷 UNI_ID 매칭 → 정적 seed JSON 생성.
 * CI에서 돌리지 않는다. 사람이 필요할 때만 수동 실행.
 *
 *   OPINET_API_KEY=xxx node scripts/build-cheonan-card-seed.mjs
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const require = createRequire(join(ROOT, "apps/api/package.json"));
const proj4 = require("proj4");

const KEY = process.env.OPINET_API_KEY || process.env.OPINET_KEY;
if (!KEY) {
  console.error("OPINET_API_KEY (또는 OPINET_KEY) 환경변수가 필요합니다.");
  process.exit(1);
}

const SIGUN_CD = "0502";
const SIDO_AREA = "05";
const THRESHOLD_M = 50;
const THROTTLE_MS = 200;
const OUT_PATH = join(ROOT, "apps/api/src/data/cheonan-card-stations.json");
const OVERRIDES_PATH = join(ROOT, "scripts/cheonan-card-overrides.json");

const KATEC =
  "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43";
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
proj4.defs("KATEC", KATEC);
const toKatec = (lon, lat) => proj4("EPSG:4326", "KATEC", [lon, lat]);
const toWgs = (x, y) => {
  const [lon, lat] = proj4("KATEC", "EPSG:4326", [x, y]);
  return { lat, lon };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parseOpinet = (t) => JSON.parse(t.replace(/[\r\n\t]/g, ""));

function normalizeStationName(name) {
  let s = name.normalize("NFKC");
  s = s.replace(/\(주\)|\(유\)|주식회사|㈜/gi, "");
  s = s.replace(/셀프|self/gi, "");
  s = s.replace(/\([^)]*\)/g, "");
  s = s.replace(/\s+/g, "");
  // searchByName.do는 대소문자 구분 — 소문자화 금지
  return s.trim();
}

async function konaMerchants() {
  const res = await fetch("https://search.konacard.co.kr/api/v1/payable-merchants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: 34,
      bizType: "3301",
      merchantType: "KB",
      pageNum: 1,
      pageSize: 200,
      affiliateName: "천안사랑카드",
      searchKey: "",
    }),
  });
  if (!res.ok) throw new Error(`Kona API ${res.status}`);
  return (await res.json()).data.merchants;
}

async function searchByName(osnm) {
  const url = `https://www.opinet.co.kr/api/searchByName.do?out=json&code=${KEY}&osnm=${encodeURIComponent(osnm)}&area=${SIDO_AREA}`;
  const data = parseOpinet(await (await fetch(url)).text());
  return (data.RESULT?.OIL ?? []).filter((s) => String(s.SIGUNCD) === SIGUN_CD);
}

async function aroundAll(lat, lon, prodcd) {
  const [x, y] = toKatec(lon, lat);
  const url = `https://www.opinet.co.kr/api/aroundAll.do?out=json&code=${KEY}&x=${Math.round(x)}&y=${Math.round(y)}&radius=1000&prodcd=${prodcd}&sort=2`;
  const data = parseOpinet(await (await fetch(url)).text());
  return data.RESULT?.OIL ?? [];
}

async function detailById(uniId) {
  const url = `https://www.opinet.co.kr/api/detailById.do?out=json&code=${KEY}&id=${uniId}`;
  const data = parseOpinet(await (await fetch(url)).text());
  return data.RESULT?.OIL?.[0] ?? null;
}

const katecDist = (kx, ky, ox, oy) => Math.hypot(kx - ox, ky - oy);

function loadOverrides() {
  if (!existsSync(OVERRIDES_PATH)) return new Map();
  const raw = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));
  const map = new Map();
  for (const [seq, val] of Object.entries(raw.overrides ?? raw)) {
    if (seq.startsWith("_")) continue;
    map.set(Number(seq), val === null || val === undefined ? null : String(val));
  }
  return map;
}

function stationFromOil(oil, match, konaEntries) {
  const x = Number(oil.GIS_X_COOR ?? oil.GIS_X);
  const y = Number(oil.GIS_Y_COOR ?? oil.GIS_Y);
  const { lat, lon } = toWgs(x, y);
  return {
    opinetId: String(oil.UNI_ID),
    name: String(oil.OS_NM),
    brand: oil.POLL_DIV_CD ? String(oil.POLL_DIV_CD) : null,
    address: oil.VAN_ADR ? String(oil.VAN_ADR) : "",
    roadAddress: oil.NEW_ADR ? String(oil.NEW_ADR) : null,
    lat,
    lon,
    lpgYn: oil.LPG_YN ? String(oil.LPG_YN).trim() : "N",
    kona: konaEntries,
    match,
  };
}

const merchants = await konaMerchants();
console.log(`코나카드 가맹 주유소: ${merchants.length}건`);

const overrides = loadOverrides();
const results = [];
let calls = 0;

for (const m of merchants) {
  const seq = Number(m.seq);
  if (overrides.has(seq)) {
    const forced = overrides.get(seq);
    results.push({
      seq,
      kona: m.simpleNm,
      addr: m.addr,
      tel: m.telNo ?? null,
      bizType: m.bizType,
      lat: m.latitude != null ? Number(m.latitude) : null,
      lon: m.longitude != null ? Number(m.longitude) : null,
      verdict: forced == null ? "OVERRIDE_NULL" : "OVERRIDE",
      opinetId: forced,
      oil: null,
      match: "manual",
    });
    continue;
  }

  const norm = normalizeStationName(m.simpleNm);
  const row = {
    seq,
    kona: m.simpleNm,
    addr: m.addr,
    tel: m.telNo ?? null,
    bizType: m.bizType,
    lat: m.latitude != null ? Number(m.latitude) : null,
    lon: m.longitude != null ? Number(m.longitude) : null,
    oil: null,
    match: null,
  };

  if (norm.length < 2) {
    row.verdict = "SKIP_SHORT_NAME";
    results.push(row);
    continue;
  }

  let cands = [];
  try {
    cands = await searchByName(norm);
    calls++;
  } catch (e) {
    row.verdict = "ERROR";
    row.err = String(e);
    results.push(row);
    continue;
  }
  await sleep(THROTTLE_MS);

  if (row.lat != null && row.lon != null && Number.isFinite(row.lat) && Number.isFinite(row.lon)) {
    const [kx, ky] = toKatec(row.lon, row.lat);
    const scored = cands
      .map((c) => ({ c, d: katecDist(kx, ky, Number(c.GIS_X_COOR), Number(c.GIS_Y_COOR)) }))
      .sort((a, b) => a.d - b.d);
    const near = scored.filter((s) => s.d <= THRESHOLD_M);
    if (near.length === 1) {
      row.verdict = "OK_NAME_COORD";
      row.opinetId = near[0].c.UNI_ID;
      row.oil = near[0].c;
      row.match = "name_coord";
    } else if (near.length > 1) {
      row.verdict = "AMBIGUOUS_COORD";
    } else if (cands.length === 1) {
      row.verdict = "NAME_ONLY_FAR";
      row.opinetId = cands[0].UNI_ID;
      row.oil = cands[0];
      row.match = "name_only";
    } else {
      row.verdict = cands.length === 0 ? "NO_NAME_HIT" : "AMBIGUOUS_NAME";
    }
  } else if (cands.length === 1) {
    row.verdict = "OK_NAME_ONLY";
    row.opinetId = cands[0].UNI_ID;
    row.oil = cands[0];
    row.match = "name_only";
  } else {
    row.verdict = cands.length === 0 ? "NO_NAME_HIT" : "AMBIGUOUS_NAME";
  }
  results.push(row);
}

// 2차: aroundAll 폴백
for (const row of results) {
  if (row.verdict !== "NO_NAME_HIT" && row.verdict !== "AMBIGUOUS_NAME") continue;
  if (row.lat == null || row.lon == null) continue;
  const prodcd = row.bizType === "5609" ? "K015" : "B027";
  try {
    const near = await aroundAll(row.lat, row.lon, prodcd);
    calls++;
    await sleep(THROTTLE_MS);
    const [kx, ky] = toKatec(row.lon, row.lat);
    const scored = near
      .map((c) => ({ c, d: katecDist(kx, ky, Number(c.GIS_X_COOR), Number(c.GIS_Y_COOR)) }))
      .filter((s) => s.d <= THRESHOLD_M)
      .sort((a, b) => a.d - b.d);
    if (scored.length === 1) {
      row.verdict = "OK_COORD_FALLBACK";
      row.opinetId = scored[0].c.UNI_ID;
      row.oil = scored[0].c;
      row.match = "coord";
    } else if (scored.length > 1) {
      row.verdict = "AMBIGUOUS_COORD_FALLBACK";
    } else {
      row.verdict = "UNRESOLVED";
    }
  } catch {
    row.verdict = "UNRESOLVED";
  }
}

// override로 opinetId만 지정된 건 detail로 oil 채움
for (const row of results) {
  if (row.verdict === "OVERRIDE" && row.opinetId && !row.oil) {
    const oil = await detailById(row.opinetId);
    calls++;
    await sleep(THROTTLE_MS);
    if (oil) row.oil = oil;
    else {
      console.warn(`override UNI_ID ${row.opinetId} (seq ${row.seq}) detail 조회 실패`);
      row.opinetId = null;
      row.verdict = "OVERRIDE_DETAIL_FAIL";
    }
  }
}

// aroundAll 폴백은 주소/브랜드가 부족할 수 있어 detail 보강
for (const row of results) {
  if (!row.opinetId || !row.oil) continue;
  // aroundAll 응답에는 주소도 LPG_YN도 없다. 둘 중 하나라도 비면 detail로 보강한다
  // — 주소만 보고 판단하면 LPG_YN이 기본값 "N"으로 굳어 충전소가 주유소로 분류된다.
  if ((row.oil.VAN_ADR || row.oil.NEW_ADR) && row.oil.LPG_YN) continue;
  const oil = await detailById(row.opinetId);
  calls++;
  await sleep(THROTTLE_MS);
  if (oil) row.oil = { ...row.oil, ...oil };
}

const byOpinet = new Map();
const unmatched = [];

for (const row of results) {
  if (!row.opinetId || !row.oil) {
    unmatched.push({
      seq: row.seq,
      name: row.kona,
      address: row.addr,
      tel: row.tel,
      bizType: row.bizType,
    });
    continue;
  }
  const id = String(row.opinetId);
  const konaEntry = { seq: row.seq, name: row.kona, bizType: row.bizType };
  if (!byOpinet.has(id)) {
    byOpinet.set(id, stationFromOil(row.oil, row.match ?? "manual", [konaEntry]));
  } else {
    byOpinet.get(id).kona.push(konaEntry);
  }
}

const stations = [...byOpinet.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
const idSet = new Set(stations.map((s) => s.opinetId));
if (idSet.size !== stations.length) {
  console.error("seed 검증 실패: stations[].opinetId 중복");
  process.exit(1);
}

const seed = {
  generatedAt: new Date().toISOString(),
  source: {
    konaId: 34,
    totalMerchants: merchants.length,
    matched: results.filter((r) => r.opinetId).length,
  },
  stations,
  unmatched,
};

let prev = null;
if (existsSync(OUT_PATH)) {
  try {
    prev = JSON.parse(readFileSync(OUT_PATH, "utf8"));
  } catch {
    prev = null;
  }
}

writeFileSync(OUT_PATH, `${JSON.stringify(seed, null, 2)}\n`, "utf8");

const by = {};
for (const r of results) by[r.verdict] = (by[r.verdict] || 0) + 1;
console.log("\n=== 판정 분포 ===");
for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(26)} ${v}`);
}
console.log(`\n오피넷 호출 ${calls}회 | stations ${stations.length} | unmatched ${unmatched.length}`);
console.log(`wrote ${OUT_PATH}`);

if (prev) {
  const prevIds = new Set(prev.stations.map((s) => s.opinetId));
  const nextIds = new Set(stations.map((s) => s.opinetId));
  const added = [...nextIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !nextIds.has(id));
  console.log(`\n=== seed diff ===`);
  console.log(`  +${added.length}  -${removed.length}`);
  for (const id of added) console.log(`  + ${id} ${stations.find((s) => s.opinetId === id)?.name}`);
  for (const id of removed) console.log(`  - ${id} ${prev.stations.find((s) => s.opinetId === id)?.name}`);
}
