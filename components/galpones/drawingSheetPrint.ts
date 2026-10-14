"use client";

import { buildDrawingSheet, drawingSheetHtml } from "@/core/galpones/drawings";
import type { WarehouseConfig, WarehouseDefinition } from "@/core/galpones/types";

/**
 * Recorta el fondo liso de la captura del visor, para que la perspectiva
 * ocupe todo su recuadro en la lámina (el visor deja aire para los paneles).
 */
async function trimSnapshot(dataUrl: string): Promise<{ url: string; aspect: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { url: dataUrl, aspect: img.naturalWidth / img.naturalHeight };
  ctx.drawImage(img, 0, 0);
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  // Color de fondo: el de la esquina superior izquierda (cielo liso).
  const bg = [data[0], data[1], data[2]];
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  const step = 2;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const diff = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
      if (diff > 36) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return { url: dataUrl, aspect: width / height };
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width, maxX + pad);
  maxY = Math.min(height, maxY + pad);
  const out = document.createElement("canvas");
  out.width = maxX - minX;
  out.height = maxY - minY;
  out.getContext("2d")?.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return { url: out.toDataURL("image/jpeg", 0.9), aspect: out.width / out.height };
}

/**
 * Arma la lámina y abre el diálogo de impresión del navegador en un marco
 * aparte (A3 apaisado). Ahí se elige "Guardar como PDF".
 */
export async function printDrawingSheet(config: WarehouseConfig, definition: WarehouseDefinition, snapshot: string | null) {
  const picture = snapshot ? await trimSnapshot(snapshot).catch(() => ({ url: snapshot, aspect: 1.6 })) : null;
  const sheet = buildDrawingSheet(config, definition, { image: picture?.url ?? null, imageAspect: picture?.aspect });
  const d = config.dimensions;
  const name = `Planos ${definition.code} ${d.width}x${d.length} m`;
  const html = drawingSheetHtml(sheet, name);

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = name;
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "1px", height: "1px", border: "0", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    throw new Error("No se pudo preparar la lámina");
  }
  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(() => frame.isConnected && frame.remove(), 120000);
  win.focus();
  win.print();
  return sheet.scale;
}
