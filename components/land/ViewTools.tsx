"use client";

import { Box, Camera, Expand, Eye, EyeOff, Layers, Map as MapIcon, PersonStanding, Scan, X } from "lucide-react";
import { staticCatalog } from "@/core/galpones/catalog";
import type { ModelCategory } from "@/core/product-engine/types";
import { LAND_CATEGORY_LABELS, LAND_GROUPS } from "@/core/land/kit/builder";
import type { CameraPresetId } from "@/components/product-viewer/types";
import { useLand, type GroundMode } from "./store";

/** Barra de herramientas del visor (igual que en Galpones): cámaras, explotar, grupos, caja, piso, escala. */

const CAMERAS: { id: CameraPresetId; label: string }[] = [
  { id: "perspective", label: "3D" },
  { id: "front", label: "Frente" },
  { id: "side", label: "Lateral" },
  { id: "top", label: "Planta" },
];

const GROUND: { id: GroundMode; label: string }[] = [
  { id: "photo", label: "Foto" },
  { id: "plan", label: "Plano" },
  { id: "off", label: "Sin piso" },
];

export function ViewTools() {
  const viewer = useLand((s) => s.viewer);
  const typeId = useLand((s) => s.typeId);
  const setCamera = useLand((s) => s.setCamera);
  const setViewer = useLand((s) => s.setViewer);
  const toggleHidden = useLand((s) => s.toggleHidden);
  const isolate = useLand((s) => s.isolate);
  const groups = typeId === "galpon" ? staticCatalog.shared().groups : LAND_GROUPS;
  return (
    <div className="ld-tools" role="toolbar" aria-label="Vista 3D">
      <div className="ld-tools__group">
        {CAMERAS.map((c) => (
          <button key={c.id} type="button" onClick={() => setCamera(c.id)} className={viewer.camera.preset === c.id ? "is-on" : ""} title={`Vista ${c.label.toLowerCase()}`}>
            {c.id === "perspective" ? <Box aria-hidden /> : c.id === "top" ? <Scan aria-hidden /> : <Camera aria-hidden />} {c.label}
          </button>
        ))}
      </div>
      <div className="ld-tools__group">
        <button type="button" className={viewer.explode ? "is-on" : ""} onClick={() => setViewer({ explode: !viewer.explode })} aria-pressed={viewer.explode} title="Separar las piezas por grupo">
          <Expand aria-hidden /> Explotar
        </button>
        <button type="button" className={viewer.showEnvelope ? "is-on" : ""} onClick={() => setViewer({ showEnvelope: !viewer.showEnvelope })} aria-pressed={viewer.showEnvelope} title="Mostrar la caja máxima de la normativa">
          <Layers aria-hidden /> Caja
        </button>
        <button type="button" className={viewer.scaleRefs ? "is-on" : ""} onClick={() => setViewer({ scaleRefs: !viewer.scaleRefs })} aria-pressed={viewer.scaleRefs} title="Personas y autos de referencia">
          <PersonStanding aria-hidden /> Escala
        </button>
      </div>
      <div className="ld-tools__group">
        {GROUND.map((g) => (
          <button key={g.id} type="button" className={viewer.ground === g.id ? "is-on" : ""} onClick={() => setViewer({ ground: g.id })}>
            {g.id === "photo" ? <MapIcon aria-hidden /> : null}
            {g.label}
          </button>
        ))}
      </div>
      <div className="ld-tools__group ld-tools__layers">
        {groups.map((g) => {
          const hidden = g.categories.every((c) => viewer.hidden.includes(c));
          return (
            <button key={g.id} type="button" className={hidden ? "" : "is-on"} onClick={() => toggleHidden(g.categories)} title={`${hidden ? "Mostrar" : "Ocultar"} ${g.label.toLowerCase()}`}>
              {hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />} {g.label}
            </button>
          );
        })}
        {viewer.isolated && (
          <button type="button" onClick={() => isolate(null)}>
            <X aria-hidden /> Ver todo
          </button>
        )}
      </div>
    </div>
  );
}

export function ElementCard() {
  const selection = useLand((s) => s.selection);
  const select = useLand((s) => s.select);
  const isolate = useLand((s) => s.isolate);
  const typeId = useLand((s) => s.typeId);
  if (!selection) return null;
  const e = selection.element;
  const cat = e.category as ModelCategory | undefined;
  const catLabel = cat ? (typeId === "galpon" ? staticCatalog.shared().categories[cat]?.label : LAND_CATEGORY_LABELS[cat]) : undefined;
  const params = Object.entries(e.parameters ?? {});
  return (
    <div className="ld-element" role="dialog" aria-label="Pieza seleccionada">
      <header>
        <div>
          <p className="ld-kicker">{catLabel ?? "Pieza"}</p>
          <h3>{e.label ?? e.elementId}</h3>
        </div>
        <button type="button" className="gp-ghost" onClick={() => select(null)} aria-label="Cerrar">
          <X aria-hidden />
        </button>
      </header>
      <dl>
        {e.family && (
          <div>
            <dt>Sistema</dt>
            <dd>{e.family}</dd>
          </div>
        )}
        {e.material && (
          <div>
            <dt>Material</dt>
            <dd>{e.material}</dd>
          </div>
        )}
        {e.level && (
          <div>
            <dt>Nivel</dt>
            <dd>{e.level}</dd>
          </div>
        )}
        {params.map(([k, v]) => (
          <div key={k}>
            <dt>{k.replace(/_/g, " ")}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
      {cat && (
        <button type="button" className="gp-button" onClick={() => isolate([cat])}>
          Aislar {catLabel?.toLowerCase() ?? "categoría"}
        </button>
      )}
    </div>
  );
}

export function Toast() {
  const toast = useLand((s) => s.toast);
  if (!toast) return null;
  return (
    <div className={`gp-toast gp-toast--${toast.tone} ld-toast`} role="status" key={toast.id}>
      {toast.text}
    </div>
  );
}
