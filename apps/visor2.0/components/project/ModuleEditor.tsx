"use client";
import { ArrowLeft, Copy, DoorOpen, Plus, Trash2, Square, X } from "lucide-react";
import { FACE_LABELS, MATERIALS, MW900 } from "../../core/building/definition";
import { wallLength } from "../../core/building/geometry";
import type { ModuleInstance, Opening, Selection, Wall } from "../../core/building/types";
import type { EditTool } from "./ProjectCanvas";

export function NumberField({
  label,
  name,
  value,
  min,
  max,
  step = 10,
}: {
  label: string;
  name: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="technical-field">
      <span>{label}</span>
      <div>
        <input
          name={name}
          type="number"
          defaultValue={Math.round(value * 1000)}
          min={min === undefined ? undefined : Math.round(min * 1000)}
          max={max === undefined ? undefined : Math.round(max * 1000)}
          step={step}
          required
        />
        <small>mm</small>
      </div>
    </label>
  );
}
type Props = {
  module: ModuleInstance;
  selection: Selection;
  tool: EditTool;
  onTool: (tool: EditTool) => void;
  onExit: () => void;
  onSelect: (id?: string) => void;
  onWall: (wall: Wall) => void;
  onOpening: (opening: Opening) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onAddPartition: () => void;
  onAddOpening: (kind: "door" | "window", wallId?: string) => void;
  onFloor: (material: string) => void;
};
export default function ModuleEditor(p: Props) {
  const wall = p.module.walls.find((w) => w.id === p.selection.elementId);
  const opening = p.module.openings.find((o) => o.id === p.selection.elementId);
  const hosted = p.module.walls.find((w) => w.id === opening?.wallId);
  const internalWalls = p.module.walls.filter((w) => w.kind === "internal");
  const read = (f: FormData, key: string) => Number(f.get(key)) / 1000;
  return (
    <>
      <div className="composer-heading">
        <div>
          <span>EDITAR MÓDULO / MW900</span>
          <h1>M{String(p.module.index + 1).padStart(2, "0")} · Distribución</h1>
        </div>
        <button className="icon-action" aria-label="Volver al edificio" onClick={p.onExit}>
          <ArrowLeft />
        </button>
      </div>
      <section className="composer-section">
        <div className="editor-tool-grid">
          <button
            className={p.tool === "wall" ? "active" : ""}
            onClick={() => p.onTool(p.tool === "wall" ? "select" : "wall")}
          >
            <Plus /> Dibujar muro
          </button>
          <button onClick={p.onAddPartition}>
            <Plus /> Divisor completo
          </button>
          <button onClick={() => p.onAddOpening("door", wall?.id)}>
            <DoorOpen /> Añadir puerta
          </button>
          <button onClick={() => p.onAddOpening("window", wall?.id)}>
            <Square /> Añadir ventana
          </button>
        </div>
        <div className="editor-instruction">
          {p.tool === "wall"
            ? "Marcá dos puntos sobre el piso. Ajuste ortogonal cada 50 mm."
            : p.tool === "window" || p.tool === "door"
              ? "Hacé clic sobre el muro anfitrión para colocar la abertura."
              : "Seleccioná un elemento en el modelo o en la lista para editarlo."}
        </div>
        {p.tool !== "select" && (
          <button className="secondary-button" onClick={() => p.onTool("select")}>
            <X /> Cancelar herramienta
          </button>
        )}
      </section>
      {(wall || opening) && (
        <section className="composer-section element-properties">
          <div className="property-heading">
            <span>
              {opening
                ? opening.kind === "window"
                  ? "VENTANA"
                  : "PUERTA"
                : wall?.kind === "external"
                  ? `MURO ${FACE_LABELS[wall.face!]}`
                  : "MURO DIVISOR"}
            </span>
            <button
              className="icon-action"
              aria-label="Quitar selección de elemento"
              onClick={() => p.onSelect()}
            >
              <X />
            </button>
          </div>
          {opening && hosted && (
            <form
              key={JSON.stringify(opening)}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                p.onOpening({
                  ...opening,
                  wallId: String(f.get("host")),
                  width: read(f, "width"),
                  height: read(f, "height"),
                  sillHeight: opening.kind === "door" ? 0 : read(f, "sill"),
                  position: read(f, "position"),
                  type: String(f.get("type")),
                  hinge: f.get("hinge") === "right" ? "right" : "left",
                  direction: Number(f.get("direction") ?? 1) === -1 ? -1 : 1,
                });
              }}
            >
              <label className="technical-field">
                <span>Muro anfitrión</span>
                <select name="host" defaultValue={opening.wallId}>
                  {p.module.walls.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.face ? FACE_LABELS[w.face] : w.id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-grid">
                <NumberField label="Ancho" name="width" value={opening.width} min={0.2} />
                <NumberField label="Alto" name="height" value={opening.height} min={0.2} />
                <NumberField
                  label="Posición desde inicio"
                  name="position"
                  value={opening.position}
                  min={0.05}
                />
                {opening.kind === "window" && (
                  <NumberField label="Antepecho" name="sill" value={opening.sillHeight} min={0} />
                )}
              </div>
              <label className="technical-field">
                <span>Tipo</span>
                <select name="type" defaultValue={opening.type}>
                  {opening.kind === "window" ? (
                    <>
                      <option value="fixed">Paño fijo</option>
                      <option value="sliding">Corrediza · 2 paños</option>
                    </>
                  ) : (
                    <option value="single">Una hoja abatible</option>
                  )}
                </select>
              </label>
              {opening.kind === "door" && (
                <div className="field-grid">
                  <label className="technical-field">
                    <span>Bisagra</span>
                    <select name="hinge" defaultValue={opening.hinge}>
                      <option value="left">Inicio del muro</option>
                      <option value="right">Final del muro</option>
                    </select>
                  </label>
                  <label className="technical-field">
                    <span>Apertura</span>
                    <select name="direction" defaultValue={opening.direction}>
                      <option value={1}>Lado positivo</option>
                      <option value={-1}>Lado negativo</option>
                    </select>
                  </label>
                </div>
              )}
              <button className="primary-button" type="submit">
                Aplicar dimensiones
              </button>
            </form>
          )}
          {wall && (
            <form
              key={JSON.stringify(wall)}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                p.onWall(
                  wall.kind === "external"
                    ? { ...wall, material: String(f.get("material")) }
                    : {
                        ...wall,
                        start: [read(f, "sx"), read(f, "sz")],
                        end: [read(f, "ex"), read(f, "ez")],
                        height: read(f, "height"),
                        thickness: read(f, "thickness"),
                        material: String(f.get("material")),
                      },
                );
              }}
            >
              <div className="dimension-readout">
                {Math.round(wallLength(wall) * 1000)} <small>mm de longitud</small>
              </div>
              {wall.kind === "internal" && (
                <div className="field-grid">
                  <NumberField label="Inicio X" name="sx" value={wall.start[0]} />
                  <NumberField label="Inicio Z" name="sz" value={wall.start[1]} />
                  <NumberField label="Final X" name="ex" value={wall.end[0]} />
                  <NumberField label="Final Z" name="ez" value={wall.end[1]} />
                  <NumberField
                    label="Altura"
                    name="height"
                    value={wall.height}
                    min={0.3}
                    max={MW900.coordinates.ceilingDatum - MW900.coordinates.floorDatum}
                    step={1}
                  />
                  <NumberField
                    label="Espesor"
                    name="thickness"
                    value={wall.thickness}
                    min={0.04}
                    max={0.3}
                  />
                </div>
              )}
              <label className="technical-field">
                <span>Material</span>
                <select name="material" defaultValue={wall.material}>
                  {Object.entries(MATERIALS)
                    .filter(([id]) => id.startsWith("panel"))
                    .map(([id, m]) => (
                      <option key={id} value={id}>
                        {m.label}
                      </option>
                    ))}
                </select>
              </label>
              <button className="primary-button" type="submit">
                Aplicar al muro
              </button>
            </form>
          )}
          <div className="element-actions">
            <button
              className="secondary-button"
              onClick={p.onDuplicate}
              disabled={wall?.kind === "external"}
            >
              <Copy /> Duplicar
            </button>
            <button className="secondary-button danger" onClick={p.onRemove}>
              <Trash2 /> Eliminar
            </button>
          </div>
          {wall && p.module.openings.some((o) => o.wallId === wall.id) && (
            <small className="muted">
              Eliminar este muro elimina también sus aberturas. Podés deshacer.
            </small>
          )}
          {wall?.kind === "external" && !p.module.openings.some((o) => o.wallId === wall.id) && (
            <small className="muted">
              El muro completo se elimina del perímetro. Podés deshacer.
            </small>
          )}
        </section>
      )}
      <section className="composer-section">
        <div className="section-title">
          Elementos del módulo <span>{p.module.walls.length + p.module.openings.length}</span>
        </div>
        <div className="element-list">
          {p.module.walls.map((w) => (
            <div key={w.id}>
              <button
                className={p.selection.elementId === w.id ? "selected" : ""}
                onClick={() => p.onSelect(w.id)}
              >
                <span>
                  ▤{" "}
                  {w.face
                    ? `Muro ${FACE_LABELS[w.face]}`
                    : `Divisor ${internalWalls.indexOf(w) + 1}`}
                </span>
                <small>{wallLength(w).toFixed(2)} m</small>
              </button>
              {p.module.openings
                .filter((o) => o.wallId === w.id)
                .map((o) => (
                  <button
                    className={`opening-row ${p.selection.elementId === o.id ? "selected" : ""}`}
                    key={o.id}
                    onClick={() => p.onSelect(o.id)}
                  >
                    <span>{o.kind === "window" ? "▣ Ventana" : "↱ Puerta"}</span>
                    <small>
                      {Math.round(o.width * 1000)} × {Math.round(o.height * 1000)}
                    </small>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </section>
      <section className="composer-section">
        <label className="technical-field">
          <span>Terminación del piso</span>
          <select value={p.module.floorMaterial} onChange={(e) => p.onFloor(e.target.value)}>
            <option value="floor-oak">Roble</option>
            <option value="floor-concrete">Cemento</option>
          </select>
        </label>
        <p className="muted">
          Cerramientos y acabados: propuesta de producto editable. Espesores pendientes de
          especificación.
        </p>
      </section>
    </>
  );
}
