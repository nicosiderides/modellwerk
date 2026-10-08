/**
 * Genera las miniaturas del catálogo (public/galpones/<id>/thumb.png) renderizando
 * cada tipología con el mismo visor de la app (?capture=<id>).
 *
 * Requisitos: servidor local corriendo (npm run dev) y Playwright disponible
 * (npx playwright install chromium). Luego:
 *
 *   node scripts/galpones/capture-thumbnails.mjs http://localhost:3020
 *
 * El script guarda PNG; conviene convertirlas a WebP (ej. squoosh, cwebp) y
 * referenciarlas en warehouse.json → "thumbnail".
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://localhost:3020").replace(/\/$/, "");
const ids = ["industrial-light", "industrial-pro", "logistics", "large-span"];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
for (const id of ids) {
  await mkdir(`public/galpones/${id}`, { recursive: true });
  await page.goto(`${base}/galpones?capture=${id}&quality=high&refs=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(Number(process.env.CAPTURE_WAIT ?? 12000));
  await page.screenshot({ path: `public/galpones/${id}/thumb.png` });
  console.log(`✓ ${id}`);
}
await browser.close();
