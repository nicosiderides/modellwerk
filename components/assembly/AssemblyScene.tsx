"use client";

import { Component, memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges, Html, Line, OrbitControls } from '@react-three/drei';
import { OrthographicCamera, Plane, Quaternion, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Project, Schedule, Vec3 } from '@/core/assembly/types';
import { getModulePosition, getModuleState, getPickupPosition } from '@/core/assembly/engine';

type Module = Project['modules'][number];
type Crane = Project['cranes'][number];
type Zone = Project['zones'][number];

export interface AssemblySceneProps {
  project: Project;
  schedule: Schedule;
  time: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  view: 'iso' | 'top' | 'front';
  mode: string;
  structure: boolean;
  transparent: boolean;
  showLabels: boolean;
  hiddenIds: string[];
  isolatedId: string | null;
  onCraneMove: (position: Vec3) => void;
}

const INK = '#303a3a';
const GOLD = '#e6bb2f';
const STEEL = '#566361';
const GROUND = '#eeefeb';
const UP = new Vector3(0, 1, 0);

function Box({ p, s, color = INK, opacity = 1, edges = false }: { p: Vec3; s: Vec3; color?: string; opacity?: number; edges?: boolean }) {
  return <mesh position={p} castShadow receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={color} roughness={0.78} metalness={0.08} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} />
    {edges && <Edges color={INK} threshold={20} />}
  </mesh>;
}

function Beam({ from, to, width = 0.12, color = INK, depth }: { from: Vec3; to: Vec3; width?: number; color?: string; depth?: number }) {
  const a = new Vector3(...from), b = new Vector3(...to), direction = b.clone().sub(a);
  return <mesh position={a.add(b).multiplyScalar(0.5)} quaternion={new Quaternion().setFromUnitVectors(UP, direction.clone().normalize())} castShadow>
    <boxGeometry args={[width, direction.length(), depth ?? width]} />
    <meshStandardMaterial color={color} roughness={0.62} metalness={0.25} />
  </mesh>;
}

function Tag({ p, children, active = false, quiet = false }: { p: Vec3; children: ReactNode; active?: boolean; quiet?: boolean }) {
  return <Html position={p} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none', userSelect: 'none' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', padding: quiet ? '3px 5px' : '5px 7px', background: active ? '#f1ca45' : quiet ? '#f5f6f0d9' : '#ffffffed', border: `1px solid ${active ? '#a68625' : '#cdd1c9'}`, borderRadius: 2, color: '#313835', fontFamily: 'var(--font-mono), ui-monospace, monospace', fontSize: quiet ? 8 : 9, fontWeight: 600, letterSpacing: '.03em', boxShadow: quiet ? undefined : '0 2px 8px #28332c10' }}>{children}</div>
  </Html>;
}

function outline(w: number, d: number, y = 0.02): Vec3[] { return [[-w / 2, y, -d / 2], [w / 2, y, -d / 2], [w / 2, y, d / 2], [-w / 2, y, d / 2], [-w / 2, y, -d / 2]]; }
function circle(radius: number, position: Vec3): Vec3[] { return Array.from({ length: 97 }, (_, i) => [position[0] + Math.cos(i / 96 * Math.PI * 2) * radius, 0.055, position[2] + Math.sin(i / 96 * Math.PI * 2) * radius]); }
function samePosition(a: Vec3, b: Vec3) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }

const FutureModule = memo(function FutureModule({ module, selected, onSelect }: { module: Module; selected: boolean; onSelect: AssemblySceneProps['onSelect'] }) {
  return <group position={[module.position[0], module.position[1] + module.dimensions[1] / 2, module.position[2]]} rotation={[0, module.rotation * Math.PI / 180, 0]}>
    <mesh onClick={e => { e.stopPropagation(); onSelect(module.id); }}>
      <boxGeometry args={module.dimensions} />
      <meshBasicMaterial color={selected ? GOLD : '#bdc5be'} transparent opacity={selected ? 0.1 : 0.026} depthWrite={false} />
      <Edges color={selected ? '#d2ac20' : '#a6b1a9'} transparent opacity={selected ? 0.85 : 0.36} />
    </mesh>
  </group>;
});

const BuildingModule = memo(function BuildingModule({ module, position, state, selected, structure, transparent, showLabel, onSelect, rotation }: {
  module: Module; position: Vec3; state: string; selected: boolean; structure: boolean; transparent: boolean; showLabel: boolean; onSelect: AssemblySceneProps['onSelect']; rotation: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [w, h, d] = module.dimensions;
  const moving = state === 'LIFTING' || state === 'POSITIONING';
  const fixing = state === 'FIXING';
  const emphasized = moving || selected;
  const frame = emphasized ? '#bc9528' : INK;
  const facade = emphasized ? '#edcc59' : '#e5e7df';
  const opacity = transparent ? 0.3 : 1;
  // Movement changes only the parent transform; its dozens of architectural parts stay mounted.
  const geometry = useMemo(() => <>
    <Box p={[0, -h / 2 + 0.12, 0]} s={[w, 0.24, d]} color={emphasized ? '#d7ae36' : '#87918a'} opacity={opacity} />
    {!structure && <>
      <Box p={[0, h / 2 - 0.12, 0]} s={[w - 0.14, 0.19, d - 0.1]} color={emphasized ? '#f1d66b' : '#dfe3da'} opacity={opacity} />
      {[-1, 1].map(side => <group key={side}>
        <Box p={[side * (w / 2 - 0.06), 0, 0]} s={[0.09, h - 0.28, d - 0.15]} color={facade} opacity={opacity} />
        <Box p={[side * (w / 2 + 0.01), -0.21, 0.28]} s={[0.06, 2.2, 0.96]} color={frame} opacity={opacity} />
        <Box p={[side * (w / 2 + 0.05), -0.23, 0.28]} s={[0.025, 2.05, 0.83]} color={emphasized ? '#d2b34c' : '#bac5b9'} opacity={opacity} />
        <Box p={[side * (w / 2 + 0.07), 0.35, 0.28]} s={[0.027, 0.6, 0.57]} color={'#6c8581'} opacity={opacity} />
        <Box p={[0, 0, side * (d / 2 - 0.06)]} s={[w - 0.18, h - 0.28, 0.08]} color={facade} opacity={opacity} />
        {[-0.32, -0.02, 0.28].map((x, i) => <group key={x}>
          <Box p={[x * w, 0.16, side * (d / 2 + 0.005)]} s={[w * 0.18, 1.42, 0.09]} color={frame} opacity={opacity} />
          <Box p={[x * w, 0.18, side * (d / 2 + 0.063)]} s={[w * 0.18 - 0.13, 1.27, 0.025]} color={i === 1 ? '#819590' : '#91a6a0'} opacity={transparent ? 0.2 : 0.92} />
          <Box p={[x * w, 0.18, side * (d / 2 + 0.08)]} s={[0.045, 1.27, 0.027]} color={frame} opacity={opacity} />
        </group>)}
        {[-0.46, -0.2, 0.12, 0.45].map(x => <Box key={x} p={[x * w, 0, side * (d / 2 + 0.009)]} s={[0.021, h - 0.32, 0.015]} color={emphasized ? '#c4a33f' : '#aeb9af'} opacity={opacity} />)}
      </group>)}
    </>}
    {[-1, 1].flatMap(x => [-1, 1].map(z => <Box key={`${x}-${z}`} p={[x * (w / 2 - 0.075), 0, z * (d / 2 - 0.075)]} s={[0.15, h, 0.15]} color={frame} />))}
    {[-1, 1].flatMap(y => [-1, 1].map(z => <Box key={`${y}-${z}`} p={[0, y * (h / 2 - 0.075), z * (d / 2 - 0.075)]} s={[w, 0.15, 0.15]} color={frame} />))}
    {[-1, 1].flatMap(y => [-1, 1].map(x => <Box key={`${y}-${x}`} p={[x * (w / 2 - 0.075), y * (h / 2 - 0.075), 0]} s={[0.15, 0.15, d]} color={frame} />))}
    {structure && [-0.25, 0, 0.25].map(x => <Box key={x} p={[x * w, h / 2 - 0.08, 0]} s={[0.08, 0.12, d]} color={STEEL} />)}
    {structure && [-1, 1].map(side => <Beam key={side} from={[side * (w / 2 - 0.08), -h / 2 + 0.1, -d / 2 + 0.1]} to={[side * (w / 2 - 0.08), h / 2 - 0.1, d / 2 - 0.1]} width={0.055} color={STEEL} />)}
    {(selected || hovered || moving) && <mesh><boxGeometry args={[w + 0.06, h + 0.06, d + 0.06]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /><Edges color={hovered && !emphasized ? '#617e6e' : '#b9920a'} lineWidth={1.5} /></mesh>}
    {(showLabel || selected || hovered || moving) && <Tag p={[0, h / 2 + 0.6, 0]} active={emphasized} quiet={!emphasized && !hovered}><span style={{ width: 4, height: 4, borderRadius: '50%', background: moving ? '#61531a' : fixing ? '#d29438' : '#668878' }} />{module.id}{moving && <span style={{ opacity: 0.65 }}>· IZAJE</span>}</Tag>}
  </>, [w, h, d, emphasized, opacity, structure, facade, frame, transparent, selected, hovered, moving, showLabel, fixing, module.id]);
  return <group position={[position[0], position[1] + h / 2, position[2]]} rotation={[0, rotation, 0]} onClick={e => { e.stopPropagation(); onSelect(module.id); }} onPointerOver={e => { e.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>{geometry}</group>;
}, (a, b) => a.module === b.module && samePosition(a.position, b.position) && a.state === b.state && a.selected === b.selected && a.structure === b.structure && a.transparent === b.transparent && a.showLabel === b.showLabel && a.onSelect === b.onSelect && a.rotation === b.rotation);

const SiteZone = memo(function SiteZone({ zone, showLabel }: { zone: Zone; showLabel: boolean }) {
  const type = zone.type.toUpperCase();
  const restricted = /NO[ _]|EXCAVATION|RESTRICT|OVERHEAD|SECURITY|UNDERGROUND/.test(type);
  const loading = /LOAD|DESCARGA/.test(type);
  const color = restricted ? '#ad7f69' : loading ? '#b69c47' : '#8d9c91';
  const [w, d] = zone.size;
  return <group position={[zone.position[0], 0.02, zone.position[2]]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[w, d]} /><meshBasicMaterial color={color} transparent opacity={restricted ? 0.11 : 0.065} depthWrite={false} /></mesh>
    <Line points={outline(w, d)} color={color} lineWidth={0.85} dashed dashSize={0.35} gapSize={0.22} />
    {restricted && Array.from({ length: Math.max(1, Math.floor(w / 1.5)) }, (_, i) => <Line key={i} points={[[-w / 2 + i * 1.5, 0.025, -d / 2], [-w / 2 + i * 1.5 + Math.min(1, w), 0.025, d / 2]]} color={color} transparent opacity={0.2} lineWidth={0.65} />)}
    {showLabel && <Tag p={[0, 0.2, d / 2 + 0.65]} quiet>{zone.name.toUpperCase()}</Tag>}
  </group>;
});

const Truck = memo(function Truck({ position, id, opacity = 1 }: { position: Vec3; id: string; opacity?: number }) {
  const geometry = useMemo(() => <>
    <Box p={[0, 1.03, 0]} s={[10.2, 0.24, 2.65]} color={'#7f8c83'} opacity={opacity} />
    <Box p={[-6.4, 1.45, 0]} s={[2.25, 2.3, 2.55]} color={'#e6e7dd'} opacity={opacity} />
    <Box p={[-7.55, 1.92, 0]} s={[0.025, 0.76, 2.2]} color={'#516b6b'} opacity={opacity} />
    <Box p={[-6.4, 1.94, 1.29]} s={[1.72, 0.83, 0.025]} color={'#607776'} opacity={opacity} />
    <Box p={[-6.4, 1.94, -1.29]} s={[1.72, 0.83, 0.025]} color={'#607776'} opacity={opacity} />
    <Box p={[-7.59, 0.85, 0]} s={[0.13, 0.18, 2.6]} color={INK} opacity={opacity} />
    {[-6.1, -3.5, 2.7, 3.9].flatMap(x => [-1, 1].map(side => <mesh key={`${x}-${side}`} position={[x, 0.55, side * 1.31]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.5, 0.5, 0.28, 12]} /><meshStandardMaterial color={'#36403c'} transparent opacity={opacity} /></mesh>))}
    <Tag p={[-6.3, 3, 0]} quiet>{id}</Tag>
  </>, [id, opacity]);
  return <group position={position} rotation={[0, Math.PI / 2, 0]}>{geometry}</group>;
}, (a, b) => a.id === b.id && a.opacity === b.opacity && samePosition(a.position, b.position));

const Worker = memo(function Worker({ p }: { p: Vec3 }) {
  return <group position={p}>
    <Box p={[0, 1.05, 0]} s={[0.35, 0.55, 0.22]} color={'#d5ac31'} />
    {[-1, 1].map(side => <group key={side}><Beam from={[side * 0.09, 0.8, 0]} to={[side * 0.14, 0.12, 0.05]} width={0.12} /><Beam from={[side * 0.21, 1.2, 0]} to={[side * 0.29, 0.85, 0.18]} width={0.105} color={'#758078'} /></group>)}
    <mesh position={[0, 1.48, 0]}><sphereGeometry args={[0.17, 8, 8]} /><meshStandardMaterial color={'#cfb497'} /></mesh>
    <mesh position={[0, 1.61, 0]}><sphereGeometry args={[0.2, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={'#f1d44e'} /></mesh>
  </group>;
}, (a, b) => samePosition(a.p, b.p));

const CraneModel = memo(function CraneModel({ crane, position, target, load, loadRotation = 0, showLabel, planning, setDragging, onMove }: { crane: Crane; position: Vec3; target: Vec3; load?: Module; loadRotation?: number; showLabel: boolean; planning: boolean; setDragging: (value: boolean) => void; onMove: (position: Vec3) => void }) {
  const [dragPosition, setDragPosition] = useState<Vec3 | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef(new Vector3());
  const committedPosition = useRef<Vec3>(position);
  const ground = useMemo(() => new Plane(UP, 0), []);
  const at = dragPosition ?? position;
  const [atX, atY, atZ] = at;
  const radiusPoints = useMemo(() => circle(crane.radius, [atX, atY, atZ]), [crane.radius, atX, atY, atZ]);
  const pivot: Vec3 = [at[0], 2.5, at[2]];
  const tip: Vec3 = [target[0], Math.max(target[1] + 5, Math.min(crane.height, 17)), target[2]];
  const midpoint: Vec3 = [pivot[0] + (tip[0] - pivot[0]) * 0.52, pivot[1] + (tip[1] - pivot[1]) * 0.52, pivot[2] + (tip[2] - pivot[2]) * 0.52];
  const hook: Vec3 = [target[0], target[1] + (load ? load.dimensions[1] / 2 + 2.25 : 0), target[2]];
  const slingPoint = (x: number, z: number): Vec3 => [target[0] + Math.cos(loadRotation) * x + Math.sin(loadRotation) * z, target[1] + (load?.dimensions[1] ?? 0) / 2, target[2] - Math.sin(loadRotation) * x + Math.cos(loadRotation) * z];
  const spreaderPoint = (side: number): Vec3 => [hook[0] + Math.cos(loadRotation) * side * (load?.dimensions[0] ?? 0) * 0.32, hook[1] - 0.65, hook[2] - Math.sin(loadRotation) * side * (load?.dimensions[0] ?? 0) * 0.32];
  function startDrag(e: ThreeEvent<PointerEvent>) {
    if (!planning) return;
    e.stopPropagation();
    const point = e.ray.intersectPlane(ground, new Vector3());
    if (!point) return;
    dragging.current = true;
    committedPosition.current = at;
    dragOffset.current.set(at[0] - point.x, 0, at[2] - point.z);
    setDragging(true);
    (e.target as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture(e.pointerId);
  }
  function moveDrag(e: ThreeEvent<PointerEvent>) {
    if (!dragging.current) return;
    e.stopPropagation();
    const point = e.ray.intersectPlane(ground, new Vector3());
    if (!point) return;
    const next: Vec3 = [Math.round((point.x + dragOffset.current.x) * 2) / 2, position[1], Math.round((point.z + dragOffset.current.z) * 2) / 2];
    committedPosition.current = next;
    setDragPosition(next);
  }
  function endDrag(e: ThreeEvent<PointerEvent>) {
    if (!dragging.current) return;
    e.stopPropagation();
    dragging.current = false;
    (e.target as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture(e.pointerId);
    onMove(committedPosition.current);
    setDragPosition(null);
    setDragging(false);
  }
  const chassis = useMemo(() => <>
      <Box p={[0, 0.77, 0]} s={[6.4, 0.68, 2.5]} color={'#313b35'} />
      <Box p={[0, 1.23, 0]} s={[6.5, 0.48, 2.5]} color={GOLD} />
      <Box p={[2.3, 1.97, 0]} s={[1.72, 1.33, 2.28]} color={GOLD} />
      <Box p={[2.4, 2.14, 1.15]} s={[1.35, 0.79, 0.03]} color={'#466664'} />
      <Box p={[2.4, 2.14, -1.15]} s={[1.35, 0.79, 0.03]} color={'#466664'} />
      <Box p={[3.18, 2.14, 0]} s={[0.03, 0.75, 1.95]} color={'#466664'} />
      <Box p={[-1.2, 1.75, 0]} s={[2.7, 0.65, 2.45]} color={GOLD} />
      <Box p={[-1.55, 2.22, -0.94]} s={[1.4, 0.8, 0.65]} color={GOLD} />
      {[-2.2, -0.9, 1, 2.2].flatMap(x => [-1, 1].map(side => <mesh key={`${x}-${side}`} position={[x, 0.61, side * 1.31]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.58, 0.58, 0.35, 16]} /><meshStandardMaterial color={'#26312c'} /></mesh>))}
      {[-2, 2].flatMap(x => [-1, 1].map(side => <group key={`${x}-${side}`}><Box p={[x, 0.66, side * 2.1]} s={[0.27, 0.25, 3.4]} color={'#788276'} /><Box p={[x, 0.43, side * 3.65]} s={[0.17, 0.75, 0.17]} color={'#b0b6a6'} /><Box p={[x, 0.075, side * 3.65]} s={[0.85, 0.15, 0.85]} color={'#555f53'} /></group>))}
      {showLabel && <Tag p={[0, 0.5, 4.5]} active={planning}>{crane.id} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {crane.capacity} t / R {crane.radius} m{planning ? ' · ARRASTRAR' : ''}</span></Tag>}
      {planning && <mesh position={[0, 1.5, 0]}><boxGeometry args={[7.2, 3.5, 5]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>}
  </>, [crane.id, crane.capacity, crane.radius, showLabel, planning]);
  return <group>
    <Line points={radiusPoints} color={'#b79a39'} lineWidth={1.1} dashed dashSize={0.7} gapSize={0.45} transparent opacity={0.63} />
    <group position={at} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>{chassis}</group>
    <Beam from={pivot} to={midpoint} width={0.7} color={GOLD} depth={0.84} />
    <Beam from={midpoint} to={tip} width={0.43} color={'#bd9c38'} depth={0.5} />
    <Beam from={[at[0] - 1, 1.8, at[2]]} to={midpoint} width={0.17} color={'#657069'} />
    <Line points={[tip, hook]} color={'#475047'} lineWidth={1.35} />
    <Box p={hook} s={[0.38, 0.55, 0.3]} color={GOLD} />
    {load && <>
      <group position={[hook[0], hook[1] - 0.65, hook[2]]} rotation={[0, loadRotation, 0]}><Box p={[0, 0, 0]} s={[load.dimensions[0] * 0.64, 0.12, 0.12]} color={GOLD} /></group>
      {[-1, 1].map(side => <Line key={side} points={[hook, spreaderPoint(side)]} color={'#4c554c'} lineWidth={0.9} />)}
      {[-1, 1].flatMap(x => [-1, 1].map(z => <Line key={`${x}-${z}`} points={[spreaderPoint(x), slingPoint(x * load.dimensions[0] * 0.4, z * load.dimensions[2] * 0.4)]} color={'#4c554c'} lineWidth={0.8} />))}
    </>}
  </group>;
}, (a, b) => a.crane === b.crane && samePosition(a.position, b.position) && samePosition(a.target, b.target) && a.load === b.load && a.loadRotation === b.loadRotation && a.showLabel === b.showLabel && a.planning === b.planning && a.setDragging === b.setDragging && a.onMove === b.onMove);

function CameraRig({ view, center, span, geometryKey, dragging }: { view: AssemblySceneProps['view']; center: Vec3; span: Vec3; geometryKey: string; dragging: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const previousFit = useRef<string>('');
  const { camera, size, invalidate } = useThree();
  const [cx, cy, cz] = center, [sx, sy, sz] = span;
  useEffect(() => {
    // Resource edits must never undo a user's pan/zoom or the just-completed crane drag.
    const fitKey = `${view}:${size.width}:${size.height}:${geometryKey}`;
    if (previousFit.current === fitKey) return;
    previousFit.current = fitKey;
    const orthographic = camera as OrthographicCamera;
    const target = new Vector3(cx, cy, cz);
    if (view === 'top') { camera.position.set(cx, 85, cz + 0.001); camera.up.set(0, 0, -1); orthographic.zoom = Math.min(size.width / (sx + 14), size.height / (sz + 13)); }
    else if (view === 'front') { target.y = sy / 2; camera.position.set(cx, target.y, cz + 85); camera.up.set(0, 1, 0); orthographic.zoom = Math.min(size.width / (sx + 12), size.height / (sy + 8)); }
    else { camera.position.set(cx + 48, cy + 40, cz + 48); camera.up.set(0, 1, 0); orthographic.zoom = 1.25 * Math.min(size.width / ((sx + sz) * 0.78 + 10), size.height / (sy * 0.85 + (sx + sz) * 0.39 + 8)); }
    camera.lookAt(target);
    orthographic.updateProjectionMatrix();
    controls.current?.target.copy(target);
    controls.current?.update();
    invalidate();
  }, [view, camera, size.width, size.height, geometryKey, cx, cy, cz, sx, sy, sz, invalidate]);
  return <OrbitControls ref={controls} makeDefault enabled={!dragging} enableRotate={view !== 'top'} minZoom={3} maxZoom={65} maxPolarAngle={Math.PI / 2.03} enableDamping dampingFactor={0.12} />;
}

function SiteContent(props: AssemblySceneProps) {
  const { project, schedule, time, selectedId, onSelect, structure, transparent, showLabels, hiddenIds, isolatedId, view, mode, onCraneMove } = props;
  const [dragging, setDragging] = useState(false);
  const modules = project.modules;
  const crane = project.cranes[0];
  const activeItem = schedule.items.find(item => time >= item.liftStart && time < item.release);
  const activeModule = modules.find(module => module.id === activeItem?.moduleId);
  const selected = modules.find(module => module.id === selectedId);
  const pickupBase = useMemo(() => getPickupPosition(project), [project]);
  const pickup = useMemo<Vec3>(() => [pickupBase[0], pickupBase[1] + 1.4, pickupBase[2]], [pickupBase]);
  const geometryKey = useMemo(() => modules.map(module => `${module.id}:${module.position.join(',')}:${module.dimensions.join(',')}:${module.rotation}`).join(';'), [modules]);
  const activeState = activeItem ? getModuleState(activeItem, time) : '';
  const planning = view === 'top' || mode.toUpperCase() === 'PLAN';
  const extents = useMemo(() => {
    const halfWidth = (module: Module) => (Math.abs(Math.cos(module.rotation * Math.PI / 180)) * module.dimensions[0] + Math.abs(Math.sin(module.rotation * Math.PI / 180)) * module.dimensions[2]) / 2;
    const halfDepth = (module: Module) => (Math.abs(Math.sin(module.rotation * Math.PI / 180)) * module.dimensions[0] + Math.abs(Math.cos(module.rotation * Math.PI / 180)) * module.dimensions[2]) / 2;
    const xs = modules.flatMap(module => [module.position[0] - halfWidth(module), module.position[0] + halfWidth(module)]);
    const zs = modules.flatMap(module => [module.position[2] - halfDepth(module), module.position[2] + halfDepth(module)]);
    const minX = Math.min(...xs, -10), maxX = Math.max(...xs, 10), minZ = Math.min(...zs, -5), maxZ = Math.max(...zs, 5);
    return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }, [modules]);
  // Fit to the construction and active operation; perimeter labels remain secondary.
  const siteMinX = Math.min(extents.minX, pickup[0] - 8, crane?.position[0] ?? 0);
  const siteMaxX = Math.max(extents.maxX, pickup[0] + 5, crane?.position[0] ?? 0);
  const siteMinZ = Math.min(extents.minZ, pickup[2] - 3, crane?.position[2] ?? 0);
  const siteMaxZ = Math.max(extents.maxZ, pickup[2] + 3, crane?.position[2] ?? 0);
  const center: Vec3 = [(siteMinX + siteMaxX) / 2, 4.2, (siteMinZ + siteMaxZ) / 2];
  const span: Vec3 = [siteMaxX - siteMinX, 17, siteMaxZ - siteMinZ];
  const visibleTrucks = schedule.items.filter(item => time >= Math.max(0, item.arrival - 20) && time < item.positionStart + 3);
  const moduleRotation = (module: Module) => {
    const item = schedule.items.find(item => item.moduleId === module.id);
    const state = getModuleState(item, time);
    const final = module.rotation * Math.PI / 180;
    if (state === 'IN TRANSIT' || state === 'ON SITE') return Math.PI / 2;
    if (state === 'LIFTING' && item) return final + (Math.PI / 2 - final) * (1 - Math.min(1, (time - item.liftStart) / Math.max(1, (item.positionStart - item.liftStart) * 0.4)));
    return final;
  };
  const routeModule = selected ?? activeModule;
  const routeCraneId = schedule.items.find(item => item.moduleId === routeModule?.id)?.craneId;
  const routeCrane = project.cranes.find(item => item.id === routeCraneId) ?? crane;
  const route = useMemo(() => {
    if (!routeModule || isolatedId) return null;
    const travelHeight = Math.max(6, ...modules.map(module => module.position[1] + module.dimensions[1] + 2)) + routeModule.dimensions[1] / 2;
    const trajectory: Vec3[] = [pickup, [pickup[0], travelHeight, pickup[2]], [routeModule.position[0], travelHeight, routeModule.position[2]], [routeModule.position[0], routeModule.position[1] + routeModule.dimensions[1] / 2, routeModule.position[2]]];
    return <>
      <Line points={trajectory} color={'#b69b39'} dashed dashSize={0.35} gapSize={0.2} lineWidth={1.15} transparent opacity={0.7} />
      <Line points={[[routeCrane?.position[0] ?? 0, 0.15, routeCrane?.position[2] ?? 0], [routeModule.position[0], 0.15, routeModule.position[2]]]} color={'#b5a065'} dashed dashSize={0.24} gapSize={0.23} lineWidth={0.9} />
    </>;
  }, [routeModule, isolatedId, modules, pickup, routeCrane]);
  const terrain = useMemo(() => <>
    <color attach="background" args={[GROUND]} />
    <ambientLight intensity={0.9} />
    <hemisphereLight args={['#ffffff', '#b3bcaa', 1.8]} />
    <directionalLight position={[-24, 48, 20]} intensity={2.3} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-55} shadow-camera-right={55} shadow-camera-top={55} shadow-camera-bottom={-55} shadow-normalBias={0.06} shadow-bias={-0.00015} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow onClick={() => onSelect(null)}><planeGeometry args={[220, 220]} /><meshStandardMaterial color={GROUND} roughness={1} /></mesh>
    <gridHelper args={[160, 160, '#cdd2c8', '#dce0d7']} position={[0, 0, 0]} />
    <gridHelper args={[160, 32, '#c9d0c4', '#cdd4c8']} position={[0, 0.006, 0]} />
    <group position={[extents.cx, 0, extents.cz]}>
      <Box p={[0, 0.005, 0]} s={[extents.width + 0.5, 0.05, extents.depth + 0.5]} color={'#d7dcd2'} />
      <Line points={outline(extents.width + 1.1, extents.depth + 1.1, 0.09)} color={'#a2afa2'} lineWidth={0.8} />
    </group>
    {modules.filter(module => module.level === Math.min(...modules.map(m => m.level))).flatMap(module => [-1, 1].flatMap(x => [-1, 1].map(z => <Box key={`${module.id}-${x}-${z}`} p={[module.position[0] + x * (module.dimensions[0] / 2 - 0.25), 0.05, module.position[2] + z * (module.dimensions[2] / 2 - 0.25)]} s={[0.75, 0.12, 0.65]} color={'#b6bfb1'} />)))}
    {project.zones.map(zone => <SiteZone key={zone.id} zone={zone} showLabel={showLabels || mode.toUpperCase() === 'LOGISTICS'} />)}
    <Line points={[[extents.minX, 0.08, extents.minZ - 1.8], [extents.maxX, 0.08, extents.minZ - 1.8]]} color={'#8e9c8d'} lineWidth={0.7} />
    {[extents.minX, extents.maxX].map(x => <Line key={x} points={[[x, 0.08, extents.minZ - 2.3], [x, 0.08, extents.minZ - 1.3]]} color={'#8e9c8d'} lineWidth={0.8} />)}
    {showLabels && <Tag p={[extents.cx, 0.15, extents.minZ - 1.8]} quiet>{extents.width.toFixed(2)} m</Tag>}
  </>, [extents, modules, onSelect, project.zones, showLabels, mode]);
  return <>
    {terrain}
    {modules.filter(module => !hiddenIds.includes(module.id) && (!isolatedId || isolatedId === module.id)).map(module => {
      const item = schedule.items.find(item => item.moduleId === module.id);
      const state = getModuleState(item, time);
      const position = getModulePosition(module, item, time, project);
      const future = ['NOT READY', 'NOT_READY', 'READY'].includes(state);
      return future ? <FutureModule key={module.id} module={module} selected={selectedId === module.id} onSelect={onSelect} /> : <BuildingModule key={module.id} module={module} position={position} state={state} rotation={moduleRotation(module)} selected={selectedId === module.id} structure={structure} transparent={transparent} showLabel={showLabels} onSelect={onSelect} />;
    })}
    {route}
    {project.cranes.map((item, index) => {
      const task = schedule.items.find(task => task.craneId === item.id && time >= task.liftStart && time < task.release);
      const load = modules.find(module => module.id === task?.moduleId);
      const base = load ? getModulePosition(load, task, time, project) : undefined;
      const loadTarget: Vec3 = base && load ? [base[0], base[1] + load.dimensions[1] / 2, base[2]] : [pickup[0], 5, pickup[2]];
      return <CraneModel key={item.id} crane={item} position={item.position} target={loadTarget} load={load} loadRotation={load ? moduleRotation(load) : 0} showLabel={showLabels || mode.toUpperCase() === 'CRANE' || planning} planning={planning && index === 0} setDragging={setDragging} onMove={onCraneMove} />;
    })}
    {visibleTrucks.map(item => {
      const truckLoad = modules.find(module => module.id === item.moduleId);
      if (!truckLoad) return null;
      const approach = getModulePosition(truckLoad, item, Math.min(time, item.arrival), project);
      const departing = Math.max(0, Math.min(1, (time - item.positionStart) / 3));
      return <Truck key={item.moduleId} position={[approach[0], 0, approach[2] + departing * 24]} id={truckLoad.truckId} opacity={1 - departing * 0.85} />;
    })}
    {activeModule && activeState === 'FIXING' && <><Worker p={[activeModule.position[0] + activeModule.dimensions[0] / 2 - 0.65, activeModule.position[1], activeModule.position[2] - 0.8]} /><Worker p={[activeModule.position[0] + activeModule.dimensions[0] / 2 - 0.65, activeModule.position[1], activeModule.position[2] + 0.8]} /></>}
    <CameraRig view={view} center={center} span={span} geometryKey={geometryKey} dragging={dragging} />
  </>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 30, color: '#536159', textAlign: 'center', fontSize: 13 }}>No se pudo iniciar el visor 3D. Activá la aceleración gráfica del navegador. La planificación y la timeline siguen disponibles.</div> : this.props.children; }
}

export default function AssemblyScene(props: AssemblySceneProps) {
  return <SceneBoundary><Canvas orthographic shadows frameloop="demand" dpr={[1, 1.75]} camera={{ position: [48, 40, 48], zoom: 10, near: 0.1, far: 400 }} gl={{ antialias: true, alpha: false }} onPointerMissed={() => props.onSelect(null)} fallback={<div style={{ padding: 30, color: '#536159' }}>El visor necesita WebGL. La planificación permanece disponible.</div>}><SiteContent {...props} /></Canvas></SceneBoundary>;
}
