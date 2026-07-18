import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3000";
const OUT = path.resolve(__dirname, "../docs/screenshots");
const email = process.env.ADMIN_EMAIL || "admin@example.com";
const password = process.env.ADMIN_PASSWORD || "changeme123";
const locales = (process.env.LOCALES || "ko,en").split(",").map((s) => s.trim()).filter(Boolean);

async function waitReady(page) {
  await page.waitForFunction(
    () => {
      const t = document.body?.innerText || "";
      return !t.includes("불러오는 중") && !t.includes("Loading");
    },
    { timeout: 20000 },
  ).catch(() => {});
  await page.waitForTimeout(500);
}

async function shot(page, filePath) {
  await waitReady(page);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log("saved", path.relative(OUT, filePath), "→", (await page.innerText("body")).slice(0, 70).replace(/\n/g, " "));
}

async function captureLocale(locale) {
  const dir = path.join(OUT, locale);
  await fs.mkdir(dir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: locale === "en" ? "en-US" : "ko-KR",
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  page.on("response", (res) => {
    if (res.url().includes("/api/") && res.status() >= 400) {
      console.log("api fail", res.status(), res.url());
    }
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate((loc) => {
    localStorage.setItem("garage_locale", loc);
  }, locale);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  } catch {
    console.log(`[${locale}] still on login:`, (await page.innerText("body")).slice(0, 200));
  }

  await page.evaluate((loc) => localStorage.setItem("garage_locale", loc), locale);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await shot(page, path.join(dir, "01-dashboard.png"));

  const vehicleLinks = await page.locator('a[href^="/vehicles/"]').all();
  const vehicleIds = [];
  for (const link of vehicleLinks) {
    const href = await link.getAttribute("href");
    const id = href?.match(/\/vehicles\/([^/?#]+)/)?.[1];
    if (id) {
      vehicleIds.push(id);
    }
  }
  const uniqueVehicleIds = [...new Set(vehicleIds)].filter(Boolean);
  console.log(`[${locale}] found vehicleIds`, uniqueVehicleIds);

  for (const vehicleId of uniqueVehicleIds) {
    await page.goto(`${BASE}/vehicles/${vehicleId}`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    const headerText = await page.locator("h1").first().innerText().catch(() => "");
    const isEv = headerText.includes("전기차") || headerText.includes("Electric") || headerText.includes("IONIQ") || headerText.includes("아이오닉");
    const typeSuffix = isEv ? "ev" : "ice";
    console.log(`[${locale}] vehicle ${vehicleId} is ${typeSuffix.toUpperCase()}`);

    await shot(page, path.join(dir, `02-vehicle-${typeSuffix}.png`));

    await page.goto(`${BASE}/vehicles/${vehicleId}/quick-log`, { waitUntil: "domcontentloaded" });
    await shot(page, path.join(dir, `03-quick-log-${typeSuffix}.png`));

    await page.goto(`${BASE}/vehicles/${vehicleId}/schedule`, { waitUntil: "domcontentloaded" });
    await shot(page, path.join(dir, `04-schedule-${typeSuffix}.png`));

    await page.goto(`${BASE}/vehicles/${vehicleId}/history`, { waitUntil: "domcontentloaded" });
    await shot(page, path.join(dir, `05-history-${typeSuffix}.png`));

    await page.goto(`${BASE}/vehicles/${vehicleId}/level`, { waitUntil: "domcontentloaded" });
    await shot(page, path.join(dir, `07-level-${typeSuffix}.png`));
  }

  await page.goto(`${BASE}/integrations`, { waitUntil: "domcontentloaded" });
  await shot(page, path.join(dir, "06-integrations.png"));

  await page.goto(`${BASE}/vehicles`, { waitUntil: "domcontentloaded" });
  await shot(page, path.join(dir, "08-vehicles.png"));

  await page.goto(`${BASE}/users`, { waitUntil: "domcontentloaded" });
  await shot(page, path.join(dir, "09-users.png"));

  await page.goto(`${BASE}/maintenance-presets`, { waitUntil: "domcontentloaded" });
  await shot(page, path.join(dir, "10-presets.png"));

  await page.goto(`${BASE}/backup`, { waitUntil: "domcontentloaded" });
  await shot(page, path.join(dir, "11-backup.png"));

  await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
  await shot(page, path.join(dir, "12-profile.png"));

  await browser.close();
}

for (const locale of locales) {
  console.log("--- capturing", locale);
  await captureLocale(locale);
}
console.log("done");
