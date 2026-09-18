"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { StationId } from "./sceneTypes";

type FrameWindow = {
  stationId: StationId;
  startedAt: number;
  frames: number;
  frameTimeTotal: number;
  maxFrameTime: number;
  framesOver50Ms: number;
  longTasks: Array<{ duration: number; startTime: number }>;
};

const SAMPLE_WINDOW_MS = 3200;

function isTelemetryEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("perf") === "1";
}

export function markStationTransitionStart(stationId: StationId) {
  if (!isTelemetryEnabled()) return;
  performance.mark(`mw:station:${stationId}:start`);
}

export function FactoryPerformanceTelemetry({ activeStationId }: { activeStationId: StationId }) {
  const gl = useThree((state) => state.gl);
  const enabledRef = useRef(isTelemetryEnabled());
  const sampleRef = useRef<FrameWindow | null>(null);
  const firstFrameRef = useRef(false);

  useFrame((_, delta) => {
    if (!enabledRef.current) return;

    if (!firstFrameRef.current) {
      firstFrameRef.current = true;
      console.info("[MW perf] first-frame", JSON.stringify({
        atMs: Number(performance.now().toFixed(1)),
        renderer: {
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length ?? 0,
        },
      }));
    }

    const sample = sampleRef.current;
    if (!sample) return;
    const frameTime = delta * 1000;
    sample.frames += 1;
    sample.frameTimeTotal += frameTime;
    sample.maxFrameTime = Math.max(sample.maxFrameTime, frameTime);
    if (frameTime > 50) sample.framesOver50Ms += 1;
  });

  useEffect(() => {
    if (!enabledRef.current || typeof PerformanceObserver === "undefined") return;

    const observer = new PerformanceObserver((list) => {
      const sample = sampleRef.current;
      if (!sample) return;
      list.getEntries().forEach((entry) => {
        sample.longTasks.push({
          duration: Number(entry.duration.toFixed(1)),
          startTime: Number(entry.startTime.toFixed(1)),
        });
      });
    });

    try {
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      return;
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!enabledRef.current) return;

    const startedAt = performance.now();
    const startMark = `mw:station:${activeStationId}:start`;
    const startEntry = performance.getEntriesByName(startMark, "mark").at(-1);
    const sample: FrameWindow = {
      stationId: activeStationId,
      startedAt,
      frames: 0,
      frameTimeTotal: 0,
      maxFrameTime: 0,
      framesOver50Ms: 0,
      longTasks: [],
    };
    sampleRef.current = sample;

    const timer = window.setTimeout(() => {
      if (sampleRef.current !== sample) return;
      sampleRef.current = null;
      const averageFrameTime = sample.frames > 0 ? sample.frameTimeTotal / sample.frames : 0;

      console.info("[MW perf] station-transition", JSON.stringify({
        stationId: activeStationId,
        clickToReactCommitMs: startEntry
          ? Number((startedAt - startEntry.startTime).toFixed(1))
          : null,
        sampleDurationMs: SAMPLE_WINDOW_MS,
        frames: sample.frames,
        averageFps: averageFrameTime > 0 ? Number((1000 / averageFrameTime).toFixed(1)) : 0,
        maxFrameTimeMs: Number(sample.maxFrameTime.toFixed(1)),
        framesOver50Ms: sample.framesOver50Ms,
        longTasks: sample.longTasks,
        renderer: {
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length ?? 0,
        },
      }));
    }, SAMPLE_WINDOW_MS);

    return () => window.clearTimeout(timer);
  }, [activeStationId, gl]);

  return null;
}
