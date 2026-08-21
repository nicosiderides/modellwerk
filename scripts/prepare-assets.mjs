import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const copyIfExists = async (from, to) => {
  if (!existsSync(from)) return;
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true, force: true });
};

await Promise.all([
  copyIfExists(
    path.join(root, "node_modules", "three", "examples", "jsm", "libs", "draco", "gltf"),
    path.join(root, "public", "draco")
  ),
  copyIfExists(
    path.join(root, "node_modules", "three", "examples", "jsm", "libs", "basis"),
    path.join(root, "public", "basis")
  )
]);
