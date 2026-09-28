"use client";

import { useId, useMemo } from "react";
import type { Project, Schedule } from "@/core/assembly/types";
import "./timeline.css";

type DependencyGraphProps = {
  project: Project;
  schedule: Schedule;
  time: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function DependencyGraph({ project, schedule, time, selectedId, onSelect }: DependencyGraphProps) {
  const arrowId = useId().replace(/:/g, "");
  const layout = useMemo(() => {
    const levels = [...new Set(project.modules.map(module => module.level))].sort((a, b) => Number(b) - Number(a));
    const maxCount = Math.max(1, ...levels.map(level => project.modules.filter(module => module.level === level).length));
    const width = Math.max(720, 100 + maxCount * 94);
    const positions = new Map<string, { x: number; y: number }>();
    levels.forEach((level, row) => {
      const modules = project.modules.filter(module => module.level === level);
      modules.forEach((module, column) => positions.set(module.id, { x: 96 + column * 94, y: 42 + row * 104 }));
    });
    return { levels, width, height: Math.max(148, levels.length * 104 + 8), positions };
  }, [project.modules]);
  const itemById = useMemo(() => new Map(schedule.items.map(item => [item.moduleId, item])), [schedule.items]);
  const edges = project.modules.flatMap(module => module.dependencies.map(dependency => ({ source: dependency, target: module.id })));
  const selectedModule = project.modules.find(module => module.id === selectedId);
  const relatedIds = new Set(selectedId ? [selectedId, ...(selectedModule?.dependencies ?? []), ...project.modules.filter(module => module.dependencies.includes(selectedId)).map(module => module.id)] : []);

  return (
    <section className="mw-dg-root" aria-label="Grafo de dependencias estructurales">
      <div className="mw-dg-toolbar">
        <p>Los apoyos deben estar fijados antes de izar el módulo superior.</p>
        <span>{edges.length} VÍNCULOS <b>·</b> {layout.levels.length} NIVELES</span>
      </div>
      <div className="mw-dg-scroll">
        <div className="mw-dg-canvas" style={{ width: layout.width, height: layout.height }}>
          <svg className="mw-dg-edges" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              <marker id={`${arrowId}-normal`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="#657471" /></marker>
              <marker id={`${arrowId}-selected`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="#e8bb45" /></marker>
            </defs>
            {layout.levels.map((level, row) => <line key={String(level)} x1="65" x2={layout.width - 20} y1={64 + row * 104} y2={64 + row * 104} stroke="#2b3232" strokeDasharray="3 5" />)}
            {edges.map(edge => {
              const from = layout.positions.get(edge.source);
              const to = layout.positions.get(edge.target);
              if (!from || !to) return null;
              const selected = selectedId === edge.source || selectedId === edge.target;
              const sameLevel = from.y === to.y;
              const bottomToTop = from.y > to.y;
              const x1 = sameLevel ? from.x + (from.x < to.x ? 40 : -40) : from.x;
              const x2 = sameLevel ? to.x + (from.x < to.x ? -44 : 44) : to.x;
              const y1 = from.y + (sameLevel ? 0 : bottomToTop ? -22 : 22);
              const y2 = to.y + (sameLevel ? 0 : bottomToTop ? 26 : -26);
              const curve = sameLevel ? `M ${x1} ${y1} C ${x1} ${y1 - 54}, ${x2} ${y2 - 54}, ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
              return <path key={`${edge.source}-${edge.target}`} d={curve} fill="none" stroke={selected ? "#e8bb45" : "#657471"} strokeWidth={selected ? 1.8 : 1.1} opacity={selectedId && !selected ? 0.3 : 0.85} markerEnd={`url(#${arrowId}-${selected ? "selected" : "normal"})`} />;
            })}
          </svg>
          {layout.levels.map((level, index) => <div className="mw-dg-level" key={String(level)} style={{ top: 28 + index * 104 }}><strong>{Number(level) === 0 ? "PB" : `N${level}`}</strong><span>{(Number(level) * 2.8).toFixed(2)} m</span></div>)}
          {project.modules.map(module => {
            const position = layout.positions.get(module.id);
            if (!position) return null;
            const item = itemById.get(module.id);
            const state = item && time >= item.release ? "done" : item && time >= item.liftStart && time < item.release ? "active" : "pending";
            const selected = selectedId === module.id;
            return <button
              type="button"
              key={module.id}
              className={`mw-dg-node mw-dg-node-${state}${selected ? " mw-dg-node-selected" : ""}${selectedId && !relatedIds.has(module.id) ? " mw-dg-node-muted" : ""}`}
              style={{ left: position.x - 40, top: position.y - 22 }}
              onClick={() => onSelect(module.id)}
              aria-pressed={selected}
              aria-label={`${module.id}, nivel ${module.level}, ${module.dependencies.length ? `depende de ${module.dependencies.join(", ")}` : "apoyo sobre cimentación"}`}
              title={`${module.name}${module.dependencies.length ? ` · Apoyos: ${module.dependencies.join(", ")}` : " · Sobre cimentación"}`}
            ><span><i />{module.id}</span><small>{state === "done" ? "FIJADO" : state === "active" ? "EN MONTAJE" : module.dependencies.length ? `${module.dependencies.length} APOYO${module.dependencies.length > 1 ? "S" : ""}` : "BASE"}</small></button>;
          })}
        </div>
      </div>
      <div className="mw-dg-footer"><span><i className="mw-dg-key-done" />Fijado</span><span><i className="mw-dg-key-active" />En montaje</span><span><i className="mw-dg-key-pending" />Pendiente</span><small>Seleccioná un módulo para ver sus relaciones</small></div>
    </section>
  );
}
