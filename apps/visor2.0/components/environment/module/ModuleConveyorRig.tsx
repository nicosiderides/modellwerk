"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils, Vector3 } from "three";
import { getModuleTravelPoints, getStationModulePose } from "../stations/stationsConfig";
import type { StationId } from "../utils/sceneTypes";

type ModuleConveyorRigProps = {
  activeStationId: StationId;
  children: ReactNode;
};

const targetPosition = new Vector3();

type TravelSegment = {
  start: Vector3;
  end: Vector3;
  duration: number;
};

const MIN_SEGMENT_DURATION = 0.58;
const MAX_SEGMENT_DURATION = 1.95;
const MODULE_TRAVEL_SPEED = 15.5;

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function dampAngle(current: number, target: number, lambda: number, delta: number) {
  const angleDelta = MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + angleDelta * (1 - Math.exp(-lambda * delta));
}

function buildTravelSegments(currentPosition: Vector3, points: ReturnType<typeof getModuleTravelPoints>) {
  const segments: TravelSegment[] = [];
  const start = currentPosition.clone();

  points.forEach((point) => {
    const end = new Vector3().fromArray(point);
    const previous = segments[segments.length - 1]?.end ?? start;
    const distance = previous.distanceTo(end);
    if (distance < 0.04) return;

    segments.push({
      start: previous.clone(),
      end,
      duration: MathUtils.clamp(distance / MODULE_TRAVEL_SPEED, MIN_SEGMENT_DURATION, MAX_SEGMENT_DURATION),
    });
  });

  return segments;
}

export function ModuleConveyorRig({ activeStationId, children }: ModuleConveyorRigProps) {
  const groupRef = useRef<Group>(null);
  const previousStationIdRef = useRef<StationId>(activeStationId);
  const travelSegmentsRef = useRef<TravelSegment[]>([]);
  const segmentIndexRef = useRef(0);
  const segmentElapsedRef = useRef(0);
  const targetRotationYRef = useRef(getStationModulePose(activeStationId).rotationY);

  useEffect(() => {
    const group = groupRef.current;
    const nextPose = getStationModulePose(activeStationId);
    const previousStationId = previousStationIdRef.current;
    targetRotationYRef.current = nextPose.rotationY;

    if (!group) return;
    const routePoints = getModuleTravelPoints(previousStationId, activeStationId);
    travelSegmentsRef.current = buildTravelSegments(group.position, routePoints);
    segmentIndexRef.current = 0;
    segmentElapsedRef.current = 0;
    previousStationIdRef.current = activeStationId;
  }, [activeStationId]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    targetPosition.fromArray(getStationModulePose(activeStationId).position);

    const segments = travelSegmentsRef.current;
    const segment = segments[segmentIndexRef.current];

    if (segment) {
      segmentElapsedRef.current += delta;
      const progress = MathUtils.clamp(segmentElapsedRef.current / segment.duration, 0, 1);
      group.position.lerpVectors(segment.start, segment.end, smoothstep(progress));

      if (progress >= 1) {
        group.position.copy(segment.end);
        segmentIndexRef.current += 1;
        segmentElapsedRef.current = 0;
      }
    } else {
      group.position.x = MathUtils.damp(group.position.x, targetPosition.x, 3.8, delta);
      group.position.y = MathUtils.damp(group.position.y, targetPosition.y, 3.8, delta);
      group.position.z = MathUtils.damp(group.position.z, targetPosition.z, 3.8, delta);
    }

    group.rotation.y = dampAngle(group.rotation.y, targetRotationYRef.current, 3.4, delta);

    if (group.position.distanceToSquared(targetPosition) < 0.0004) {
      group.position.copy(targetPosition);
    }
  });

  return (
    <group ref={groupRef} name="ModuleConveyorRig">
      {children}
    </group>
  );
}
