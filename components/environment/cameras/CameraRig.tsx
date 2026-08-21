"use client";

import { type ElementRef, type MutableRefObject, useEffect, useMemo, useRef } from "react";
import { CameraControls, useKeyboardControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Camera, Euler, MathUtils, Vector3 } from "three";
import {
  CAMERA_BOUNDS,
  CAMERA_HEIGHT,
  CAMERA_PRESETS,
} from "../utils/sceneConstants";
import type { NavigationMode, StationId } from "../utils/sceneTypes";
import type { FactoryKeyboardControl } from "../hooks/keyboardMap";
import { getStationConfig } from "../stations/stationsConfig";

type CameraRigProps = {
  activeStationId: StationId;
  guidedMode: boolean;
  mode: NavigationMode;
  moduleDimensions: { length: number; width: number; height: number };
  experienceStarted: boolean;
};

type LookState = {
  yaw: MutableRefObject<number>;
  pitch: MutableRefObject<number>;
};

const LOOK_SENSITIVITY = 0.0022;
const MIN_WALK_PITCH = -Math.PI * 0.38;
const MAX_WALK_PITCH = Math.PI * 0.32;
const forward = new Vector3();
const right = new Vector3();
const move = new Vector3();
const worldUp = new Vector3(0, 1, 0);
const lookEuler = new Euler(0, 0, 0, "YXZ");
const moduleAnchor = new Vector3();
const guidedPosition = new Vector3();
const guidedTarget = new Vector3();
const cameraOffset = new Vector3();
const targetOffset = new Vector3();

function clampCamera(position: Vector3, mode: NavigationMode) {
  position.x = MathUtils.clamp(position.x, CAMERA_BOUNDS.minX, CAMERA_BOUNDS.maxX);
  position.z = MathUtils.clamp(position.z, CAMERA_BOUNDS.minZ, CAMERA_BOUNDS.maxZ);
  position.y =
    mode === "walk"
      ? CAMERA_HEIGHT
      : MathUtils.clamp(position.y, CAMERA_BOUNDS.minY, CAMERA_BOUNDS.maxY);
}

function FirstPersonMovement({ look, mode }: { look: LookState; mode: NavigationMode }) {
  const camera = useThree((state) => state.camera);
  const [, getControls] = useKeyboardControls<FactoryKeyboardControl>();
  const velocity = useMemo(() => new Vector3(), []);

  useFrame((_, delta) => {
    if (mode === "orbit") return;

    camera.rotation.set(look.pitch.current, look.yaw.current, 0, "YXZ");

    const controls = getControls();
    move.set(0, 0, 0);

    camera.getWorldDirection(forward);
    // Walk and fly both use a stable ground-plane heading. Fly behaves like a
    // camera drone: looking up never turns W into an aircraft-style climb.
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, worldUp).normalize();

    if (controls.forward) move.add(forward);
    if (controls.back) move.sub(forward);
    if (controls.right) move.add(right);
    if (controls.left) move.sub(right);

    if (mode === "fly") {
      if (controls.up) move.y += 1;
      if (controls.down) move.y -= 1;
    }

    if (move.lengthSq() > 0) {
      move.normalize();
    }

    const targetSpeed = controls.boost ? 10 : mode === "fly" ? 7 : 4.2;
    velocity.lerp(move.multiplyScalar(targetSpeed), 1 - Math.exp(-delta * 7.5));
    camera.position.addScaledVector(velocity, delta);
    clampCamera(camera.position, mode);
  });

  return null;
}

function syncLookFromCamera(look: LookState, camera: Camera) {
  lookEuler.setFromQuaternion(camera.quaternion, "YXZ");
  look.pitch.current = MathUtils.clamp(lookEuler.x, MIN_WALK_PITCH, MAX_WALK_PITCH);
  look.yaw.current = lookEuler.y;
}

export function CameraRig({
  activeStationId,
  guidedMode,
  mode,
  moduleDimensions,
  experienceStarted,
}: CameraRigProps) {
  const controlsRef = useRef<ElementRef<typeof CameraControls> | null>(null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const activeStation = getStationConfig(activeStationId);
  const activeCamera = activeStation.camera;
  const moduleFrameScale = MathUtils.clamp(moduleDimensions.length / 6.05, 1, 2.1);
  const moduleHeightLift = Math.max(0, (moduleDimensions.height - 2.83) * 0.45);
  const effectiveMode: NavigationMode = guidedMode ? "orbit" : mode;
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const look = useMemo<LookState>(() => ({ yaw: yawRef, pitch: pitchRef }), []);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!experienceStarted) return;

    if (guidedMode) {
      moduleAnchor.fromArray(activeStation.modulePose.position);
      // Camera presets are factory-space views. Keeping them independent from the
      // module rotation lets the product turn around without also moving the user
      // to the opposite side of the production cell.
      cameraOffset.fromArray(activeCamera.position);
      cameraOffset.x *= moduleFrameScale;
      cameraOffset.z *= moduleFrameScale;
      cameraOffset.y += moduleHeightLift;
      guidedPosition.copy(moduleAnchor).add(cameraOffset);

      if (activeStation.modulePose.cameraTarget) {
        guidedTarget.fromArray(activeStation.modulePose.cameraTarget);
        guidedTarget.y += moduleHeightLift * 0.8;
      } else {
        targetOffset.fromArray(activeCamera.target);
        targetOffset.y += moduleHeightLift * 0.8;
        guidedTarget.copy(moduleAnchor).add(targetOffset);
      }

      // Cancel any in-flight orbit before starting the next station view. This
      // prevents a quick station change from replaying the previous camera arc.
      controlsRef.current?.stop();
      controlsRef.current?.setLookAt(
        guidedPosition.x,
        guidedPosition.y,
        guidedPosition.z,
        guidedTarget.x,
        guidedTarget.y,
        guidedTarget.z,
        true
      );
      return;
    }

    const preset = CAMERA_PRESETS[mode];

    if (mode === "orbit") {
      controlsRef.current?.setLookAt(
        preset.position[0],
        preset.position[1],
        preset.position[2],
        preset.target[0],
        preset.target[1],
        preset.target[2],
        true
      );
      return;
    }

    camera.position.set(preset.position[0], preset.position[1], preset.position[2]);
    if (mode === "walk") camera.position.y = CAMERA_HEIGHT;
    camera.lookAt(preset.target[0], preset.target[1], preset.target[2]);
    syncLookFromCamera(look, camera);
    gl.domElement.tabIndex = 0;
    gl.domElement.focus({ preventScroll: true });
  }, [
    activeCamera,
    activeStation,
    camera,
    experienceStarted,
    gl.domElement,
    guidedMode,
    look,
    mode,
    moduleFrameScale,
    moduleHeightLift,
  ]);

  useEffect(() => {
    const domElement = gl.domElement;
    domElement.tabIndex = 0;

    const stopDrag = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      draggingRef.current = false;
      pointerIdRef.current = null;
      if (domElement.hasPointerCapture(event.pointerId)) {
        domElement.releasePointerCapture(event.pointerId);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (effectiveMode === "orbit") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      draggingRef.current = true;
      pointerIdRef.current = event.pointerId;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      domElement.setPointerCapture(event.pointerId);
      domElement.focus({ preventScroll: true });
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;

      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };

      look.yaw.current -= dx * LOOK_SENSITIVITY;
      look.pitch.current = MathUtils.clamp(
        look.pitch.current - dy * LOOK_SENSITIVITY,
        MIN_WALK_PITCH,
        MAX_WALK_PITCH
      );
      event.preventDefault();
    };

    domElement.addEventListener("pointerdown", handlePointerDown);
    domElement.addEventListener("pointermove", handlePointerMove);
    domElement.addEventListener("pointerup", stopDrag);
    domElement.addEventListener("pointercancel", stopDrag);
    domElement.addEventListener("lostpointercapture", stopDrag);

    return () => {
      domElement.removeEventListener("pointerdown", handlePointerDown);
      domElement.removeEventListener("pointermove", handlePointerMove);
      domElement.removeEventListener("pointerup", stopDrag);
      domElement.removeEventListener("pointercancel", stopDrag);
      domElement.removeEventListener("lostpointercapture", stopDrag);
    };
  }, [effectiveMode, gl.domElement, look]);

  const useCameraControls = guidedMode || mode === "orbit";
  return (
    <>
      {useCameraControls && (
        <CameraControls
          ref={controlsRef}
          makeDefault
          minDistance={guidedMode ? activeCamera.minDistance : 8}
          maxDistance={guidedMode ? activeCamera.maxDistance * moduleFrameScale : 86}
          minPolarAngle={guidedMode ? activeCamera.minPolarAngle : Math.PI * 0.08}
          maxPolarAngle={guidedMode ? activeCamera.maxPolarAngle : Math.PI * 0.49}
          truckSpeed={guidedMode ? 0 : 1.05}
          dollySpeed={guidedMode ? 0.34 : 0.62}
          smoothTime={guidedMode ? Math.max(0.5, activeCamera.transitionDuration * 0.46) : 0.64}
        />
      )}
      <FirstPersonMovement look={look} mode={effectiveMode} />
    </>
  );
}
