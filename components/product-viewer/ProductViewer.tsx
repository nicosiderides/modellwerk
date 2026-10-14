"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Grid } from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  HalfFloatType,
  Matrix4,
  Mesh,
  PCFShadowMap,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Object3D,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { assetPath } from "@/components/environment/utils/assetPath";
import { CameraDirector } from "./CameraDirector";
import { ScaleReferences } from "./ScaleReferences";
import { loadProductModel } from "./engine/ProductModelLoader";
import { ModelStageController } from "./engine/ModelStageController";
import { normalizeModel } from "./engine/normalizeModel";
import type { ProductViewerProps, ViewerBackdrop, ViewerContent, ViewerSurroundings } from "./types";

/**
 * MW Product Viewer — visor 3D genérico para productos constructivos.
 * Monta UN solo `primitive` por modelo; todo el comportamiento por elemento
 * lo resuelve `ModelStageController` de forma imperativa.
 */

const BACKGROUND = "#d9d7d0";

type Stage = { controller: ModelStageController; ownsGeometry: boolean; fitToken: string; key: string };

function disposeOwned(root: Object3D) {
  const seen = new Set<BufferGeometry>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && !seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
  });
}

function ModelStage(props: ProductViewerProps & { onBounds: (box: Box3 | null, fitToken: string) => void; onOrigin: (origin: Matrix4 | null) => void }) {
  const { content, resolveMaterial, materialVersion, hiddenCategories, isolatedCategories, explode, explodeOffsets, selectable, selectedElementId, onSelect, onIndex, onLoadState, onBounds } = props;
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const [stage, setStage] = useState<Stage | null>(null);
  const contentRef = useRef<ViewerContent | null>(content);
  const callbacks = useRef({ onIndex, onLoadState, onBounds, onSelect, resolveMaterial });
  const explodeTarget = useRef(0);
  const explodeOffsetsRef = useRef(explodeOffsets);

  useEffect(() => {
    contentRef.current = content;
    callbacks.current = { onIndex, onLoadState, onBounds, onSelect, resolveMaterial };
    explodeOffsetsRef.current = explodeOffsets;
  });

  const key = content?.key ?? null;

  // Carga / construcción del modelo.
  useEffect(() => {
    const current = contentRef.current;
    if (!current || !key) return;
    let cancelled = false;
    const report = callbacks.current.onLoadState;
    const timer = window.setTimeout(async () => {
      try {
        let root: Object3D;
        let metadata = null;
        let fitToken: string;
        let ownsGeometry = false;
        let sourceLabel: string;
        if (current.kind === "procedural") {
          report?.({ status: "loading", progress: 0.5, source: "procedural" });
          const built = current.build();
          root = normalizeModel(built.root, { center: false }).root;
          metadata = built.metadata;
          fitToken = current.fitGroup;
          ownsGeometry = true;
          sourceLabel = "procedural";
        } else {
          report?.({ status: "loading", progress: 0, source: current.definition.src });
          const loaded = await loadProductModel(current.definition, gl, (p) => {
            if (!cancelled) report?.({ status: "loading", progress: p, source: current.definition.src });
          });
          if (cancelled) return;
          root = normalizeModel(loaded.object, current.definition).root;
          metadata = loaded.metadata;
          fitToken = current.key;
          sourceLabel = current.definition.src ?? "glb";
        }
        if (cancelled) {
          if (ownsGeometry) disposeOwned(root);
          return;
        }
        const controller = new ModelStageController(root, metadata, explodeOffsetsRef.current);
        controller.setExplode(explodeTarget.current);
        setStage((previous) => {
          if (previous?.ownsGeometry) disposeOwned(previous.controller.root);
          previous?.controller.dispose();
          return { controller, ownsGeometry, fitToken, key };
        });
        const size = controller.bounds().getSize(new Vector3());
        report?.({
          status: "ready",
          progress: 1,
          source: sourceLabel,
          stats: { meshes: controller.meshCount, elements: controller.index.elements.size, triangles: controller.triangleCount, unmatched: controller.index.unmatchedNodes },
          size: [size.x, size.y, size.z],
        });
        callbacks.current.onIndex?.(controller.index, metadata);
      } catch (error) {
        if (!cancelled) report?.({ status: "error", progress: 0, error: error instanceof Error ? error.message : "Error al cargar el modelo" });
      }
    }, current.kind === "procedural" ? 45 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, gl]);

  // Liberar al desmontar.
  useEffect(
    () => () => {
      setStage((previous) => {
        if (previous?.ownsGeometry) disposeOwned(previous.controller.root);
        return null;
      });
    },
    []
  );

  useEffect(() => {
    callbacks.current.onBounds(stage ? stage.controller.bounds() : null, stage?.fitToken ?? "");
    // Origen del modelo después de normalizarlo (el entorno se ubica igual).
    const inner = stage?.controller.root.getObjectByName("MW_NORMALIZED_INNER");
    if (inner) inner.updateWorldMatrix(true, false);
    props.onOrigin(inner ? inner.matrixWorld.clone() : stage ? new Matrix4() : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    stage?.controller.applyMaterials(callbacks.current.resolveMaterial);
    invalidate();
  }, [stage, materialVersion, invalidate]);

  useEffect(() => {
    stage?.controller.setVisibility(hiddenCategories, isolatedCategories);
    invalidate();
  }, [stage, hiddenCategories, isolatedCategories, invalidate]);

  useEffect(() => {
    stage?.controller.select(selectedElementId);
    invalidate();
  }, [stage, selectedElementId, invalidate]);

  // Corte en planta (después de asignar materiales y resaltado).
  const sectionHeight = props.sectionHeight ?? null;
  useEffect(() => {
    stage?.controller.setSection(sectionHeight);
    invalidate();
  }, [stage, materialVersion, selectedElementId, sectionHeight, invalidate]);

  useEffect(() => {
    explodeTarget.current = explode ? 1 : 0;
    invalidate();
  }, [explode, invalidate]);

  useFrame((_, delta) => {
    const controller = stage?.controller;
    if (!controller) return;
    const current = controller.getExplode();
    const target = explodeTarget.current;
    if (Math.abs(current - target) < 0.001) {
      if (current !== target) controller.setExplode(target);
      return;
    }
    controller.setExplode(current + (target - current) * (1 - Math.exp(-delta * 4.2)));
    invalidate();
  });

  // Raycasting centralizado: un solo listener, sólo en clic (no en hover).
  useEffect(() => {
    if (!selectable || !stage) return;
    const element = gl.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    const ndc = new Vector2();
    const onDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY, t: performance.now() };
    };
    const onUp = (event: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      down = null;
      if (moved > 6 || !quick || (event.pointerType === "mouse" && event.button !== 0)) return;
      const rect = element.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const id = stage.controller.pick(ndc, camera);
      const resolved = id ? stage.controller.index.elements.get(id) : undefined;
      callbacks.current.onSelect(id && resolved ? { elementId: id, element: resolved } : null);
    };
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointerup", onUp);
    return () => {
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointerup", onUp);
    };
  }, [selectable, stage, gl, camera]);

  if (!stage) return null;
  return <primitive object={stage.controller.root} />;
}

function Lighting({ bounds, extent, quality, wide }: { bounds: Box3 | null; extent: Box3 | null; quality: ProductViewerProps["quality"]; wide: boolean }) {
  const sun = useRef<DirectionalLight>(null);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const radius = useMemo(() => (bounds && !bounds.isEmpty() ? bounds.getSize(new Vector3()).length() / 2 : 40), [bounds]);
  // Las sombras cubren el modelo y su entorno inmediato (vehículos, árboles).
  const shadowBox = useMemo(() => {
    const box = bounds && !bounds.isEmpty() ? bounds.clone() : new Box3(new Vector3(-20, 0, -30), new Vector3(20, 10, 30));
    if (extent && !extent.isEmpty()) box.union(extent);
    return box;
  }, [bounds, extent]);

  useEffect(() => {
    scene.background = new Color(BACKGROUND);
    // Con mapa real la niebla empieza más lejos: se ve el barrio (≈ 1 km alrededor).
    scene.fog = wide ? new Fog(BACKGROUND, Math.max(radius * 7, 240), Math.max(radius * 18, 1250)) : new Fog(BACKGROUND, radius * 7, radius * 18);
    const light = sun.current;
    if (light) {
      const cam = light.shadow.camera;
      const center = shadowBox.getCenter(new Vector3());
      const span = shadowBox.getSize(new Vector3());
      const extent = Math.max(radius * 1.15, Math.hypot(span.x, span.z) / 2 + 4);
      cam.left = -extent;
      cam.right = extent;
      cam.top = extent;
      cam.bottom = -extent;
      cam.near = 0.5;
      cam.far = Math.max(radius, extent) * 6;
      cam.updateProjectionMatrix();
      // Sol lateral-posterior: la sombra cae hacia la cámara y modela los volúmenes.
      const reach = Math.max(radius, extent);
      light.position.set(center.x - reach * 1.35, reach * 1.7, center.z + reach * 0.75);
      light.target.position.set(center.x, 0, center.z);
      light.target.updateMatrixWorld();
      light.shadow.needsUpdate = true;
    }
    invalidate();
  }, [radius, shadowBox, scene, invalidate, wide]);

  return (
    <>
      <hemisphereLight args={["#f4f2ec", "#8a857a", 0.55]} />
      <directionalLight
        ref={sun}
        intensity={2.1}
        color="#fff6e8"
        castShadow
        shadow-mapSize-width={quality === "high" ? 4096 : 2048}
        shadow-mapSize-height={quality === "high" ? 4096 : 2048}
        shadow-bias={-0.0003}
        shadow-normalBias={0.035}
      />
      <directionalLight intensity={0.35} color="#dfe8f0" position={[radius, radius * 0.6, radius]} />
      <Suspense fallback={null}>
        <Environment files={assetPath("/hdr/kloofendal_43d_clear_puresky_2k.hdr")} background={false} environmentIntensity={0.55} />
      </Suspense>
    </>
  );
}

/**
 * Piso neutro y grilla. Van siempre "detrás" de todo lo que se apoya en el
 * suelo (veredas, playones, platea): además de estar unos cm más abajo, se
 * empujan hacia atrás en profundidad para que nunca asomen por encima.
 */
function Ground({ bounds, bare, xray }: { bounds: Box3 | null; bare: boolean; xray: boolean }) {
  const grid = useRef<Mesh>(null);
  useEffect(() => {
    const material = grid.current?.material as { polygonOffset?: boolean; polygonOffsetFactor?: number; polygonOffsetUnits?: number; needsUpdate?: boolean } | undefined;
    if (!material) return;
    material.polygonOffset = true;
    material.polygonOffsetFactor = 4;
    material.polygonOffsetUnits = 8;
    material.needsUpdate = true;
  });
  if (bare && !xray) return null;
  const size = bounds && !bounds.isEmpty() ? bounds.getSize(new Vector3()) : new Vector3(40, 10, 60);
  const radius = Math.max(size.x, size.z);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow renderOrder={xray ? 5 : 0}>
        <circleGeometry args={[Math.max(250, radius * 7), 64]} />
        {xray ? (
          <meshStandardMaterial key="xray" color="#cbc8bf" roughness={1} metalness={0} transparent opacity={0.36} depthWrite={false} />
        ) : (
          <meshStandardMaterial key="solid" color="#cbc8bf" roughness={1} metalness={0} polygonOffset polygonOffsetFactor={6} polygonOffsetUnits={12} />
        )}
      </mesh>
      <Grid
        ref={grid}
        position={[0, -0.03, 0]}
        args={[10, 10]}
        infiniteGrid
        cellSize={6}
        cellThickness={0}
        cellColor="#bdb9ae"
        sectionSize={6}
        sectionThickness={0.7}
        sectionColor="#b8b4a9"
        fadeDistance={Math.max(140, radius * 3.2)}
        fadeStrength={1.8}
        followCamera={false}
      />
    </group>
  );
}

/** Oclusión ambiental (GTAO) sólo en calidad alta. Se renderiza a demanda. */
function AmbientOcclusion() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const composer = useMemo(() => {
    // El composer dibuja en su propio buffer, que por defecto NO tiene
    // antialiasing: por eso en calidad alta los bordes salían en serrucho.
    // Le damos un buffer con 4 muestras (MSAA), igual que el canvas normal.
    const target = new WebGLRenderTarget(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio(), { type: HalfFloatType, samples: 4 });
    const c = new EffectComposer(gl, target);
    c.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, size.width, size.height);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.blendIntensity = 0.9;
    ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 2.5, scale: 1.1, samples: 12 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    c.addPass(ao);
    c.addPass(new OutputPass());
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame(() => composer.render(), 1);
  return null;
}

/** Entorno del producto, ubicado con el mismo origen que el modelo. */
function Surroundings({ content, origin, onExtent }: { content: ViewerSurroundings | null | undefined; origin: Matrix4 | null; onExtent: (box: Box3 | null) => void }) {
  const invalidate = useThree((state) => state.invalidate);
  const [built, setBuilt] = useState<{ root: Object3D; box: Box3; dispose?: (root: Object3D) => void } | null>(null);
  const key = content?.key ?? null;
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  });
  useEffect(() => {
    const current = contentRef.current;
    const next = current && key ? { ...current.build(), dispose: current.dispose } : null;
    setBuilt((previous) => {
      if (previous) previous.dispose?.(previous.root);
      return next;
    });
    invalidate();
  }, [key, invalidate]);
  useEffect(() => () => setBuilt((previous) => (previous?.dispose?.(previous.root), null)), []);
  useEffect(() => {
    if (!built || !origin) return onExtent(null);
    onExtent(built.box.clone().applyMatrix4(origin));
    invalidate();
  }, [built, origin, onExtent, invalidate]);
  if (!built || !origin) return null;
  return (
    <group matrixAutoUpdate={false} matrix={origin}>
      <primitive object={built.root} />
    </group>
  );
}

/** Piso de fondo (mapa real), con el mismo origen que el modelo. */
function Backdrop({ content, origin }: { content: ViewerBackdrop; origin: Matrix4 | null }) {
  const invalidate = useThree((state) => state.invalidate);
  const [built, setBuilt] = useState<{ root: Object3D; dispose: () => void } | null>(null);
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  });
  const key = content.key;
  useEffect(() => {
    const next = contentRef.current.build(() => invalidate());
    setBuilt(next);
    invalidate();
    return () => {
      next.dispose();
      setBuilt(null);
    };
  }, [key, invalidate]);
  const [ox, oy, oz] = content.offset;
  useEffect(() => {
    invalidate();
  }, [ox, oy, oz, invalidate]);
  if (!built || !origin) return null;
  return (
    <group matrixAutoUpdate={false} matrix={origin}>
      <group position={[ox, oy, oz]}>
        <primitive object={built.root} />
      </group>
    </group>
  );
}

/** Expone una captura PNG de la vista (para la ficha imprimible). */
function SnapshotBridge({ onReady }: { onReady?: (capture: () => string | null) => void }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    onReady?.(() => {
      try {
        gl.render(scene, camera);
        return gl.domElement.toDataURL("image/png");
      } catch {
        return null;
      }
    });
  }, [gl, scene, camera, onReady]);
  return null;
}

export default function ProductViewer(props: ProductViewerProps) {
  const [bounds, setBounds] = useState<Box3 | null>(null);
  const [fitToken, setFitToken] = useState("");
  const [origin, setOrigin] = useState<Matrix4 | null>(null);
  const [extent, setExtent] = useState<Box3 | null>(null);
  const onBounds = useCallback((box: Box3 | null, token: string) => {
    setBounds(box);
    if (token) setFitToken(token);
  }, []);
  const high = props.quality === "high";

  return (
    <div className={props.className} style={{ position: "absolute", inset: 0 }}>
      <Canvas
        frameloop="demand"
        shadows={{ type: PCFShadowMap }}
        dpr={high ? [1, 1.75] : [0.85, 1.25]}
        camera={{ fov: 38, near: 0.1, far: 800, position: [-40, 24, -50] }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: Boolean(props.captureMode) }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace;
          // Para el corte en planta (sólo afecta a materiales con planos de corte).
          gl.localClippingEnabled = true;
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.02;
        }}
      >
        <Lighting bounds={bounds} extent={extent} quality={props.quality} wide={Boolean(props.backdrop)} />
        <Ground bounds={bounds} bare={Boolean(props.backdrop)} xray={Boolean(props.underground)} />
        {props.backdrop && !props.underground && <Backdrop content={props.backdrop} origin={origin} />}
        <ModelStage {...props} onBounds={onBounds} onOrigin={setOrigin} />
        <Surroundings content={props.surroundings} origin={origin} onExtent={setExtent} />
        <CameraDirector bounds={bounds} fitToken={fitToken} request={props.cameraRequest} insets={props.insets} interactive={!props.captureMode} wide={Boolean(props.backdrop)} />
        <ScaleReferences bounds={bounds} visible={props.showScaleReferences} />
        {high && <AmbientOcclusion />}
        <SnapshotBridge onReady={props.onSnapshotReady} />
      </Canvas>
    </div>
  );
}
