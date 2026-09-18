import type { KeyboardControlsEntry } from "@react-three/drei";

export type FactoryKeyboardControl =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "up"
  | "down"
  | "boost";

export const factoryKeyboardMap: KeyboardControlsEntry<FactoryKeyboardControl>[] = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "back", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "up", keys: ["KeyE", "Space"] },
  { name: "down", keys: ["KeyQ", "ShiftLeft"] },
  { name: "boost", keys: ["ShiftRight"] },
];
