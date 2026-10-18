import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { disposeObject3D } from '../src/three/resources.ts';

test('owned scene cleanup releases geometry, shared materials and label maps exactly once', () => {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const counts = { geometry: 0, material: 0, texture: 0, spriteGeometry: 0, spriteMaterial: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  sprite.geometry.addEventListener('dispose', () => counts.spriteGeometry++);
  sprite.material.addEventListener('dispose', () => counts.spriteMaterial++);
  root.add(sprite);
  disposeObject3D(root);
  assert.equal(root.parent, null);
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1, spriteGeometry: 0, spriteMaterial: 1 });
});
