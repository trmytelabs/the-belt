import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import * as THREE from 'three';

import { mergeStatic } from '../src/three/merge.ts';
import { disposeObject3D } from '../src/three/resources.ts';
import { boxUVs, cardboardMaterial, scaleUVs, surfaceMaterial } from '../src/three/textures.ts';

const TEXTURES = 'public/textures';
const SURFACES = ['concrete', 'rubber', 'steel', 'paint', 'cardboard', 'asphalt', 'snowpack', 'brick', 'plaster', 'siding', 'wood'];
const MAPS = ['color', 'normal', 'arm'];

test('every surface ships three small WebP maps, each recorded with its source and licence', () => {
  const files = readdirSync(TEXTURES).sort();
  const expected = SURFACES.flatMap((surface) => MAPS.map((map) => `${surface}_${map}.webp`)).sort();
  assert.deepEqual(files, expected);
  const total = files.reduce((sum, file) => sum + statSync(join(TEXTURES, file)).size, 0);
  // About 1.5 MB today; a phone-sized budget that a 2K or PNG export would break.
  assert.ok(total < 2 * 1024 * 1024, `textures total ${total} bytes`);
  for (const file of files) {
    const bytes = readFileSync(join(TEXTURES, file));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${file} is a RIFF container`);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `${file} is WebP`);
  }
  const doc = readFileSync('docs/textures.md', 'utf8');
  for (const file of files) assert.ok(doc.includes(file), `docs/textures.md lists ${file}`);
  for (const source of ['concrete_floor_worn_001', 'Rubber004', 'Metal038', 'PaintedMetal001', 'Cardboard004', 'asphalt_snow', 'snow_floor',
    'red_brick_03', 'beige_wall_001', 'corrugated_iron_02', 'wood_floor']) {
    assert.ok(doc.includes(source), `docs/textures.md credits ${source}`);
  }
  assert.ok(doc.includes('CC0'), 'docs/textures.md states the licence');
});

test('without loaded textures, surface materials are the flat materials they replace', () => {
  const steel = surfaceMaterial('steel', { color: 0x5d6a70, roughness: 0.38, metalness: 0.75 });
  assert.equal(steel.color.getHex(), 0x5d6a70);
  assert.equal(steel.roughness, 0.38);
  assert.equal(steel.metalness, 0.75);
  assert.equal(steel.map, null);
  assert.equal(steel.normalMap, null);
  // Identical requests share one material, so their meshes can still merge.
  assert.equal(surfaceMaterial('steel', { color: 0x5d6a70, roughness: 0.38, metalness: 0.75 }), steel);
  assert.equal(cardboardMaterial(0xb8875a), cardboardMaterial(0xb8875a));
  assert.notEqual(cardboardMaterial(0xb8875a), cardboardMaterial(0xa47650));
  const glowing = surfaceMaterial('paint', { color: 0xe0b23c, roughness: 0.4, emissive: 0x3a2a08, emissiveIntensity: 0.4 });
  assert.equal(glowing.emissive.getHex(), 0x3a2a08);
  assert.equal(glowing.emissiveIntensity, 0.4);
});

test('static merges keep meshes with different relief maps apart and join identical ones', () => {
  const root = new THREE.Group();
  const scratched = new THREE.Texture();
  const dented = new THREE.Texture();
  const paint = (normalMap) => new THREE.MeshStandardMaterial({ color: 0x4f8fc0, roughness: 0.6, normalMap });
  const box = (material, x) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.position.x = x;
    root.add(mesh);
  };
  const scratchedPaint = paint(scratched);
  box(scratchedPaint, 0);
  box(scratchedPaint, 2);
  box(paint(dented), 4);
  box(new THREE.MeshStandardMaterial({ color: 0x4f8fc0, roughness: 0.6, roughnessMap: scratched }), 6);
  mergeStatic(root);
  const merged = root.children.filter((child) => child.name === 'merged');
  assert.equal(merged.length, 3, 'scratched, dented and roughness-mapped paint are separate draws');
  const normalMaps = merged.map((mesh) => mesh.material.normalMap);
  assert.ok(normalMaps.includes(scratched) && normalMaps.includes(dented));
  const scratchedDraw = merged.find((mesh) => mesh.material.normalMap === scratched);
  assert.equal(scratchedDraw.geometry.attributes.position.count, 72, 'the two scratched boxes share one draw');
  assert.ok(scratchedDraw.geometry.attributes.uv, 'merged geometry keeps its UVs');
});

test('disposing an owned subtree keeps shared surface textures loaded', () => {
  const shared = new THREE.Texture();
  shared.userData.shared = true;
  const owned = new THREE.Texture();
  const counts = { shared: 0, owned: 0 };
  shared.addEventListener('dispose', () => counts.shared++);
  owned.addEventListener('dispose', () => counts.owned++);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: owned, normalMap: shared, roughnessMap: shared })));
  disposeObject3D(root);
  assert.deepEqual(counts, { shared: 0, owned: 1 });
});

test('surface UVs span a fixed real-world tile size whatever the mesh size', () => {
  const uvRange = (geometry, from, to) => {
    const uv = geometry.getAttribute('uv');
    const values = [];
    for (let i = from; i < to; i += 1) values.push([uv.getX(i), uv.getY(i)]);
    const span = (axis) => Math.max(...values.map((v) => v[axis])) - Math.min(...values.map((v) => v[axis]));
    return [span(0), span(1)];
  };
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z with four vertices each.
  const deck = boxUVs(new THREE.BoxGeometry(6, 1.1, 12), 3);
  assert.deepEqual(uvRange(deck, 8, 12).map((v) => +v.toFixed(3)), [2, 4], 'top: 6 m by 12 m at 3 m a tile');
  assert.deepEqual(uvRange(deck, 0, 4).map((v) => +v.toFixed(3)), [4, 0.367], 'side: 12 m by 1.1 m');
  const plane = scaleUVs(new THREE.PlaneGeometry(40, 30), 40 / 3, 30 / 3);
  assert.deepEqual(uvRange(plane, 0, 4).map((v) => +v.toFixed(3)), [13.333, 10]);
});
