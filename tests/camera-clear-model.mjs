import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { blocker, pullClear } from '../src/three/cameraClear.ts';

// The chase camera stays out of the scenery.

const v = (x, y, z) => new THREE.Vector3(x, y, z);

test('a camera with a clear line to the vehicle is left alone', () => {
  const camera = v(-9, 4.5, 0);
  assert.equal(pullClear(v(0, 2, 0), camera, [blocker(20, 0, 15, 16, 30, 0.6)]), false);
  assert.deepEqual(camera.toArray(), [-9, 4.5, 0]);
});

test('a building between the vehicle and the camera pulls the camera to its near face, less the margin', () => {
  const camera = v(-20, 4.5, 0);
  const moved = pullClear(v(0, 2, 0), camera, [blocker(-14, 0, 4, 10, 30, 0.5)], 0.4);
  assert.equal(moved, true);
  // The padded box starts at x = -11.5; the camera stops 0.4 before it along the line, so just inside -11.5.
  assert.ok(camera.x > -11.5 && camera.x < -11.0, `pulled to the near face: ${camera.x}`);
  assert.ok(camera.y < 4.5 && camera.y > 2, 'and down along the line of sight');
});

test('a camera inside a building comes out to the side facing the vehicle', () => {
  const camera = v(-13, 4.5, 0);
  assert.equal(pullClear(v(0, 2, 0), camera, [blocker(-14, 0, 6, 10, 30, 0.5)]), true);
  assert.ok(camera.x > -10.5 && camera.x < -10.0, `out past the near face: ${camera.x}`);
});

test('the nearest of several blockers decides, a lamp post counts, and something behind the camera does not', () => {
  const camera = v(-18, 4.5, 0);
  const lamp = blocker(-8, 0, 0.3, 0.3, 7.5, 0.4);
  const building = blocker(-14, 0, 4, 10, 30, 0.5);
  const behind = blocker(-30, 0, 4, 4, 30, 0.5);
  pullClear(v(0, 2, 0), camera, [behind, building, lamp]);
  assert.ok(camera.x > -8 && camera.x < -7, `stopped at the lamp post: ${camera.x}`);
  const clear = v(-9, 4.5, 0);
  assert.equal(pullClear(v(0, 2, 0), clear, [behind]), false, 'a box behind the camera is not in the way');
});

test('a short lamp below the line of sight is passed over', () => {
  const camera = v(-18, 6, 0);
  assert.equal(pullClear(v(0, 5, 0), camera, [blocker(-9, 0, 0.3, 0.3, 3, 0.4)]), false);
});

test('beside a building in a tight turn, the camera comes nearer than its minimum rather than stop inside the wall', () => {
  // The wall's padded face is 2.5 m from the roof, inside the 3.5 m minimum: held there, the camera would be in the building.
  const wall = blocker(-11.5, 0, 17, 10, 30, 0.5);
  const camera = v(-9, 4.5, 0);
  assert.equal(pullClear(v(0, 3.6, 0), camera, [wall], 0.4, 3.5), true);
  assert.equal(wall.containsPoint(camera), false, `out of the wall: ${camera.toArray()}`);
  assert.ok(camera.x > -2.5 && camera.x < -1.5, `just short of its face, less the margin: ${camera.x}`);
  // With room to spare, the minimum still holds.
  const far = blocker(-14, 0, 4, 10, 30, 0.5);
  const roomy = v(-20, 4.5, 0);
  pullClear(v(0, 3.6, 0), roomy, [far], 0.4, 3.5);
  assert.ok(roomy.x < -10.9, `held well out: ${roomy.x}`);
  const near = blocker(-5, 0, 2, 10, 30, 0.5);
  const held = v(-9, 4.5, 0);
  pullClear(v(0, 3.6, 0), held, [near], 0.4, 3.5);
  assert.ok(Math.abs(held.distanceTo(v(0, 3.6, 0)) - 3.5) < 1e-9 && !near.containsPoint(held), 'kept at the minimum when that is clear');
});
