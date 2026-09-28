"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { Project, Schedule, ScheduledModule } from "@/core/assembly/types";
import { formatTime } from "@/core/assembly/engine";
import "./timeline.css";

type AssemblyTimelineProps = {
  project: Project;
  schedule: Schedule;
  time: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeek: (time: number) => void;
  expanded: boolean;
};

const phases = [
  { name: "Preparación", className: "arrival", from: "arrival", to: "liftStart" },
  { name: "Izaje", className: "lift", from: "liftStart", to: "positionStart" },
  { name: "Posicionado", className: "position", from: "positionStart", to: "fixStart" },
  { name: "Fijación", className: "fix", from: "fixStart", to: "release" },
  { name: "Control", className: "check", from: "release", to: "end" },
] as const;

function tickLabel(minutes: number) {
  const day = Math.floor(minutes / 480) + 1;
  const inDay = minutes % 480;
  const hours = 8 + Math.floor(inDay / 60);
  const mins = Math.floor(inDay % 60);
  return `${day > 1 ? `D${day} · ` : ""}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function rowState(item: ScheduledModule, time: number) {
  if (time >= item.end) return "done";
  if (time >= item.liftStart && time < item.end) return "active";
  if (time >= item.arrival) return "waiting";
  return "pending";
}

export default function AssemblyTimeline({
  project, schedule, time, selectedId, onSelect, onSeek, expanded,
}: AssemblyTimelineProps) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const duration = Math.max(1, schedule.duration);
  const cursor = Math.min(100, Math.max(0, time / duration * 100));
  const moduleById = useMemo(() => new Map(project.modules.map(assemblyModule => [assemblyModule.id, assemblyModule])), [project.modules]);
  const tickStep = duration <= 120 ? 15 : duration <= 300 ? 30 : duration <= 720 ? 60 : duration <= 1440 ? 120 : Math.ceil(duration / 8 / 60) * 60;
  const ticks = Array.from({ length: Math.floor(duration / tickStep) + 1 }, (_, index) => index * tickStep);
  const complete = schedule.items.filter(item => time >= item.end).length;

  useEffect(() => {
    if (!selectedId || !rowsRef.current) return;
    const container = rowsRef.current;
    const row = Array.from(container.querySelectorAll<HTMLElement>("[data-module-id]")).find(element => element.dataset.moduleId === selectedId);
    if (!row) return;
    if (row.offsetTop < container.scrollTop || row.offsetTop + row.offsetHeight > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: Math.max(0, row.offsetTop - container.clientHeight / 2 + row.offsetHeight / 2), behavior: "smooth" });
    }
  }, [selectedId]);

  return (
    <section className={`mw-tl-root${expanded ? " mw-tl-expanded" : ""}`} aria-label="Cronograma de montaje">
      <div className="mw-tl-summary">
        <div className="mw-tl-legend" aria-label="Fases del montaje">
          {phases.map(phase => <span key={phase.className}><i className={`mw-tl-swatch mw-tl-${phase.className}`} />{phase.name}</span>)}
        </div>
        <span className="mw-tl-progress"><strong>{String(complete).padStart(2, "0")}</strong> / {String(project.modules.length).padStart(2, "0")} completos</span>
      </div>
      <div className="mw-tl-axis">
        <div className="mw-tl-label-heading">MÓDULO <span>NIVEL</span></div>
        <div className="mw-tl-axis-track">
          {ticks.map(tick => <span key={tick} className="mw-tl-tick" style={{ left: `${tick / duration * 100}%` }}>{tickLabel(tick)}</span>)}
          <span className="mw-tl-cursor-head" style={{ left: `${cursor}%` }} />
        </div>
      </div>
      <div className="mw-tl-rows" ref={rowsRef}>
        {schedule.items.map((item, index) => {
          const assemblyModule = moduleById.get(item.moduleId);
          if (!assemblyModule) return null;
          const state = rowState(item, time);
          return (
            <div className={`mw-tl-row mw-tl-row-${state}${selectedId === assemblyModule.id ? " mw-tl-row-selected" : ""}`} key={item.moduleId} data-module-id={assemblyModule.id}>
              <button type="button" className="mw-tl-label" onClick={() => onSelect(assemblyModule.id)} aria-pressed={selectedId === assemblyModule.id} title={`${assemblyModule.name} · ${assemblyModule.id}`}>
                <span className="mw-tl-row-number">{String(index + 1).padStart(2, "0")}</span>
                <i className={`mw-tl-state-dot mw-tl-dot-${state}`} />
                <span className="mw-tl-module-id">{assemblyModule.id}</span>
                <span className="mw-tl-level">{Number(assemblyModule.level) === 0 ? "PB" : `N${assemblyModule.level}`}</span>
              </button>
              <div className="mw-tl-track">
                {ticks.map(tick => <i className="mw-tl-gridline" key={tick} style={{ left: `${tick / duration * 100}%` }} />)}
                {phases.map(phase => {
                  const start = item[phase.from];
                  const end = item[phase.to];
                  if (end <= start) return null;
                  return <button
                    key={phase.className}
                    type="button"
                    className={`mw-tl-bar mw-tl-${phase.className}`}
                    style={{ left: `${start / duration * 100}%`, width: `${(end - start) / duration * 100}%` }}
                    title={`${assemblyModule.id} · ${phase.name} · ${formatTime(start)} – ${formatTime(end)} (${Math.round(end - start)} min)`}
                    aria-label={`${assemblyModule.id}: ${phase.name}, desde ${formatTime(start)}, ${Math.round(end - start)} minutos`}
                    onClick={() => { onSelect(assemblyModule.id); onSeek(start); }}
                  >{(end - start) / duration > 0.065 ? `${Math.round(end - start)}′` : ""}</button>;
                })}
                <span className="mw-tl-end-marker" style={{ left: `${item.end / duration * 100}%` }} title={`Completado: ${formatTime(item.end)}`} />
                <i className="mw-tl-playhead" style={{ left: `${cursor}%` }} />
              </div>
            </div>
          );
        })}
        {schedule.items.length === 0 && <div className="mw-tl-empty">No hay operaciones programadas. Añadí módulos y revisá sus dependencias.</div>}
      </div>
      <div className="mw-tl-scrubber">
        <div className="mw-tl-time"><span>TIEMPO</span><strong>{formatTime(time)}</strong></div>
        <input type="range" min={0} max={duration} step={1} value={Math.min(duration, time)} onChange={event => onSeek(Number(event.target.value))} aria-label="Tiempo de montaje" aria-valuetext={formatTime(time)} style={{ "--mw-tl-progress": `${cursor}%` } as CSSProperties} />
        <span className="mw-tl-duration">{formatTime(schedule.duration)}</span>
      </div>
    </section>
  );
}
