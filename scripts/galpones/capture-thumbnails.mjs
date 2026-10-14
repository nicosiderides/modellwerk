/**
 * Genera las miniaturas del catálogo (public/galpones/<id>/thumb.webp, 800×600)
 * renderizando cada tipología con el mismo visor de la app (?capture=<id>).
 *
 * Requisitos: servidor local corriendo (npm run dev) y Playwright disponible
 * (npx playwright install chromium). Luego:
 *
 *   node scripts/galpones/capture-thumbnails.mjs http://localhost:3030
 *   node scripts/galpones/capture-thumbnails.mjs http://localhost:3030 logistics   (solo una)
 *
 * Cómo arma cada foto:
 *  1. Abre el visor sin interfaz, con vehículos y calidad alta.
 *  2. Aleja un poco la cámara (factor "zoom") para que entren el camión,
 *     el estacionamiento y el cerco, no solo el galpón.
 *  3. Fuerza un redibujado: el cielo/luz ambiente (HDR) llega después del
 *     primer dibujo y, sin esto, la foto sale más oscura y amarillenta.
 *  4. Recorta la zona "crop" (en píxeles de una ventana 1200×900) y la
 *     guarda directo en WebP 800×600.
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://localhost:3030").replace(/\/$/, "");
const only = process.argv[3];
const WAIT = Number(process.env.CAPTURE_WAIT ?? 30000);

// zoom: 1 = encuadre automático del visor; más alto = cámara más lejos.
// crop: [x, y, ancho, alto] dentro de la ventana 1200×900 (siempre 4:3).
const SHOTS = {
  "industrial-light": { zoom: 1.35, crop: [90, 90, 1080, 810] },
  "industrial-pro": { zoom: 1.0, crop: [0, 60, 1080, 810] },
  logistics: { zoom: 1.0, crop: [100, 140, 960, 720], wait: 70000 },
  "large-span": { zoom: 1.0, crop: [75, 90, 1080, 810] },
};
const ELEVATION = 0.32; // altura de la cámara (0 = a ras del piso, 1 = desde arriba)

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_ARGS?.split(" ") });
for (const [id, shot] of Object.entries(SHOTS)) {
  if (only && only !== id) continue;
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`${base}/galpones?capture=${id}&quality=high&refs=1&debug=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__mwCamera, null, { timeout: 120000 });
  await page.waitForTimeout(shot.wait ?? WAIT);

  await page.evaluate(([zoom, up]) => {
    const { control, pose } = window.__mwCamera;
    const t = pose.target;
    const d = { x: pose.position.x - t.x, y: pose.position.y - t.y, z: pose.position.z - t.z };
    const distance = Math.hypot(d.x, d.y, d.z) * zoom;
    const flat = Math.hypot(d.x, d.z);
    const dir = { x: (d.x / flat) * (1 - up), y: up, z: (d.z / flat) * (1 - up) };
    const n = Math.hypot(dir.x, dir.y, dir.z);
    control.setLookAt(t.x + (dir.x / n) * distance, t.y + (dir.y / n) * distance, t.z + (dir.z / n) * distance, t.x, t.y, t.z, false);
    control.setFocalOffset(0, 0, 0, false);
  }, [shot.zoom, ELEVATION]);

  // Redibujar con la luz ambiente ya cargada.
  await page.setViewportSize({ width: 1201, height: 900 });
  await page.waitForTimeout(2000);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.waitForTimeout(Number(process.env.SETTLE_WAIT ?? 20000));
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

  const [x, y, width, height] = shot.crop;
  const png = await page.screenshot({ timeout: 180000, clip: { x, y, width, height } });
  // Achicar a 800×600 y pasar a WebP con el mismo navegador (sin programas extra).
  const webp = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, 800, 600);
    return canvas.toDataURL("image/webp", 0.84);
  }, `data:image/png;base64,${png.toString("base64")}`);
  await writeFile(`public/galpones/${id}/thumb.webp`, Buffer.from(webp.split(",")[1], "base64"));
  console.log(`✓ ${id}`);
  await page.close();
}
await browser.close();
