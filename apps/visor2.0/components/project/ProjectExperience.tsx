"use client";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Box,
  Building2,
  Download,
  Eye,
  Grid3X3,
  Layers3,
  Link2,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RotateCw,
  Ruler,
  Save,
  Settings2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assetPath } from "../environment/utils/assetPath";
import { MW900, FACE_LABELS } from "../../core/building/definition";
import {
  activeModule,
  footprint,
  neighborGraph,
  occupied,
  snapCandidate,
} from "../../core/building/assembly";
import {
  createModule,
  estimate,
  putOpening,
  putWall,
  quantities,
  recompose,
  removeElement,
  updateModule,
} from "../../core/building/engine";
import { isLongitudinal, wallLength } from "../../core/building/geometry";
import { validateOpening, validateProject } from "../../core/building/validation";
import { parseProject, serializeProject } from "../../core/building/persistence";
import type { Face, Layout, Opening, Selection, Vec2, Wall } from "../../core/building/types";
import type { EditTool } from "./ProjectCanvas";
import ModuleEditor from "./ModuleEditor";
import { useProject } from "./useProject";

const ProjectCanvas = dynamic(() => import("./ProjectCanvas"), {
  ssr: false,
  loading: () => (
    <div className="project-canvas-loading">
      <img src={assetPath("/brand/mw-isotype-light.svg")} alt="" />
      <span>Preparando MW900</span>
    </div>
  ),
});
const number = (v: number, d = 1) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: d }).format(v);
const date = (value: number) =>
  new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(value);
const label = (index: number) => `M${String(index + 1).padStart(2, "0")}`;
const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const layouts: { id: Layout; label: string; description: string }[] = [
  { id: "auto", label: "Auto", description: "Grilla compacta con apoyos alineados" },
  { id: "linear", label: "Lineal", description: "Módulos unidos por su lado largo" },
  { id: "compact", label: "Compacto", description: "Proporción optimizada en metros" },
];
function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="top-metric">
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}
function Tool({
  label,
  active = false,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`tool-button ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function download(text: string, name: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ProjectExperience() {
  const {
    project,
    projectId,
    projects,
    desktop,
    apply,
    undo,
    redo,
    save,
    newProject,
    openProject,
    importProject,
    importDesktop,
    exportDesktop,
    status,
    error,
    setError,
    canUndo,
    canRedo,
  } = useProject();
  const [selection, setSelection] = useState<Selection>({ moduleId: "module-1" });
  const [editing, setEditing] = useState(false),
    [section, setSection] = useState("composition");
  const [cameraView, setCameraView] = useState<"perspective" | "top">("perspective");
  const [view, setView] = useState<"full" | "cut" | "structure">("cut");
  const [gridVisible, setGridVisible] = useState(true),
    [connectionsVisible, setConnectionsVisible] = useState(false);
  const [resetToken, setResetToken] = useState(0),
    [level, setLevel] = useState(0),
    [tool, setTool] = useState<EditTool>("select");
  const [snapFace, setSnapFace] = useState<Face>("south");
  const importRef = useRef<HTMLInputElement>(null);
  const selected = project.modules.find((m) => m.id === selection.moduleId) ?? project.modules[0];
  const actualSelection =
    selected.id === selection.moduleId ? selection : { moduleId: selected.id };
  const graph = useMemo(() => neighborGraph(project.modules), [project.modules]);
  const editableSelected = useMemo(
    () => activeModule(selected, graph[selected.id]),
    [selected, graph],
  );
  const takeoff = useMemo(() => quantities(project), [project]);
  const quote = useMemo(() => estimate(project), [project]);
  const issues = useMemo(() => validateProject(project), [project]);
  const currentLevel = Math.min(level, Math.max(...project.modules.map((m) => m.level)));
  const surface = project.modules.length * MW900.dimensions.length * MW900.dimensions.width;
  const select = useCallback((moduleId: string, elementId?: string) => {
    setSelection({ moduleId, elementId });
  }, []);
  const enter = useCallback((moduleId: string) => {
    setSelection({ moduleId });
    setEditing(true);
    setTool("select");
    setView("cut");
  }, []);
  const exit = useCallback(() => {
    setEditing(false);
    setTool("select");
    setSelection((s) => ({ moduleId: s.moduleId }));
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "Escape") {
        if (tool !== "select") setTool("select");
        else if (selection.elementId) setSelection((s) => ({ moduleId: s.moduleId }));
        else exit();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [exit, undo, redo, selection.elementId, tool]);
  const compose = (
    count = project.modules.length,
    levels = project.levels,
    layout = project.layout,
  ) => {
    apply((p) => recompose(p, count, Math.min(count, levels), layout));
    setLevel(0);
  };
  const addWall = (start: Vec2, end: Vec2) => {
    const wall: Wall = {
      id: id("divisor"),
      kind: "internal",
      start,
      end,
      thickness: MW900.proposedLayers.partitionThickness,
      height: MW900.coordinates.ceilingDatum - MW900.coordinates.floorDatum,
      material: "panel-light",
    };
    if (apply((p) => putWall(p, selected.id, wall))) {
      setSelection({ moduleId: selected.id, elementId: wall.id });
      setTool("select");
    }
  };
  const addOpening = (kind: "door" | "window", wallId?: string, position?: number) => {
    if (!wallId) {
      setTool(kind);
      setError("");
      return;
    }
    const wall =
      editableSelected.walls.find((w) => w.id === wallId) ??
      editableSelected.walls.find((w) =>
        kind === "door"
          ? w.kind === "internal"
          : w.kind === "external" && !graph[selected.id][w.face!],
      );
    if (!wall) {
      setTool(kind);
      setError("Seleccioná un muro anfitrión en el modelo.");
      return;
    }
    const opening: Opening = {
      id: id(kind),
      kind,
      wallId: wall.id,
      position: position ?? 0.2,
      width: kind === "door" ? 0.9 : 1.2,
      height: kind === "door" ? 2.1 : 1.2,
      sillHeight: kind === "door" ? 0 : 0.9,
      direction: 1,
      hinge: "left",
      type: kind === "door" ? "single" : "fixed",
    };
    if (position === undefined) {
      let found = false;
      for (let x = 0.1; x + opening.width < wallLength(wall) - 0.05; x += 0.05) {
        opening.position = Math.round(x * 1000) / 1000;
        if (!validateOpening(opening, wall, selected.openings).length) {
          found = true;
          break;
        }
      }
      if (!found) {
        setError(
          "No hay espacio libre para esa abertura en el muro elegido. Elegí otro muro o editá las aberturas existentes.",
        );
        return;
      }
    }
    if (apply((p) => putOpening(p, selected.id, opening))) {
      setSelection({ moduleId: selected.id, elementId: opening.id });
      setTool("select");
    }
  };
  const moveElement = (value: number) => {
    const opening = selected.openings.find((o) => o.id === actualSelection.elementId),
      wall = selected.walls.find((w) => w.id === actualSelection.elementId);
    if (opening) apply((p) => putOpening(p, selected.id, { ...opening, position: value }));
    else if (wall && wall.kind === "internal") {
      const axis = isLongitudinal(wall) ? 1 : 0;
      const start = [...wall.start] as Vec2,
        end = [...wall.end] as Vec2;
      start[axis] = value;
      end[axis] = value;
      apply((p) => putWall(p, selected.id, { ...wall, start, end }));
    }
  };
  const duplicate = () => {
    const opening = selected.openings.find((o) => o.id === actualSelection.elementId),
      wall = selected.walls.find((w) => w.id === actualSelection.elementId);
    if (opening) {
      const copy = {
        ...opening,
        id: id(opening.kind),
        position: opening.position + opening.width + 0.1,
      };
      if (apply((p) => putOpening(p, selected.id, copy)))
        setSelection({ moduleId: selected.id, elementId: copy.id });
    } else if (wall?.kind === "internal") {
      const axis = isLongitudinal(wall) ? 1 : 0;
      const start = [...wall.start] as Vec2,
        end = [...wall.end] as Vec2;
      start[axis] += 0.5;
      end[axis] += 0.5;
      const copy = { ...wall, id: id("divisor"), start, end };
      if (apply((p) => putWall(p, selected.id, copy)))
        setSelection({ moduleId: selected.id, elementId: copy.id });
    }
  };
  const candidate = snapCandidate(selected, snapFace);
  const snapInvalid =
    occupied(candidate, project.modules) ||
    candidate[1] < 0 ||
    candidate[1] >= MW900.dimensions.height * 3 ||
    (candidate[1] > 0 &&
      !project.modules.some((m) =>
        m.position.every(
          (v, i) =>
            Math.abs(v - (i === 1 ? candidate[i] - MW900.dimensions.height : candidate[i])) <
            0.0001,
        ),
      ));
  const addConnected = () => {
    if (snapInvalid) return;
    apply((p) => {
      const index = Math.max(...p.modules.map((m) => m.index)) + 1;
      const instance = createModule({
        id: `module-${index + 1}`,
        index,
        level: Math.round(candidate[1] / MW900.dimensions.height),
        position: candidate,
      });
      return {
        ...p,
        levels: Math.max(p.levels, instance.level + 1),
        modules: [...p.modules, instance],
      };
    });
  };
  const navigate = (next: string) => {
    exit();
    setSection(next);
  };
  const importFile = async (file: File) => {
    try {
      const parsed = parseProject(await file.text());
      await importProject(parsed);
      exit();
      setSelection({ moduleId: parsed.modules[0].id });
      setLevel(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar.");
    }
  };
  const importNativeFile = async () => {
    const parsed = await importDesktop();
    if (!parsed) return;
    exit();
    setSelection({ moduleId: parsed.modules[0].id });
    setLevel(0);
  };
  return (
    <main className="project-app">
      <header className="project-header">
        <div className="project-brand">
          <img src={assetPath("/brand/mw-lockup-light.svg")} alt="MODELLWERK" />
          <span>PROJECT / VISOR 2.0</span>
          {desktop && <small className="desktop-mode">DESKTOP · LOCAL</small>}
        </div>
        <button className="project-name" onClick={() => navigate("project")}>
          <span>PROYECTO</span>
          <strong>{project.name}</strong>
          <Settings2 />
        </button>
        <div className="top-metrics">
          <Metric label="MÓDULOS" value={String(project.modules.length)} unit="uds" />
          <Metric label="SUPERFICIE" value={number(surface)} unit="m²" />
          <Metric label="HUELLA" value={number(footprint(project.modules))} unit="m²" />
          <Metric
            label="NIVELES"
            value={String(Math.max(...project.modules.map((m) => m.level)) + 1)}
          />
          <Metric
            label="INVERSIÓN BASE"
            value={quote.total === null ? "A cotizar" : `USD ${number(quote.total, 0)}`}
          />
          <Metric label="MONTAJE" value="A validar" />
        </div>
        <div className="header-actions">
          <Tool label="Deshacer" disabled={!canUndo} onClick={undo}>
            <Undo2 />
          </Tool>
          <Tool label="Rehacer" disabled={!canRedo} onClick={redo}>
            <Redo2 />
          </Tool>
          <Tool label="Guardar proyecto" onClick={save}>
            <Save />
          </Tool>
        </div>
      </header>
      <aside className="project-sidebar" aria-label="Secciones del proyecto">
        {[
          { id: "project", name: "Proyecto", icon: Building2 },
          { id: "composition", name: "Módulos", icon: Box },
          { id: "layout", name: "Implantación", icon: Grid3X3 },
          { id: "levels", name: "Niveles", icon: Layers3 },
          { id: "data", name: "Datos", icon: Ruler },
          { id: "settings", name: "Ajustes", icon: Settings2 },
        ].map((s) => (
          <button
            key={s.id}
            className={section === s.id && !editing ? "active" : ""}
            onClick={() => navigate(s.id)}
          >
            <s.icon />
            <span>{s.name}</span>
          </button>
        ))}
      </aside>
      <section className="project-workspace">
        <div className="canvas-toolbar">
          <div className="tool-cluster">
            <Tool
              label={editing ? "Volver al edificio" : "Seleccionar"}
              active={tool === "select"}
              onClick={editing ? exit : () => setTool("select")}
            >
              {editing ? <ArrowLeft /> : <MousePointer2 />}
            </Tool>
            <Tool
              label="Mostrar retícula"
              active={gridVisible}
              onClick={() => setGridVisible((v) => !v)}
            >
              <Grid3X3 />
            </Tool>
            <Tool
              label="Mostrar conexiones"
              active={connectionsVisible}
              onClick={() => setConnectionsVisible((v) => !v)}
            >
              <Link2 />
            </Tool>
          </div>
          <div className="tool-cluster">
            <Tool
              label="Rotar edificio 90 grados"
              onClick={() =>
                apply((p) => ({ ...p, rotation: (p.rotation + Math.PI / 2) % (Math.PI * 2) }))
              }
            >
              <RotateCw />
            </Tool>
            <Tool label="Encuadrar" onClick={() => setResetToken((v) => v + 1)}>
              <Maximize2 />
            </Tool>
          </div>
          <div className="view-switch">
            <button
              className={cameraView === "perspective" ? "active" : ""}
              onClick={() => setCameraView("perspective")}
            >
              <Eye /> 3D
            </button>
            <button
              className={cameraView === "top" ? "active" : ""}
              onClick={() => {
                setCameraView("top");
                setLevel(selected.level);
              }}
            >
              <Grid3X3 /> Planta
            </button>
          </div>
        </div>
        <div className="scene-breadcrumb">
          <span>EDIFICIO</span>
          <i>/</i>
          <strong>{editing ? `${label(selected.index)} · EDITAR MÓDULO` : "MW900"}</strong>
          <span className="scene-mode">
            {cameraView === "top" || editing
              ? "CORTE +1,20 m"
              : view === "structure"
                ? "ESTRUCTURA"
                : view === "cut"
                  ? "SECCIÓN ABIERTA"
                  : "ENVOLVENTE"}
          </span>
        </div>
        <ProjectCanvas
          project={project}
          selection={actualSelection}
          editing={editing}
          cameraView={cameraView}
          view={editing ? "cut" : view}
          level={editing ? selected.level : currentLevel}
          gridVisible={gridVisible}
          connectionsVisible={connectionsVisible}
          snapPreview={{ position: candidate, valid: !snapInvalid }}
          resetToken={resetToken}
          tool={tool}
          onSelect={select}
          onEnter={enter}
          onDrawWall={addWall}
          onPlaceOpening={(wall, position) =>
            addOpening(tool === "door" ? "door" : "window", wall.id, position)
          }
          onMoveElement={moveElement}
        />
        <div className="scene-view-controls">
          <select
            aria-label="Representación del modelo"
            value={editing || (cameraView === "top" && view === "full") ? "cut" : view}
            disabled={editing}
            title={editing ? "La edición usa un corte para acceder al interior" : undefined}
            onChange={(e) => setView(e.target.value as typeof view)}
          >
            <option value="cut">Sección abierta</option>
            <option value="full" disabled={cameraView === "top"}>
              Envolvente completa
            </option>
            <option value="structure">Solo estructura</option>
          </select>
          {cameraView === "top" && !editing && (
            <select
              aria-label="Nivel de planta"
              value={currentLevel}
              onChange={(e) => setLevel(Number(e.target.value))}
            >
              {Array.from({ length: project.levels }, (_, i) => (
                <option key={i} value={i}>
                  Nivel {i} · +{number(i * MW900.dimensions.height, 2)} m
                </option>
              ))}
            </select>
          )}
        </div>
        {error && (
          <div className="validation-toast" role="alert">
            <span>{error}</span>
            <button aria-label="Cerrar aviso" onClick={() => setError("")}>
              <X />
            </button>
          </div>
        )}
        <div className="canvas-status">
          <span>
            <i />{" "}
            {issues.length
              ? `${issues.length} conflictos`
              : "Geometría validada · encaje por caras"}
          </span>
          <span>{status}</span>
        </div>
      </section>
      <aside className="composer-panel" aria-label="Configuración contextual">
        {editing ? (
          <ModuleEditor
            module={editableSelected}
            selection={actualSelection}
            tool={tool}
            onTool={(t) => {
              setTool(t);
              if (t === "wall") setCameraView("top");
            }}
            onExit={exit}
            onSelect={(elementId) => setSelection({ moduleId: selected.id, elementId })}
            onWall={(wall) => apply((p) => putWall(p, selected.id, wall))}
            onOpening={(opening) => apply((p) => putOpening(p, selected.id, opening))}
            onRemove={() => {
              if (
                actualSelection.elementId &&
                apply((p) => removeElement(p, selected.id, actualSelection.elementId!))
              )
                setSelection({ moduleId: selected.id });
            }}
            onDuplicate={duplicate}
            onAddPartition={() => {
              const z = Math.abs(MW900.walls[0].start[1]) - MW900.proposedLayers.wallThickness / 2;
              addWall([0, -z], [0, z]);
            }}
            onAddOpening={addOpening}
            onFloor={(floorMaterial) =>
              apply((p) => updateModule(p, selected.id, (m) => ({ ...m, floorMaterial })))
            }
          />
        ) : (
          <>
            <div className="composer-heading">
              <div>
                <span>MW900 / PRODUCTO NATIVO</span>
                <h1>
                  {section === "data"
                    ? "Cómputo y estimación"
                    : section === "project"
                      ? "Datos del proyecto"
                      : section === "settings"
                        ? "Preferencias del visor"
                        : "Edificio modular"}
                </h1>
              </div>
              <Building2 />
            </div>
            {["composition", "layout", "levels"].includes(section) && (
              <>
                <section className="composer-section">
                  <div className="section-label">
                    <span>01</span>
                    <div>
                      <strong>MW900 · Sistema base</strong>
                      <small>Estructura medida desde Blender</small>
                    </div>
                  </div>
                  <div className="module-specs">
                    <span>9,00 × 3,00 × 2,80 m</span>
                    <strong>27 m² / unidad</strong>
                  </div>
                  <div className="count-control">
                    <button
                      aria-label="Quitar un módulo"
                      disabled={project.modules.length === 1}
                      onClick={() => compose(project.modules.length - 1)}
                    >
                      <Minus />
                    </button>
                    <div>
                      <strong>{project.modules.length}</strong>
                      <span>MÓDULOS</span>
                    </div>
                    <button
                      aria-label="Agregar un módulo"
                      disabled={project.modules.length >= 10}
                      onClick={() => compose(project.modules.length + 1)}
                    >
                      <Plus />
                    </button>
                  </div>
                  <div className="quick-counts">
                    {[1, 2, 4, 6, 8, 10].map((n) => (
                      <button
                        className={project.modules.length === n ? "active" : ""}
                        key={n}
                        onClick={() => compose(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="composer-section">
                  <div className="section-label">
                    <span>02</span>
                    <div>
                      <strong>Implantación y niveles</strong>
                      <small>Uniones sin separación añadida</small>
                    </div>
                  </div>
                  <div className="layout-options">
                    {layouts.map((l) => (
                      <button
                        key={l.id}
                        className={project.layout === l.id ? "active" : ""}
                        title={l.description}
                        onClick={() => compose(project.modules.length, project.levels, l.id)}
                      >
                        <span className={`layout-glyph ${l.id}`}>
                          <i />
                          <i />
                          <i />
                          <i />
                        </span>
                        <strong>{l.label}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="levels-control">
                    <span>NIVELES</span>
                    <div>
                      {[1, 2, 3].map((l) => (
                        <button
                          key={l}
                          disabled={l > project.modules.length}
                          className={project.levels === l ? "active" : ""}
                          onClick={() => compose(project.modules.length, l)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="composer-section">
                  <div className="section-title">
                    Módulos <span>{project.modules.length}</span>
                  </div>
                  <div className="module-list">
                    {project.modules.map((m) => (
                      <button
                        key={m.id}
                        className={selected.id === m.id ? "selected" : ""}
                        onClick={() => select(m.id)}
                        onDoubleClick={() => enter(m.id)}
                      >
                        <b>{label(m.index)}</b>
                        <span>N{m.level}</span>
                        <small>
                          {m.walls.filter((w) => w.kind === "internal").length} divisores ·{" "}
                          {m.openings.length} aberturas
                        </small>
                      </button>
                    ))}
                  </div>
                  <button className="primary-button" onClick={() => enter(selected.id)}>
                    Editar {label(selected.index)} <span>↗</span>
                  </button>
                </section>
                <section className="composer-section">
                  <div className="section-title">Conexiones de {label(selected.index)}</div>
                  <div className="neighbor-list">
                    {Object.entries(graph[selected.id]).length ? (
                      Object.entries(graph[selected.id]).map(([face, id]) => (
                        <div key={face}>
                          <span>● {FACE_LABELS[face as Face]}</span>
                          <strong>{label(project.modules.find((m) => m.id === id)!.index)}</strong>
                        </div>
                      ))
                    ) : (
                      <span className="muted">Módulo independiente</span>
                    )}
                  </div>
                  <label className="technical-field">
                    <span>Conectar otro MW900</span>
                    <select
                      value={snapFace}
                      onChange={(e) => {
                        setSnapFace(e.target.value as Face);
                        setConnectionsVisible(true);
                      }}
                    >
                      {(["north", "south", "east", "west", "above"] as Face[]).map((f) => (
                        <option value={f} key={f}>
                          {FACE_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={`snap-preview ${snapInvalid ? "invalid" : ""}`}>
                    {snapInvalid
                      ? "Cara ocupada o sin apoyo"
                      : `Conexión disponible · ${FACE_LABELS[snapFace]}`}
                    <small>
                      X {number(candidate[0], 2)} / Y {number(candidate[1], 2)} / Z{" "}
                      {number(candidate[2], 2)} m
                    </small>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={snapInvalid || project.modules.length >= 10}
                    onClick={addConnected}
                  >
                    <Plus /> Conectar módulo
                  </button>
                  <p className="muted">
                    Recomponer cantidad, implantación o niveles vuelve a la grilla automática y
                    conserva las distribuciones por módulo.
                  </p>
                </section>
              </>
            )}
            {section === "project" && (
              <section className="composer-section">
                {desktop && (
                  <div className="desktop-project-library">
                    <div className="library-heading">
                      <div>
                        <span>Biblioteca local</span>
                        <strong>{projects.length} proyectos</strong>
                      </div>
                      <button type="button" onClick={() => void newProject()}>
                        <Plus /> Nuevo
                      </button>
                    </div>
                    <div className="library-list">
                      {projects.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={item.id === projectId ? "active" : ""}
                          onClick={() => void openProject(item.id)}
                        >
                          <span>{item.name}</span>
                          <small>{date(item.updatedAt)}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <label className="technical-field">
                  <span>Nombre del proyecto</span>
                  <input
                    maxLength={120}
                    value={project.name}
                    onChange={(e) => apply((p) => ({ ...p, name: e.target.value }))}
                  />
                </label>
                <div className="editor-tool-grid">
                  <button onClick={save}>
                    <Save /> Guardar
                  </button>
                  <button
                    onClick={() =>
                      desktop
                        ? void exportDesktop()
                        : download(serializeProject(project), "MW900-proyecto.json")
                    }
                  >
                    <Download /> {desktop ? "Exportar .mwproject" : "Exportar JSON"}
                  </button>
                  <button
                    onClick={() =>
                      desktop ? void importNativeFile() : importRef.current?.click()
                    }
                  >
                    <Upload /> {desktop ? "Abrir archivo" : "Importar JSON"}
                  </button>
                </div>
                <p className="muted">
                  {status}. {desktop
                    ? "Los cambios quedan en SQLite y cada archivo importado se agrega como un proyecto nuevo."
                    : "Exportá una copia para trasladar el edificio a otra computadora."}
                </p>
                <div className="project-summary">
                  <div>
                    <span>Superficie bruta</span>
                    <strong>{number(surface)} m²</strong>
                  </div>
                  <div>
                    <span>Huella ocupada</span>
                    <strong>{number(footprint(project.modules))} m²</strong>
                  </div>
                  <div>
                    <span>Validación geométrica</span>
                    <strong>
                      {issues.length ? `${issues.length} conflictos` : "Sin conflictos"}
                    </strong>
                  </div>
                </div>
              </section>
            )}
            {section === "data" && (
              <section className="composer-section">
                <p className="muted">
                  Cantidades calculadas desde el edificio. Ingresá tus precios unitarios en USD; los
                  importes vacíos quedan a cotizar.
                </p>
                <div className="quantity-table">
                  {takeoff.map((q) => (
                    <div key={q.id}>
                      <label>
                        {q.label}
                        <strong>
                          {number(q.amount, 2)} {q.unit}
                        </strong>
                      </label>
                      {q.id !== "wall-length" && (
                        <label className="rate-input">
                          <span>USD / {q.unit}</span>
                          <input
                            aria-label={`Precio ${q.label}`}
                            type="number"
                            min={0}
                            max={1e9}
                            step={0.01}
                            placeholder="A cotizar"
                            value={project.rates[q.id] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              apply((p) => ({
                                ...p,
                                rates: {
                                  ...p.rates,
                                  [q.id]: v === "" ? null : Math.max(0, Math.min(1e9, Number(v))),
                                },
                              }));
                            }}
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
                <div className="quote-total">
                  <span>ESTIMACIÓN DE COMPONENTES</span>
                  <strong>
                    {quote.total === null ? "A cotizar" : `USD ${number(quote.total, 0)}`}
                  </strong>
                  <small>Sin impuestos, logística ni montaje. Precios ingresados por vos.</small>
                </div>
                <button
                  className="secondary-button"
                  onClick={() =>
                    download(
                      [
                        "Componente;Cantidad;Unidad;Precio USD",
                        ...quote.lines.map(
                          (q) => `${q.label};${q.amount.toFixed(3)};${q.unit};${q.rate ?? ""}`,
                        ),
                      ].join("\n"),
                      "MW900-computo.csv",
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  <Download /> Exportar cómputo
                </button>
                <p className="muted">
                  Las interfaces entre módulos conservan sus paneles hasta definir una unión
                  interior. La geometría no equivale a una verificación estructural.
                </p>
              </section>
            )}
            {section === "settings" && (
              <section className="composer-section">
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={gridVisible}
                    onChange={(e) => setGridVisible(e.target.checked)}
                  />
                  Retícula métrica
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={connectionsVisible}
                    onChange={(e) => setConnectionsVisible(e.target.checked)}
                  />
                  Conexiones entre módulos
                </label>
                <div className="technical-note">
                  <strong>Coordenadas</strong>
                  <p>
                    X longitudinal · Y vertical · Z transversal.
                    <br />
                    Origen: centro de la base estructural.
                    <br />
                    Piso terminado: +{number(MW900.coordinates.floorDatum, 3)} m.
                  </p>
                  <strong>Edición</strong>
                  <p>
                    Doble clic: entrar a un módulo.
                    <br />
                    Esc: salir de herramienta o selección.
                    <br />
                    Ctrl / ⌘ Z: deshacer.
                    <br />
                    Ctrl / ⌘ Shift Z: rehacer.
                  </p>
                  <strong>Estado del producto</strong>
                  <p>
                    Estructura v002 medida. Paquetes de piso, cerramientos y cubierta propuestos;
                    pendientes de especificación constructiva. Apoyos y uniones requieren cálculo.
                  </p>
                </div>
              </section>
            )}
          </>
        )}
      </aside>
      <nav className="project-timeline" aria-label="Etapas de proyecto">
        {[
          { id: "composition", title: "Composición", detail: `${project.modules.length} MW900` },
          {
            id: "layout",
            title: "Implantación",
            detail: `${number(footprint(project.modules))} m² de huella`,
          },
          { id: "data", title: "Datos y cómputo", detail: `${takeoff.length} partidas` },
          { id: "edit", title: "Configurar módulos", detail: `Editar ${label(selected.index)}` },
        ].map((s, i) => (
          <button
            key={s.id}
            className={(editing ? s.id === "edit" : section === s.id) ? "active" : ""}
            onClick={() => (s.id === "edit" ? enter(selected.id) : navigate(s.id))}
          >
            <span>0{i + 1}</span>
            <div>
              <strong>{s.title}</strong>
              <small>{s.detail}</small>
            </div>
            <i>↗</i>
          </button>
        ))}
      </nav>
      <input
        ref={importRef}
        type="file"
        accept=".mwproject,.json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = "";
        }}
      />
    </main>
  );
}
