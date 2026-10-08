"use client";

import { useEffect, useLayoutEffect, useRef, type ElementRef } from "react";
import { CameraControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Box3, MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { CameraPresetId, CameraRequest, ViewerInsets } from "./types";

/**
 * Cámara del visor de productos. Mismo control que el Visor 1.0
 * (CameraControls de drei, transiciones suaves) con presets calculados
 * a partir del bounding box del modelo: perspectiva, frente, lateral,
 * planta, interior y "encuadrar modelo".
 */

type Pose = { position: Vector3; target: Vector3; minPolar: number; maxPolar: number };

export function computePose(preset: Exclude<CameraPresetId, "fit">, box: Box3, camera: PerspectiveCamera, viewport: { width: number; height: number }, insets: ViewerInsets): Pose & { distance: number } {
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  // Campo visual efectivo del área libre (sin paneles), no del lienzo completo.
  const width = Math.max(200, viewport.width - insets.left - insets.right);
  const height = Math.max(200, viewport.height - insets.top - insets.bottom);
  const halfTan = Math.tan(MathUtils.degToRad(camera.fov) / 2);
  const vfov = 2 * Math.atan(halfTan * (height / Math.max(1, viewport.height)));
  const hfov = 2 * Math.atan(halfTan * (width / Math.max(1, viewport.height)));
  const fitDistance = (w: number, h: number, depth: number, pad = 1.12) =>
    Math.max(h / 2 / Math.tan(vfov / 2), w / 2 / Math.tan(hfov / 2)) * pad + depth / 2;
  const target = new Vector3(center.x, Math.max(1, size.y * 0.32), center.z);
  const standard = { minPolar: 0.02, maxPolar: Math.PI * 0.495 };

  switch (preset) {
    case "front": {
      const distance = fitDistance(size.x, size.y, size.z);
      const t = new Vector3(center.x, size.y * 0.45, center.z);
      return { position: new Vector3(center.x, size.y * 0.5, box.min.z - distance + size.z / 2), target: t, distance, ...standard };
    }
    case "side": {
      const distance = fitDistance(size.z, size.y, size.x);
      const t = new Vector3(center.x, size.y * 0.45, center.z);
      return { position: new Vector3(box.max.x + distance - size.x / 2, size.y * 0.5, center.z), target: t, distance, ...standard };
    }
    case "top": {
      const distance = fitDistance(size.x, size.z, 0, 1.08) + size.y;
      const t = new Vector3(center.x, 0, center.z);
      return { position: new Vector3(center.x, distance, center.z + 0.01), target: t, distance, minPolar: 0, maxPolar: Math.PI * 0.495 };
    }
    case "interior": {
      const eye = Math.min(Math.max(1.7, size.y * 0.18), size.y * 0.5);
      const position = new Vector3(center.x - size.x * 0.22, eye, box.min.z + size.z * 0.12);
      const t = new Vector3(center.x + size.x * 0.12, size.y * 0.55, center.z + size.z * 0.2);
      return { position, target: t, distance: position.distanceTo(t), minPolar: 0.05, maxPolar: Math.PI * 0.75 };
    }
    case "perspective":
    default: {
      const radius = size.length() / 2;
      const distance = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.06;
      const direction = new Vector3(-0.78, 0.5, -1.2).normalize();
      return { position: target.clone().addScaledVector(direction, distance), target, distance, ...standard };
    }
  }
}

type CameraDirectorProps = {
  bounds: Box3 | null;
  fitToken: string;
  request: CameraRequest;
  insets: ViewerInsets;
  interactive: boolean;
};

export function CameraDirector({ bounds, fitToken, request, insets, interactive }: CameraDirectorProps) {
  const controls = useRef<ElementRef<typeof CameraControls> | null>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const viewport = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const lastPreset = useRef<Exclude<CameraPresetId, "fit">>("perspective");
  const initialized = useRef(false);
  const boundsRef = useRef(bounds);
  const insetsRef = useRef(insets);
  useLayoutEffect(() => {
    boundsRef.current = bounds;
    insetsRef.current = insets;
  });

  const apply = (preset: Exclude<CameraPresetId, "fit">, animate: boolean) => {
    const box = boundsRef.current;
    const control = controls.current;
    if (!box || box.isEmpty() || !control) return;
    const pose = computePose(preset, box, camera, viewport, insetsRef.current);
    const radius = box.getSize(new Vector3()).length() / 2;
    camera.near = Math.max(0.05, radius / 2000);
    camera.far = Math.max(600, radius * 30);
    camera.updateProjectionMatrix();
    control.minDistance = preset === "interior" ? 0.5 : Math.max(2, radius * 0.15);
    control.maxDistance = Math.max(60, radius * 6);
    control.minPolarAngle = pose.minPolar;
    control.maxPolarAngle = pose.maxPolar;
    void control.setLookAt(pose.position.x, pose.position.y, pose.position.z, pose.target.x, pose.target.y, pose.target.z, animate);
    // Compensar paneles laterales: el modelo queda centrado en el área libre.
    const i = insetsRef.current;
    const worldPerPx = (2 * pose.distance * Math.tan(MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, viewport.height);
    const fx = preset === "interior" ? 0 : ((i.right - i.left) / 2) * worldPerPx;
    // camera-controls usa Y de pantalla (positivo = hacia abajo).
    const fy = preset === "interior" ? 0 : ((i.bottom - i.top) / 2) * worldPerPx;
    void control.setFocalOffset(fx, fy, 0, animate);
    invalidate();
    if (typeof window !== "undefined" && window.location.search.includes("debug")) {
      Object.assign(window, { __mwCamera: { camera, control, pose, preset, box: box.clone() } });
    }
  };

  // Encuadre automático al cambiar de tipología / variante.
  useLayoutEffect(() => {
    if (!bounds) return;
    apply("perspective", initialized.current);
    lastPreset.current = "perspective";
    initialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, Boolean(bounds)]);

  // Presets pedidos desde la interfaz.
  useEffect(() => {
    if (request.nonce === 0) return;
    const preset = request.preset === "fit" ? lastPreset.current : request.preset;
    lastPreset.current = preset;
    apply(preset, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.nonce]);

  // Re-centrar si cambian los paneles (ej. se abre el panel de configuración).
  useEffect(() => {
    if (!initialized.current) return;
    apply(lastPreset.current, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insets.left, insets.right, insets.top, insets.bottom]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={interactive}
      smoothTime={0.55}
      draggingSmoothTime={0.12}
      dollyToCursor
      truckSpeed={1.2}
    />
  );
}
