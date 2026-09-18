"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createProject } from "../../core/building/engine";
import { parseProject, serializeProject, STORAGE_KEY } from "../../core/building/persistence";
import type { Project } from "../../core/building/types";
import {
  exportProjectDocument,
  importProjectDocument,
  isDesktopApp,
  lastStoredProjectId,
  listStoredProjects,
  loadStoredProject,
  saveStoredProject,
  type StoredProject,
} from "./projectStorage";

export function useProject() {
  const [project, setProject] = useState(createProject);
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [desktop, setDesktop] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Cargando proyecto");
  const [error, setError] = useState("");
  const past = useRef<Project[]>([]),
    future = useRef<Project[]>([]),
    current = useRef(project),
    currentId = useRef("");
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });

  const refreshProjects = useCallback(async () => {
    if (!isDesktopApp()) return;
    setProjects(await listStoredProjects());
  }, []);

  const activate = useCallback((next: Project, id: string) => {
    current.current = next;
    currentId.current = id;
    past.current = [];
    future.current = [];
    setProject(next);
    setProjectId(id);
    setHistory({ canUndo: false, canRedo: false });
    setError("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (isDesktopApp()) {
          setDesktop(true);
          const stored = await listStoredProjects();
          const requestedId = await lastStoredProjectId();
          const id = stored.some((item) => item.id === requestedId)
            ? requestedId!
            : stored[0]?.id;
          if (id) {
            const loaded = await loadStoredProject(id);
            if (cancelled) return;
            activate(loaded, id);
          } else {
            const initial = createProject();
            const newId = crypto.randomUUID();
            await saveStoredProject(newId, initial);
            if (cancelled) return;
            activate(initial, newId);
          }
          if (!cancelled) {
            await refreshProjects();
            setStatus("Proyecto local disponible");
          }
        } else {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const loaded = parseProject(saved);
            current.current = loaded;
            setProject(loaded);
          }
          if (!cancelled) setStatus("Guardado en este navegador");
        }
        if (!cancelled) setReady(true);
      } catch (e) {
        if (cancelled) return;
        setError(
          `No se pudo restaurar el guardado. ${e instanceof Error ? e.message : ""} Importá una copia para continuar.`,
        );
        setStatus("Guardado automático detenido");
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activate, refreshProjects]);

  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          if (desktop && currentId.current) {
            await saveStoredProject(currentId.current, project);
            await refreshProjects();
            setStatus("Guardado local · SQLite");
          } else {
            localStorage.setItem(STORAGE_KEY, serializeProject(project));
            setStatus("Guardado en este navegador");
          }
        } catch {
          setStatus("No se pudo guardar · exportá una copia");
        }
      })();
    }, 500);
    return () => clearTimeout(timeout);
  }, [desktop, project, ready, refreshProjects]);

  const apply = useCallback((change: (p: Project) => Project) => {
    try {
      const next = change(current.current);
      past.current = [...past.current.slice(-49), current.current];
      future.current = [];
      current.current = next;
      setProject(next);
      setError("");
      setHistory({ canUndo: true, canRedo: false });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar el cambio.");
      return false;
    }
  }, []);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(current.current);
    current.current = previous;
    setProject(previous);
    setError("");
    setHistory({ canUndo: past.current.length > 0, canRedo: true });
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    current.current = next;
    setProject(next);
    setError("");
    setHistory({ canUndo: true, canRedo: future.current.length > 0 });
  }, []);

  const save = useCallback(async () => {
    try {
      if (desktop && currentId.current) {
        await saveStoredProject(currentId.current, current.current);
        await refreshProjects();
        setStatus("Guardado local · SQLite");
      } else {
        localStorage.setItem(STORAGE_KEY, serializeProject(current.current));
        setStatus("Guardado en este navegador");
      }
      setError("");
    } catch {
      setError("No se pudo guardar; exportá una copia del proyecto.");
    }
  }, [desktop, refreshProjects]);

  const newProject = useCallback(async () => {
    try {
      if (desktop && currentId.current) await saveStoredProject(currentId.current, current.current);
      const next = createProject();
      const id = crypto.randomUUID();
      activate(next, id);
      if (desktop) {
        await saveStoredProject(id, next);
        await refreshProjects();
      }
      setStatus(desktop ? "Proyecto local creado" : "Proyecto nuevo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el proyecto.");
    }
  }, [activate, desktop, refreshProjects]);

  const openProject = useCallback(
    async (id: string) => {
      if (!desktop || id === currentId.current) return;
      try {
        if (currentId.current) await saveStoredProject(currentId.current, current.current);
        const next = await loadStoredProject(id);
        activate(next, id);
        await saveStoredProject(id, next);
        await refreshProjects();
        setStatus("Proyecto local abierto");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo abrir el proyecto.");
      }
    },
    [activate, desktop, refreshProjects],
  );

  const importProject = useCallback(
    async (next: Project) => {
      if (desktop) {
        const id = crypto.randomUUID();
        await saveStoredProject(id, next);
        activate(next, id);
        await refreshProjects();
        setStatus("Proyecto importado a la biblioteca local");
      } else {
        apply(() => next);
      }
    },
    [activate, apply, desktop, refreshProjects],
  );

  const importDesktop = useCallback(async () => {
    try {
      const next = await importProjectDocument();
      if (next) await importProject(next);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar el proyecto.");
      return null;
    }
  }, [importProject]);

  const exportDesktop = useCallback(async () => {
    try {
      const exported = await exportProjectDocument(current.current);
      if (exported) setStatus("Copia .mwproject exportada");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar el proyecto.");
    }
  }, []);

  return {
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
    ...history,
  };
}
