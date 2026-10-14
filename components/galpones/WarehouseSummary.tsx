"use client";

import { useState } from "react";
import { DraftingCompass, Download, Link, Printer, Save, Send } from "lucide-react";
import { generateTechnicalDescription } from "@/core/galpones/description";
import { getVariant, ridgeHeight, structureLabel } from "@/core/galpones/configuration";
import { calculateMetrics, formatNumber } from "@/core/galpones/metrics";
import { configToShareCode, serializeConfig } from "@/core/galpones/storage";
import { TechnicalPanel } from "./TechnicalPanel";
import { captureViewerSnapshot } from "./WarehouseViewer";
import { printDrawingSheet } from "./drawingSheetPrint";
import { SiteChecksList } from "./LotPanel";
import { verifySite } from "@/core/galpones/siteCheck";
import { blockingIssues } from "@/core/galpones/lotLimits";
import { presetById } from "@/core/galpones/lotRules";
import { definitionOf, useGalpones } from "./store";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function openingsLabel(o: { doorsFront: number; doorsBack: number; doorsSide: number; personDoors: number; windowsPerSide: number }) {
  return [plural(o.doorsFront + o.doorsBack + o.doorsSide, "portón", "portones"), plural(o.personDoors, "puerta", "puertas"), plural(o.windowsPerSide * 2, "ventana", "ventanas")].join(" · ");
}

export function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function shareUrl(code: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("c", code);
  return url.toString();
}

export function WarehouseSummary() {
  const definition = useGalpones((s) => definitionOf(s));
  const config = useGalpones((s) => s.warehouse.config);
  const setModal = useGalpones((s) => s.setModal);
  const toast = useGalpones((s) => s.toast);
  const [image, setImage] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  if (!definition || !config) return null;

  const m = calculateMetrics(config, definition);
  const env = definition.envelope;
  const find = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);
  const roof = find(env.roof, config.envelope.roof);
  const walls = find(env.walls, config.envelope.walls);
  const insulation = find(env.insulation, config.envelope.insulation);
  const roofColor = find(env.colors, config.envelope.roofColor);
  const wallColor = find(env.colors, config.envelope.wallColor);
  const finish = find(definition.structure.finishes, config.structureFinish);
  const variant = getVariant(definition, config.variant);
  const paragraphs = generateTechnicalDescription(config, definition);
  const o = config.openings;
  const options = definition.options.options.filter((opt) => config.options[opt.id]).map((opt) => opt.name);

  const specs: [string, string][] = [
    ["Superficie", `${formatNumber(m.floorArea)} m²`],
    ["Luz libre", `${formatNumber(config.dimensions.width)} m`],
    ["Altura alero / cumbrera", `${formatNumber(config.dimensions.eaveHeight, 1)} / ${formatNumber(ridgeHeight(config.dimensions), 1)} m`],
    ["Estructura", structureLabel(definition, config.structure)],
    ["Terminación", finish?.name ?? "—"],
    ["Fundación", find(definition.structure.foundations ?? [], config.foundation)?.name ?? "—"],
    ["Piso", find(definition.structure.floors ?? [], config.floor)?.name ?? "—"],
    ["Cubierta", `${roof?.name ?? "—"}${insulation && insulation.level > 0 ? ` · ${insulation.name} ${insulation.thicknessMm} mm` : ""}`],
    ["Cerramientos", walls?.name ?? "—"],
    ["Aislación", insulation?.name ?? "—"],
    ["Colores", `Cubierta ${roofColor?.name.toLowerCase()} · cerramientos ${wallColor?.name.toLowerCase()}`],
    ["Aberturas", openingsLabel(o)],
    ["Opcionales", options.length ? options.join(", ") : "—"],
    [
      "Entorno",
      [
        config.site.sidewalk > 0 ? `vereda ${formatNumber(config.site.sidewalk, 1)} m` : "",
        config.site.parking > 0 ? `${config.site.parking} cocheras (${config.site.parkingSide === "west" ? "lateral oeste" : "contrafrente"})` : "",
        config.site.truckYard ? "playón de maniobras" : "",
        config.site.landscape ? "parquizado" : "",
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    ],
    ["Modelo", variant ? `BIM / GLB · ${variant.id}` : "Paramétrico"],
  ];

  const print = () => {
    setImage(captureViewerSnapshot());
    window.setTimeout(() => window.print(), 120);
  };
  // Lámina A3 de planos (planta, cortes, vistas y perspectiva) → diálogo de impresión / PDF.
  const drawingSheet = async () => {
    if (drawing) return;
    setDrawing(true);
    try {
      useGalpones.getState().requestCamera("perspective");
      await new Promise((resolve) => window.setTimeout(resolve, 1300));
      const shot = captureViewerSnapshot();
      toast("En el diálogo elegí «Guardar como PDF» (A3 apaisado)");
      await printDrawingSheet(config, definition, shot);
    } catch {
      toast("No se pudo generar la lámina de planos");
    } finally {
      setDrawing(false);
    }
  };
  const copyLink = async () => {
    const url = shareUrl(configToShareCode(config));
    try {
      await navigator.clipboard.writeText(url);
      toast("Enlace copiado");
    } catch {
      window.prompt("Copiá este enlace", url);
    }
  };

  return (
    <aside className="gp-summary" aria-label="Resumen">
      <article className="gp-sheet">
        <header className="gp-sheet__head">
          <div>
            <p className="gp-kicker">Ficha técnica · {definition.code}</p>
            <h1>{definition.name}</h1>
            <p className="gp-sheet__dims">
              {formatNumber(config.dimensions.width)} × {formatNumber(config.dimensions.length)} m
            </p>
          </div>
          <dl className="gp-sheet__big">
            <div>
              <dt>Área</dt>
              <dd>{formatNumber(m.floorArea)} m²</dd>
            </div>
            <div>
              <dt>Luz libre</dt>
              <dd>{formatNumber(config.dimensions.width)} m</dd>
            </div>
            <div>
              <dt>Altura</dt>
              <dd>{formatNumber(config.dimensions.eaveHeight, 1)} m</dd>
            </div>
          </dl>
        </header>
        {image && <img className="gp-sheet__image" src={image} alt={`Vista 3D de ${definition.name}`} />}
        <section className="gp-sheet__cta gp-no-print">
          <button type="button" className="gp-button gp-button--primary gp-button--large" onClick={() => setModal("quote")}>
            <Send aria-hidden /> Solicitar presupuesto
          </button>
          <div className="gp-sheet__actions">
            <button type="button" className="gp-button" onClick={print}>
              <Printer aria-hidden /> Ficha PDF
            </button>
            <button type="button" className="gp-button" onClick={drawingSheet} disabled={drawing} aria-busy={drawing}>
              <DraftingCompass aria-hidden /> {drawing ? "Armando…" : "Planos PDF"}
            </button>
            <button type="button" className="gp-button" onClick={() => setModal("saved")}>
              <Save aria-hidden /> Guardar
            </button>
            <button type="button" className="gp-button" onClick={copyLink}>
              <Link aria-hidden /> Compartir
            </button>
            <button type="button" className="gp-button" onClick={() => downloadJson(`galpon-${definition.id}.json`, serializeConfig(config))}>
              <Download aria-hidden /> JSON
            </button>
          </div>
        </section>
        <section>
          <h2 className="gp-sheet__title">Configuración</h2>
          <dl className="gp-sheet__specs">
            {specs.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        {config.lot.enabled && (() => {
          const v = verifySite(config, definition);
          return (
            <section>
              <h2 className="gp-sheet__title">Implantación y normativa</h2>
              <p className="gp-sheet__lot">
                {presetById(config.lot.preset).name}
                {v.lot && ` · lote ${formatNumber(v.lot.width, 1)} × ${formatNumber(v.lot.depth, 1)} m (${formatNumber(Math.round(v.lot.area))} m²)`} · {v.summary.ok} cumple · {v.summary.warn} revisar · {v.summary.fail} no cumple
              </p>
              {config.lot.location && (
                <p className="gp-sheet__lot">
                  Lote real: {config.lot.location.designacion || "parcela"}
                  {config.lot.location.nomenclatura ? ` · nomenclatura ${config.lot.location.nomenclatura}` : ""} · {formatNumber(config.lot.location.superficie)} m² según catastro
                  {config.lot.location.zone ? ` · ${config.lot.location.zone.label}` : ""}. Datos de IDECOR (CC BY-SA 4.0), de referencia.
                </p>
              )}
              {blockingIssues(config, definition).length > 0 && (
                <p className="gp-sheet__alert">
                  Fuera de norma: {blockingIssues(config, definition).map((c) => c.label.toLowerCase()).join(", ")}. Revisá el lote o ajustá el galpón antes de pedir presupuesto.
                </p>
              )}
              <SiteChecksList checks={v.checks} compact />
            </section>
          );
        })()}
        <section>
          <h2 className="gp-sheet__title">Memoria descriptiva</h2>
          <div className="gp-sheet__memory">
            {paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <ul>
              {definition.specs.constructionNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </section>
        <section>
          <h2 className="gp-sheet__title">Datos técnicos</h2>
          <TechnicalPanel config={config} definition={definition} />
        </section>
        <footer className="gp-sheet__foot">
          <span>{definition.specs.note}</span>
          <span>MODELLWERK · MW Warehouse · {new Date().toLocaleDateString("es-AR")}</span>
        </footer>
      </article>
    </aside>
  );
}
