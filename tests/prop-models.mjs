import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { depotSolidFootprints, overlapsFootprint } from '../src/game/slice/DepotClearance.ts';
import { SHIFT_LAYOUT } from '../src/game/slice/ShiftModel.ts';
import { DEPOT_DRESSING } from '../src/three/depotDressing.ts';
import { PROP_MODELS } from '../src/three/propModels.ts';

const file = (id) => new URL(`../public/models/props/${id}.glb`, import.meta.url);

/** The JSON chunk and binary chunk of a GLB. */
function readGlb(id) {
  const data = readFileSync(file(id));
  assert.equal(data.toString('latin1', 0, 4), 'glTF', `${id}: GLB magic`);
  assert.equal(data.readUInt32LE(4), 2, `${id}: glTF 2.0`);
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
  const binary = data.subarray(20 + jsonLength + 8);
  return { json, binary };
}

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(bytes) {
  assert.ok(bytes[0] === 0xff && bytes[1] === 0xd8, 'JPEG start');
  for (let at = 2; at < bytes.length;) {
    const marker = bytes[at + 1];
    const length = bytes.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    at += 2 + length;
  }
  throw new Error('no JPEG frame');
}

/** Largest value of each normalized integer component type (KHR_mesh_quantization). */
const NORMALIZED = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

/** The model's bounds in its own space, from accessor bounds and node transforms. */
function modelBounds({ json }) {
  const bounds = new THREE.Box3();
  const visit = (index, parent) => {
    const node = json.nodes[index];
    const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
      new THREE.Vector3(...(node.translation ?? [0, 0, 0])),
      new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
      new THREE.Vector3(...(node.scale ?? [1, 1, 1])),
    );
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        const { min, max, normalized, componentType } = json.accessors[primitive.attributes.POSITION];
        const scale = normalized ? 1 / NORMALIZED[componentType] : 1;
        const box = new THREE.Box3(new THREE.Vector3(...min).multiplyScalar(scale), new THREE.Vector3(...max).multiplyScalar(scale));
        bounds.union(box.applyMatrix4(world));
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const index of json.scenes[json.scene ?? 0].nodes) visit(index, new THREE.Matrix4());
  return bounds;
}

test('every prop model is a small GLB with plain glTF PBR and downsized JPEG textures', () => {
  for (const [id, source] of Object.entries(PROP_MODELS)) {
    const bytes = statSync(file(id)).size;
    assert.ok(bytes < 1024 * 1024, `${id}: ${bytes} bytes is under 1 MB`);
    const glb = readGlb(id);
    const { json, binary } = glb;
    assert.ok(json.meshes.length > 0, `${id}: has meshes`);
    for (const extension of json.extensionsUsed ?? []) {
      assert.ok(['KHR_mesh_quantization', 'KHR_materials_emissive_strength'].includes(extension), `${id}: ${extension} is supported without decoders`);
    }
    assert.ok(json.materials.every((material) => !material.extensions?.KHR_materials_transmission), `${id}: no transmission pass`);
    for (const image of json.images ?? []) {
      assert.equal(image.mimeType, 'image/jpeg', `${id}: JPEG textures`);
      const view = json.bufferViews[image.bufferView];
      const size = jpegSize(binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
      assert.ok(Math.max(size.width, size.height) <= source.textureSize, `${id}: textures at most ${source.textureSize} px`);
    }
    const extent = modelBounds(glb).getSize(new THREE.Vector3());
    assert.ok(extent.y > 0.1 && extent.y < 2.5, `${id}: real-world height (${extent.y.toFixed(2)} m)`);
  }
});

test('depot dressing stands in the front corners, clear of the platform, trucks and every route', () => {
  const metres = 1 / 32;
  const solids = depotSolidFootprints();
  const sizes = Object.fromEntries(Object.keys(PROP_MODELS).map((id) => [id, modelBounds(readGlb(id)).getSize(new THREE.Vector3())]));
  const footprints = DEPOT_DRESSING.map((item) => {
    // The turned model's axis-aligned footprint, in model pixels.
    const { x: w, z: d } = sizes[item.id];
    const c = Math.abs(Math.cos(item.turn));
    const s = Math.abs(Math.sin(item.turn));
    return { ...item, width: (w * c + d * s) / metres, height: (w * s + d * c) / metres };
  });
  for (const item of footprints) {
    const label = `${item.id} at ${item.x},${item.y}`;
    // Inside the side walls' inner faces (±15.14 m) and in front of the receiving wall.
    assert.ok(item.x - item.width / 2 >= 480 - 15.14 / metres && item.x + item.width / 2 <= 480 + 15.14 / metres, `${label}: inside the side walls`);
    assert.ok(item.y - item.height / 2 >= SHIFT_LAYOUT.worldTop, `${label}: in front of the receiving wall`);
    // Off the raised platform and its stairs, ahead of the feeder conveyors' foot (y -150).
    assert.ok(item.x + item.width / 2 <= SHIFT_LAYOUT.platform.left || item.x - item.width / 2 >= SHIFT_LAYOUT.platform.right, `${label}: off the platform`);
    assert.ok(item.y + item.height / 2 <= -150, `${label}: in the front corner`);
    // Clear of every truck (including its drive-out lane to the side wall), the crew homes and visitors.
    assert.ok(solids.every((rect) => !overlapsFootprint(item, 0, { ...rect, width: rect.width + item.width, height: rect.height + item.height })), `${label}: clear of solid scenery`);
    const firstTruckRow = Math.min(...solids.filter((rect) => rect.height === SHIFT_LAYOUT.truckDepth).map((rect) => rect.y - rect.height / 2));
    assert.ok(item.y + item.height / 2 < firstTruckRow - 2 * SHIFT_LAYOUT.workerRadius, `${label}: a worker's width before the first truck row`);
  }
  // Pieces may touch but never pass through each other.
  for (const [i, a] of footprints.entries()) {
    for (const b of footprints.slice(i + 1)) {
      const apart = Math.abs(a.x - b.x) >= (a.width + b.width) / 2 - 1 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2 - 1;
      assert.ok(apart, `${a.id} at ${a.x},${a.y} and ${b.id} at ${b.x},${b.y} do not overlap`);
    }
  }
});
