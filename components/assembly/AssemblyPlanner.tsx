"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useShallow } from "zustand/react/shallow";
import { type LucideIcon, ArrowDown, ArrowUp, ArrowUpRight, Box, Boxes, Check, ChevronDown, ChevronRight, CircleHelp, Download, Eye, EyeOff, Focus, GitBranch, GripVertical, HardHat, Layers3, LayoutGrid, Maximize2, MousePointer2, Move, Pause, Play, Plus, RotateCcw, Save, Search, Settings2, ShieldCheck, SkipBack, SkipForward, StepBack, StepForward, Timer, Truck, Upload, X, Zap, TriangleAlert, Crosshair } from "lucide-react";
import { analyzePlan, buildSchedule, formatTime, getModuleState } from "@/core/assembly/engine";
import { validateProject } from "@/core/assembly/validation";
import { createDemoProject } from "@/core/assembly/demo";
import type { Project, ModuleState } from "@/core/assembly/types";
import { useAssembly, type Mode } from "./store";
import { assetPath } from "@/components/environment/utils/assetPath";
import AssemblyTimeline from "./AssemblyTimeline";
import DependencyGraph from "./DependencyGraph";
import type { AssemblySceneProps } from "./AssemblyScene";
import "./assembly.css";

const Scene = dynamic(() => import("./AssemblyScene"), { ssr: false, loading: () => <div className="mw-as-loading"><Boxes size={34} /><span>Preparando implantación…</span></div> });
function LiveScene(props: AssemblySceneProps) {
  const time = useAssembly((state) => state.time);
  return <Scene {...props} time={time} />;
}
const MODES: { id: Mode; name: string; icon: LucideIcon }[] = [
  { id: "ASSEMBLY", name: "Montaje", icon: Boxes }, { id: "PLAN", name: "Planta", icon: LayoutGrid },
  { id: "LOGISTICS", name: "Logística", icon: Truck }, { id: "CRANE", name: "Grúa", icon: Crosshair },
  { id: "TIMELINE", name: "Cronograma", icon: Timer }, { id: "DEPENDENCIES", name: "Dependencias", icon: GitBranch },
  { id: "SIMULATION", name: "Simulación", icon: Play },
];
const STATE_NAMES: Record<ModuleState, string> = { "NOT READY": "Bloqueado", READY: "Listo", "IN TRANSIT": "En tránsito", "ON SITE": "En obra", LIFTING: "Izando", POSITIONING: "Posicionando", FIXING: "Fijando", INSTALLED: "Instalado", CONNECTED: "Conectado", INSPECTED: "Inspeccionado", COMPLETED: "Completado" };
const INSTALLED: string[] = ["INSTALLED", "CONNECTED", "INSPECTED", "COMPLETED"];
const SAVE_KEY = "mw-assembly-project-v1";

function Tool({ icon: Icon, title, active, onClick, disabled }: { icon: LucideIcon; title: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button className={`mw-as-tool ${active ? "active" : ""}`} title={title} aria-label={title} aria-pressed={active} onClick={onClick} disabled={disabled}><Icon size={16} strokeWidth={1.7} /></button>;
}
function Numeric({ label, value, unit, onChange, min = 0.1 }: { label: string; value: number; unit: string; onChange: (n: number) => void; min?: number }) {
  return <label className="mw-as-field"><span>{label}</span><div><input key={value} aria-label={label} type="number" defaultValue={Number(value.toFixed(2))} min={min} step="0.1" onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= min) onChange(n); else e.target.value = String(value); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} /><small>{unit}</small></div></label>;
}
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="mw-as-loading"><TriangleAlert /><strong>No se pudo iniciar el visor 3D</strong><span>Activá la aceleración gráfica del navegador. La secuencia y el cronograma siguen disponibles.</span></div> : this.props.children; }
}

export default function AssemblyPlanner() {
  const s = useAssembly(useShallow((state) => ({ ...state, time: Math.floor(state.time) })));
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [leftTab, setLeftTab] = useState<"modules" | "resources">("modules");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"project" | "help" | "conflicts" | "scenarios" | null>(null);
  const [snapshots, setSnapshots] = useState<{ name: string; project: Project }[]>([]);
  const [scenarioName, setScenarioName] = useState("Base · 01");
  const [viewReset, setViewReset] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const moduleList = useRef<HTMLDivElement>(null);
  const modalPanel = useRef<HTMLElement>(null);
  const schedule = useMemo(() => buildSchedule(s.project), [s.project]);
  const conflicts = useMemo(() => analyzePlan(s.project, schedule), [s.project, schedule]);
  const selected = s.project.modules.find((m) => m.id === s.selectedId);
  const selectedTask = schedule.items.find((t) => t.moduleId === s.selectedId);
  const status = selectedTask ? getModuleState(selectedTask, s.time) : "NOT READY";
  const crane = s.project.cranes[0];
  const selectedCrane = s.project.cranes.find((c) => c.id === selectedTask?.craneId) ?? crane;
  const installed = schedule.items.filter((t) => INSTALLED.includes(getModuleState(t, s.time))).length;
  const active = schedule.items.find((t) => s.time >= t.liftStart && s.time < t.release) ?? schedule.items.find((t) => s.time >= t.start && s.time < t.end);
  const activeCrane = s.project.cranes.find((c) => c.id === active?.craneId) ?? crane;
  const upcoming = schedule.items.find((t) => t.liftStart > s.time);
  const progress = Math.round(installed / Math.max(1, s.project.modules.length) * 100);
  const radius = selected && selectedCrane ? Math.hypot(selected.position[0] - selectedCrane.position[0], selected.position[2] - selectedCrane.position[2]) : 0;
  const modules = s.project.sequence.map((id) => s.project.modules.find((m) => m.id === id)!).filter((m) => m && (level === "all" || m.level === Number(level)) && `${m.id} ${m.name} ${m.type}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!s.playing) return;
    let previous = performance.now();
    let frame: number;
    const tick = (now: number) => {
      // Sample the technical simulation at 20 Hz; keep the rest of the UI responsive.
      if (now - previous < 50) { frame = requestAnimationFrame(tick); return; }
      const state = useAssembly.getState();
      // Speed is real-time multiplier: x60 advances one planned minute per real second.
      const next = Math.min(schedule.duration, state.time + Math.min(now - previous, 250) / 60000 * state.speed);
      previous = now;
      useAssembly.setState({ time: next, playing: next < schedule.duration });
      if (next < schedule.duration) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [s.playing, schedule.duration]);

  useEffect(() => {
    const container = moduleList.current;
    const row = container?.querySelector<HTMLElement>('.mw-as-modulerow.selected');
    if (container && row) container.scrollTo({ top: Math.max(0, row.offsetTop - container.offsetTop - container.clientHeight / 2 + row.offsetHeight / 2), behavior: 'smooth' });
  }, [s.selectedId, leftTab, level, query]);

  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    modalPanel.current?.querySelector<HTMLElement>('button')?.focus();
    return () => previous?.focus();
  }, [dialog]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (dialog) {
        if (e.key === 'Escape') setDialog(null);
        if (e.key === 'Tab') {
          const controls = modalPanel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]');
          if (controls?.length) {
            const first = controls[0], last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          }
        }
        return;
      }
      if ((e.target as HTMLElement)?.closest("input, select, textarea, button")) return;
      if (e.code === "Space") { e.preventDefault(); useAssembly.getState().togglePlay(); }
      if (e.code === "Escape") useAssembly.getState().select(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dialog]);

  const jump = (direction: number) => {
    const points = [...new Set(schedule.items.flatMap((t) => [t.arrival, t.liftStart, t.positionStart, t.fixStart, t.release, t.end]))].sort((a, b) => a - b);
    s.setTime(direction > 0 ? points.find((t) => t > s.time + 0.01) ?? schedule.duration : points.reverse().find((t) => t < s.time - 0.01) ?? 0);
  };
  const save = () => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s.project)); s.notify("Proyecto guardado en este navegador."); } catch { s.notify("No se pudo guardar. Exportá el proyecto a JSON para conservarlo."); }
  };
  const exportProject = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(s.project, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "mw-assembly-project.json"; a.click(); URL.revokeObjectURL(url);
    s.notify("Proyecto exportado con geometría, recursos y secuencia.");
  };
  const importValue = (value: unknown) => {
    const result = validateProject(value);
    if (!result.valid) { s.notify(`No se pudo abrir: ${result.errors.slice(0, 2).join(" · ")}`); return; }
    s.load(value as Project); setScenarioName("Importado · 01"); setDialog(null); s.notify("Proyecto cargado. Cronograma recalculado.");
  };
  const restore = () => { try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) { s.notify("Todavía no hay un proyecto guardado en este navegador."); return; } importValue(JSON.parse(raw)); } catch { s.notify("El archivo guardado no es válido."); } };
  const reorder = (id: string, direction: number) => {
    const index = s.project.sequence.indexOf(id);
    const target = direction < 0 ? s.project.sequence[index - 1] : s.project.sequence[index + 2];
    if (target) s.move(id, target);
    else if (direction > 0 && index === s.project.sequence.length - 2) s.move(s.project.sequence[index + 1], id);
  };

  return <main className="mw-assembly">
    <header className="mw-as-topbar">
      <a className="mw-as-brand" href="../" aria-label="MODELLWERK inicio"><img src={assetPath("/brand/mw-isotype-light.svg")} width={31} height={23} alt="" /><strong>MODELLWERK</strong></a>
      <span className="mw-as-topdivider" /><span className="mw-as-product">ASSEMBLY PLANNER <small>PREVIEW 01</small></span>
      <div className="mw-as-topright"><span className="mw-as-local"><i /> Local / client-side</span><Tool icon={CircleHelp} title="Guía de uso" onClick={() => setDialog("help")} /><button className="mw-as-button" onClick={exportProject}><Download size={14} />Exportar</button><button className="mw-as-button yellow" onClick={save}><Save size={14} />Guardar</button></div>
    </header>

    <section className="mw-as-projectbar">
      <button className="mw-as-projecttitle" onClick={() => setDialog("project")}><span className="mw-as-eyebrow">PROYECTO / {s.project.id}</span><span>{s.project.name}<ChevronDown size={16} /></span></button>
      <div className="mw-as-projectmeta"><span>SISTEMA<strong>{s.project.system}</strong></span><span>CONFIGURACIÓN<strong>{s.project.modules.length} módulos · {new Set(s.project.modules.map((m) => m.level)).size} niveles</strong></span></div>
      <button className="mw-as-scenario" onClick={() => setDialog("scenarios")}><GitBranch size={15} /><span><small>ESCENARIO ACTIVO</small>{scenarioName}</span><ChevronDown size={14} /></button>
      <button className="mw-as-button mw-as-autoplan" onClick={s.plan}><Zap size={15} />Auto plan <span>β</span></button>
    </section>

    <nav className="mw-as-modes" aria-label="Modos del planificador">{MODES.map(({ id, name, icon: Icon }) => <button key={id} className={s.mode === id ? "active" : ""} onClick={() => s.setMode(id)} aria-pressed={s.mode === id}><Icon size={15} />{name}</button>)}<span className="mw-as-modetail">PLANIFICACIÓN DE MONTAJE <i>4D</i></span></nav>

    <div className="mw-as-workspace">
      <aside className="mw-as-left">
        <div className="mw-as-paneltabs"><button className={leftTab === "modules" ? "active" : ""} onClick={() => setLeftTab("modules")}>Secuencia <span>{s.project.modules.length}</span></button><button className={leftTab === "resources" ? "active" : ""} onClick={() => setLeftTab("resources")}>Recursos</button></div>
        {leftTab === "modules" ? <>
          <div className="mw-as-search"><Search size={14} /><input aria-label="Buscar módulo" placeholder="Buscar módulo…" value={query} onChange={(e) => setQuery(e.target.value)} /><kbd>⌕</kbd></div>
          <div className="mw-as-listfilter"><span>{s.mode === "LOGISTICS" ? "ORDEN DE ENTREGA" : "ORDEN DE MONTAJE"}</span><select aria-label="Filtrar nivel" value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">Todos los niveles</option>{[...new Set(s.project.modules.map((m) => m.level))].sort().map((l) => <option key={l} value={l}>{l === 0 ? "Planta baja" : `Nivel ${l}`}</option>)}</select></div>
          <div className="mw-as-modulelist" ref={moduleList}>{modules.map((m) => {
            const t = schedule.items.find((item) => item.moduleId === m.id);
            const state = t ? getModuleState(t, s.time) : "NOT READY";
            const done = INSTALLED.includes(state);
            const isActive = ["LIFTING", "POSITIONING", "FIXING"].includes(state);
            return <div className={`mw-as-modulerow ${s.selectedId === m.id ? "selected" : ""} ${draggedId === m.id ? "dragging" : ""}`} key={m.id} draggable onDragStart={(e) => { setDraggedId(m.id); e.dataTransfer.setData("text/plain", m.id); }} onDragEnd={() => setDraggedId(null)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id !== m.id) s.move(id, m.id); setDraggedId(null); }}>
              <GripVertical className="mw-as-grip" size={13} /><button className="mw-as-modulemain" onClick={() => s.select(m.id)} aria-label={`Seleccionar ${m.id}`}><span className={`mw-as-seq ${done ? "done" : isActive ? "lifting" : ""}`}>{done ? <Check size={13} /> : String(s.project.sequence.indexOf(m.id) + 1).padStart(2, "0")}</span><span><strong>{m.id}<small>{m.level === 0 ? "PB" : `N${m.level}`}</small></strong><small>{s.mode === "LOGISTICS" ? `${m.truckId} · ${t ? formatTime(t.arrival) : "—"}` : `${m.type} · ${m.weight.toFixed(1)} t`}</small></span><i className={`mw-as-dot ${done ? "done" : isActive ? "lifting" : ""}`} /></button>
            </div>;
          })}{modules.length === 0 && <p className="mw-as-empty">Sin módulos para este filtro.</p>}</div>
          <div className="mw-as-leftfoot"><Move size={12} /><span>Arrastrá para cambiar el orden</span></div>
        </> : <div className="mw-as-resource-list"><h4><Crosshair size={14} /> GRÚAS · {s.project.cranes.length}</h4>{s.project.cranes.map((c) => <button key={c.id} onClick={() => s.setMode("CRANE")}><strong>{c.id} / {c.name}</strong><small>Radio {c.radius} m · límite {c.capacity} t</small></button>)}<h4><HardHat size={14} /> CUADRILLAS · {s.project.crews.length}</h4>{s.project.crews.map((c) => { const busy = schedule.items.find((t) => s.time >= t.start && s.time < t.end && s.project.modules.find((m) => m.id === t.moduleId)?.crewId === c.id); return <div key={c.id}><strong>{c.name}</strong><small>{busy ? `En tarea · ${busy.moduleId}` : "Disponible"}</small></div>; })}<h4><Truck size={14} /> CAMIONES · {s.project.trucks.length}</h4>{s.project.trucks.map((t) => <div key={t.id}><strong>{t.id}</strong><small>{t.moduleIds.join(" → ")} · viajes sucesivos</small></div>)}</div>}
        <div className="mw-as-progress"><div><span>PROGRESO DE MONTAJE</span><strong>{progress}%</strong></div><div className="mw-as-progress-track"><i style={{ width: `${progress}%` }} /></div><small>{installed} instalados / {s.project.modules.length - installed} pendientes</small></div>
      </aside>

      <section className="mw-as-center" aria-label="Visor de montaje">
        <div className="mw-as-viewportbar"><div><span className="mw-as-viewdot" />{s.mode === "DEPENDENCIES" ? "GRAFO DE DEPENDENCIAS" : s.view === "top" ? "IMPLANTACIÓN / PLANTA" : s.view === "front" ? "ELEVACIÓN / FRENTE" : "MODELO / PERSPECTIVA"}<small>01</small></div><div><Tool icon={Layers3} title="Mostrar estructura" active={s.structure} onClick={() => s.toggle("structure")} /><Tool icon={Box} title="Envolvente transparente" active={s.transparent} onClick={() => s.toggle("transparent")} /><Tool icon={Eye} title="Mostrar identificadores" active={s.showLabels} onClick={() => s.toggle("showLabels")} /></div></div>
        <div className="mw-as-stage">
          {s.mode === "DEPENDENCIES" ? <DependencyGraph project={s.project} schedule={schedule} time={s.time} selectedId={s.selectedId} onSelect={s.select} /> : <SceneBoundary><LiveScene key={viewReset} project={s.project} schedule={schedule} time={s.time} selectedId={s.selectedId} onSelect={s.select} view={s.view} mode={s.mode} structure={s.structure} transparent={s.transparent} showLabels={s.showLabels} hiddenIds={s.hiddenIds} isolatedId={s.isolatedId} onCraneMove={s.moveCrane} /></SceneBoundary>}
          {s.mode !== "DEPENDENCIES" && <>
            <div className="mw-as-kpis"><div><small>MÓDULOS</small><strong>{installed}<em> / {s.project.modules.length}</em></strong></div><div><small>GRÚA ACTIVA</small><strong>{activeCrane?.id ?? "—"}<em> / {activeCrane?.radius ?? 0} m</em></strong></div><div><small>DURACIÓN EST.</small><strong>{(schedule.duration / 480).toFixed(1)}<em> jornadas</em></strong></div></div>
            <div className="mw-as-viewcontrols">{([['iso', 'ISO'], ['top', 'TOP'], ['front', 'FRONT']] as const).map(([view, label]) => <button key={view} onClick={() => s.setView(view)} className={s.view === view ? "active" : ""}>{label}</button>)}<Tool icon={RotateCcw} title="Restablecer vista y visibilidad" onClick={() => { s.setView("iso"); s.showAll(); setViewReset((v) => v + 1); }} /></div>
            <div className="mw-as-scenenote"><span><MousePointer2 size={12} />{s.mode === "PLAN" || s.mode === "LOGISTICS" ? "Arrastrá la grúa para reubicarla" : "Arrastrar: orbitar · Rueda: zoom"}</span><span>UNIDADES / m</span></div>
            <div className="mw-as-legend"><span><i className="installed" />Instalado</span><span><i className="active" />En operación</span><span><i className="pending" />Planificado</span></div>
            {(s.hiddenIds.length > 0 || s.isolatedId) && <button className="mw-as-restore" onClick={s.showAll}><Eye size={13} />Mostrar todos</button>}
          </>}
        </div>
        <div className="mw-as-operation"><span className={`mw-as-operation-light ${active ? "active" : ""}`} /><div><small>{active ? "OPERACIÓN EN CURSO" : "SIGUIENTE OPERACIÓN"}</small><strong>{active ? `${active.moduleId} / ${STATE_NAMES[getModuleState(active, s.time)]}` : upcoming ? `${upcoming.moduleId} / Izaje ${formatTime(upcoming.liftStart)}` : schedule.items.length < s.project.modules.length ? "Plan incompleto / revisar alertas" : "Montaje completado"}</strong></div><button onClick={() => { const item = active ?? upcoming; if (item) { s.select(item.moduleId); s.setTime(item.liftStart); } }} disabled={!active && !upcoming}>Ver operación<ArrowUpRight size={14} /></button></div>
      </section>

      <aside className="mw-as-right">
        <div className="mw-as-inspectorhead"><span>{s.mode === "CRANE" ? "PLANIFICACIÓN DE GRÚA" : "PROPIEDADES DEL MÓDULO"}</span><Settings2 size={14} /></div>
        <div className="mw-as-inspectorscroll">
          {s.mode === "CRANE" && crane ? <>
            <div className="mw-as-objecttitle"><span>RECURSO / {crane.id}</span><h2>{crane.name}</h2><small>Parámetros de planificación preliminar</small></div>
            <div className="mw-as-propertysection"><h4>IMPLANTACIÓN</h4><Numeric label="Posición X" value={crane.position[0]} unit="m" min={-1000} onChange={(n) => s.moveCrane([n, crane.position[1], crane.position[2]])} /><Numeric label="Posición Z" value={crane.position[2]} unit="m" min={-1000} onChange={(n) => s.moveCrane([crane.position[0], crane.position[1], n])} /><Numeric label="Radio operativo" value={crane.radius} unit="m" onChange={(n) => s.setCrane("radius", n)} /><Numeric label="Capacidad configurada" value={crane.capacity} unit="t" onChange={(n) => s.setCrane("capacity", n)} /><Numeric label="Altura de gancho" value={crane.height} unit="m" onChange={(n) => s.setCrane("height", n)} /></div>
            <div className="mw-as-notebox"><TriangleAlert size={16} /><p>Límite de peso constante. No representa una tabla de cargas ni verifica estabilidad, aparejos, viento o suelo.</p></div>
            <button className="mw-as-button full" onClick={() => s.setMode("PLAN")}><Move size={14} />Reubicar en planta</button>
          </> : selected ? <>
            <div className="mw-as-objecttitle"><span>MÓDULO VOLUMÉTRICO</span><div><h2>{selected.id}</h2><span className={`mw-as-status ${INSTALLED.includes(status) ? "done" : ""}`}>{STATE_NAMES[status]}</span></div><p>{selected.name}</p><small>{selected.type}</small></div>
            <div className="mw-as-objecttools"><button onClick={() => s.hide(selected.id)}>{s.hiddenIds.includes(selected.id) ? <Eye size={14} /> : <EyeOff size={14} />}{s.hiddenIds.includes(selected.id) ? "Mostrar" : "Ocultar"}</button><button className={s.isolatedId === selected.id ? "active" : ""} onClick={() => s.isolate(selected.id)}><Focus size={14} />Aislar</button><Tool icon={ArrowUp} title="Adelantar módulo" disabled={s.project.sequence[0] === selected.id} onClick={() => reorder(selected.id, -1)} /><Tool icon={ArrowDown} title="Retrasar módulo" disabled={s.project.sequence.at(-1) === selected.id} onClick={() => reorder(selected.id, 1)} /></div>
            <div className="mw-as-propertysection"><h4>IDENTIDAD <Box size={12} /></h4><dl><div><dt>Sistema</dt><dd>{s.project.system}</dd></div><div><dt>Dimensiones</dt><dd>{selected.dimensions[0]} × {selected.dimensions[2]} × {selected.dimensions[1]} m</dd></div><div><dt>Nivel</dt><dd>{selected.level === 0 ? "00 / Planta baja" : `${String(selected.level).padStart(2, '0')} / Planta alta`}</dd></div><div><dt>Secuencia</dt><dd>{String(s.project.sequence.indexOf(selected.id) + 1).padStart(2, "0")} / {s.project.modules.length}</dd></div></dl><Numeric label="Peso del módulo" value={selected.weight} unit="t" onChange={(n) => s.setModule(selected.id, "weight", n)} /></div>
            <div className="mw-as-propertysection"><h4>OPERACIÓN DE MONTAJE <Crosshair size={12} /></h4><dl><div><dt>Grúa</dt><dd>{selectedTask?.craneId ?? crane?.id ?? "—"}</dd></div><div><dt>Radio de colocación</dt><dd className={selectedCrane && radius > selectedCrane.radius ? "error" : "accent"}>{radius.toFixed(1)} m</dd></div><div><dt>Camión</dt><dd>{selected.truckId}</dd></div><div><dt>Cuadrilla</dt><dd>{s.project.crews.find((c) => c.id === selected.crewId)?.name ?? selected.crewId}</dd></div></dl><Numeric label="Duración de izaje" value={selected.liftMinutes} unit="min" onChange={(n) => s.setModule(selected.id, "liftMinutes", n)} /><Numeric label="Fijación estructural" value={selected.fixMinutes} unit="min" onChange={(n) => s.setModule(selected.id, "fixMinutes", n)} /></div>
            <div className="mw-as-propertysection"><h4>PREDECESORES <GitBranch size={12} /></h4><div className="mw-as-dependencychips">{selected.dependencies.length ? selected.dependencies.map((id) => <button key={id} onClick={() => s.select(id)}><Box size={12} />{id}<ChevronRight size={12} /></button>) : <span>Apoyos de fundación disponibles</span>}</div></div>
            {selectedTask && <div className="mw-as-propertysection"><h4>HITOS DE LA OPERACIÓN <Timer size={12} /></h4><ol className="mw-as-tasklist">{[["Camión en obra", selectedTask.arrival], ["Enganche e izaje", selectedTask.liftStart], ["Posicionamiento", selectedTask.positionStart], ["Fijación", selectedTask.fixStart], ["Liberación de grúa", selectedTask.release], ["Inspección y cierre", selectedTask.end]].map(([name, time]) => <li key={name}><button onClick={() => s.setTime(Number(time))}><i className={s.time >= Number(time) ? "done" : ""} /><span>{name}</span><time>{formatTime(Number(time))}</time></button></li>)}</ol></div>}
          </> : <div className="mw-as-empty"><MousePointer2 /><p>Seleccioná un módulo en el modelo o en la secuencia.</p></div>}
        </div>
        <button className={`mw-as-conflictbutton ${conflicts.length ? "warning" : ""}`} onClick={() => setDialog("conflicts")}>{conflicts.length ? <TriangleAlert size={16} /> : <ShieldCheck size={16} />}<span>{conflicts.length ? `${conflicts.length} alertas de planificación` : "Sin conflictos detectados"}<small>Revisión preliminar del escenario</small></span><ChevronRight size={14} /></button>
      </aside>
    </div>

    <section className={`mw-as-timeline ${s.mode === "TIMELINE" ? "expanded" : ""}`}>
      <div className="mw-as-timelinehead"><div className="mw-as-timetitle"><Timer size={16} /><strong>Secuencia de montaje</strong><span>{s.project.modules.length} operaciones</span></div><div className="mw-as-playback"><Tool icon={SkipBack} title="Reiniciar simulación" onClick={() => s.setTime(0)} /><Tool icon={StepBack} title="Hito anterior" onClick={() => jump(-1)} /><button className="mw-as-play" aria-label={s.playing ? "Pausar simulación" : "Reproducir simulación"} onClick={s.togglePlay}>{s.playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><Tool icon={StepForward} title="Siguiente hito" onClick={() => jump(1)} /><Tool icon={SkipForward} title="Ir al final" onClick={() => s.setTime(schedule.duration)} /><select aria-label="Velocidad de simulación" value={s.speed} onChange={(e) => s.setSpeed(Number(e.target.value))}>{[1, 10, 30, 60, 120, 600].map((v) => <option key={v} value={v}>{v}×</option>)}</select><time>{formatTime(s.time)}</time></div><div className="mw-as-timelineend"><span>{(schedule.craneMinutes / 60).toFixed(1)} h grúa</span><Tool icon={Maximize2} title="Expandir cronograma" active={s.mode === "TIMELINE"} onClick={() => s.setMode(s.mode === "TIMELINE" ? "ASSEMBLY" : "TIMELINE")} /></div></div>
      <AssemblyTimeline project={s.project} schedule={schedule} time={s.time} selectedId={s.selectedId} onSelect={s.select} onSeek={s.setTime} expanded={s.mode === "TIMELINE"} />
    </section>
    <footer className="mw-as-footer"><span><i />MOTOR DE PLANIFICACIÓN / LOCAL</span><span>Estimación preliminar · No apto para certificar izajes</span><span>MW ASSEMBLY <strong>0.1</strong></span></footer>

    {s.notice && <div className="mw-as-toast" role="status"><span>{s.notice}</span><button aria-label="Cerrar aviso" onClick={() => s.notify("")}><X size={14} /></button></div>}
    <input className="mw-as-file" ref={fileInput} type="file" accept="application/json,.json" aria-label="Importar proyecto JSON" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 2_000_000) { s.notify("El archivo supera el límite de 2 MB."); return; } try { importValue(JSON.parse(await file.text())); } catch { s.notify("No se pudo abrir: se necesita un archivo JSON válido."); } e.target.value = ""; }} />

    {dialog && <div className="mw-as-modalshade" onClick={() => setDialog(null)}><section ref={modalPanel} className="mw-as-modal" role="dialog" aria-modal="true" aria-label={dialog === "help" ? "Guía de uso" : dialog === "project" ? "Proyecto" : dialog === "conflicts" ? "Alertas de planificación" : "Escenarios"} onClick={(e) => e.stopPropagation()}><header><span className="mw-as-eyebrow">MW / ASSEMBLY PLANNER</span><Tool icon={X} title="Cerrar panel" onClick={() => setDialog(null)} /></header>
      {dialog === "project" && <><h2>Tu proyecto de montaje.</h2><p>Geometría, módulos, recursos y secuencia en un archivo portable.</p><div className="mw-as-dialogactions"><button onClick={() => fileInput.current?.click()}><Upload /><strong>Importar proyecto JSON</strong><small>Validación de datos y dependencias incluida</small></button><button onClick={restore}><Save /><strong>Abrir último guardado</strong><small>Almacenado en este navegador</small></button><button onClick={() => { s.load(createDemoProject()); setScenarioName("Base · 01"); setDialog(null); }}><Boxes /><strong>Campamento modular / demo</strong><small>24 módulos · 1 grúa · 12 camiones · 2 cuadrillas</small></button></div></>}
      {dialog === "help" && <><h2>Del modelo al montaje.</h2><p>Esta primera versión conecta una secuencia constructiva con su implantación y su cronograma.</p><ol className="mw-as-guide"><li>Seleccioná un módulo para consultar sus recursos y editar peso y tiempos.</li><li>Mové el cursor de tiempo o usá <kbd>Espacio</kbd> para reproducir la obra. Las velocidades expresan tiempo real: 60× avanza un minuto de obra por segundo.</li><li>Reordená módulos arrastrando la lista o usando las flechas del inspector. Se verifican los predecesores.</li><li>En Planta, arrastrá la grúa. En Grúa, ajustá radio, altura y capacidad para revisar alertas.</li><li>Guardá en el navegador o exportá JSON. Los escenarios se conservan durante esta sesión; exportá cada alternativa para archivarla.</li></ol><div className="mw-as-notebox"><CircleHelp size={17} /><p>Tiempo expresado en jornadas de 8 horas desde las 08:00. Los 12 camiones hacen dos viajes sucesivos. Los tiempos y pesos son datos ficticios de demostración.</p></div></>}
      {dialog === "conflicts" && <><h2>Revisión del escenario.</h2><p>{conflicts.length ? `${conflicts.length} condiciones requieren revisión.` : "No se detectaron conflictos con las reglas implementadas."}</p><div className="mw-as-conflicts">{conflicts.map((c) => <button key={c.id} onClick={() => { if (c.moduleId) s.select(c.moduleId); setDialog(null); }}><TriangleAlert size={17} /><span><strong>{c.severity === "error" ? "CONFLICTO" : "REVISAR"}{c.moduleId ? ` / ${c.moduleId}` : ""}</strong>{c.message}</span><ChevronRight size={14} /></button>)}</div><div className="mw-as-notebox"><ShieldCheck size={17} /><p>Verifica secuencia, recursos, radio, límite de peso y restricciones aproximadas. No certifica estabilidad estructural ni maniobras de izaje.</p></div></>}
      {dialog === "scenarios" && <><h2>Explorá otras secuencias.</h2><p>Guardá una copia, modificá el montaje y compará sus resultados. Copias disponibles durante esta sesión.</p><button className="mw-as-button yellow" onClick={() => { const name = `Alternativa ${snapshots.length + 1}`; setSnapshots([...snapshots, { name, project: structuredClone(s.project) }]); setScenarioName(name); }}><Plus size={14} />Guardar escenario actual</button><div className="mw-as-scenario-table"><div><strong>Escenario</strong><span>Duración</span><span>Grúa</span><span>Alertas</span></div>{[{ name: "Actual", project: s.project }, ...snapshots].map((item, i) => { const plan = buildSchedule(item.project); return <button key={`${item.name}-${i}`} disabled={i === 0} onClick={() => { s.load(structuredClone(item.project)); setScenarioName(item.name); setDialog(null); }}><strong>{item.name}</strong><span>{(plan.duration / 480).toFixed(2)} j</span><span>{(plan.craneMinutes / 60).toFixed(1)} h</span><span>{analyzePlan(item.project, plan).length}</span></button>; })}</div></>}
    </section></div>}
  </main>;
}
