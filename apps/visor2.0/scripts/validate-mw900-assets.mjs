import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3, Mesh, Vector3 } from "three";

const loader = new GLTFLoader();
for (const [file, expected] of [
  ["structure", 216],
  ["product", 224],
]) {
  const bytes = readFileSync(`public/models/mw900/configurable/${file}.glb`);
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  gltf.scene.updateMatrixWorld(true);
  let count = 0,
    semantics = 0;
  gltf.scene.traverse((o) => {
    if (o instanceof Mesh) {
      count++;
      if (o.userData.mw_id || o.userData.mw_part_id) semantics++;
    }
  });
  assert.equal(count, expected, `${file}: unexpected source/helper mesh exported`);
  assert.equal(semantics, count, `${file}: missing semantic IDs`);
  const bounds = new Box3().setFromObject(gltf.scene),
    size = bounds.getSize(new Vector3());
  assert.ok(
    Math.abs(size.x - 9) < 0.00001 &&
      Math.abs(size.y - 2.8) < 0.00001 &&
      Math.abs(size.z - 3) < 0.00001,
    `${file}: dimensional drift ${size.toArray()}`,
  );
  assert.ok(Math.abs(bounds.min.y) < 0.00001, `${file}: incorrect vertical datum`);
  console.log(`${file}: ${count} semantic meshes; 9 × 2.8 × 3 m in Three.js; datum verified.`);
}
