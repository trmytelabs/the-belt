import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { mergeStatic } from '../src/three/merge.ts';
import { physicalBounds } from '../src/three/collision3d.ts';

test('nested static merges preserve existing vertex colours and world placement', () => {
  const root = new THREE.Group();
  root.position.x = 10;
  const part = new THREE.Group();
  part.position.x = 2;
  root.add(part);
  for (const [color, x] of [[0xff0000, -1], [0x0000ff, 1]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color }));
    mesh.position.x = x;
    part.add(mesh);
  }
  mergeStatic(part);
  const before = physicalBounds(root).clone();
  mergeStatic(root);
  assert.deepEqual(physicalBounds(root), before);
  const meshes = [];
  root.traverse(object => { if (object.isMesh) meshes.push(object); });
  assert.equal(meshes.length, 1);
  const colors = meshes[0].geometry.getAttribute('color');
  const palette = new Set();
  for (let i = 0; i < colors.count; i += 1) palette.add(`${colors.getX(i)},${colors.getY(i)},${colors.getZ(i)}`);
  assert.deepEqual(palette, new Set(['1,0,0', '0,0,1']));
});

test('physical bounds ignore labels, decals, and hidden parent subtrees after a merge', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const solid = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  root.add(solid);
  const label = new THREE.Sprite();
  label.position.y = 20;
  label.scale.set(40, 20, 1);
  root.add(label);
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material);
  decal.userData.solid = false;
  root.add(decal);
  const hidden = new THREE.Group();
  hidden.visible = false;
  hidden.add(new THREE.Mesh(new THREE.BoxGeometry(200, 200, 200), material));
  root.add(hidden);
  mergeStatic(root);
  const bounds = physicalBounds(root);
  assert.deepEqual(bounds.min.toArray(), [-1, -1, -1]);
  assert.deepEqual(bounds.max.toArray(), [1, 1, 1]);
});

test('instanced bounds inspect only active freight slots', () => {
  const pile = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 2);
  pile.position.x = 10;
  pile.setMatrixAt(0, new THREE.Matrix4().makeTranslation(2, 1, 0));
  pile.setMatrixAt(1, new THREE.Matrix4().makeTranslation(100, 1, 0));
  pile.count = 1;
  const bounds = physicalBounds(pile);
  assert.deepEqual(bounds.min.toArray(), [11.5, 0.5, -0.5]);
  assert.deepEqual(bounds.max.toArray(), [12.5, 1.5, 0.5]);
  pile.count = 0;
  assert.equal(physicalBounds(pile).isEmpty(), true);
});
