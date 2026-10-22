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

test('beside a building in a tight turn, the camera rises over the vehicle rather than stop inside the wall or drop onto the roof', () => {
  // The wall's padded face is 3 m from the roof, inside the 3.5 m minimum: held there, the camera would be in the building.
  const wall = blocker(-11.75, 0, 16.5, 10, 30, 0.5), roof = v(0, 3.6, 0);
  const camera = v(-9, 4.5, 0);
  assert.equal(pullClear(roof, camera, [wall], 0.4, 3.5), true);
  assert.equal(wall.containsPoint(camera), false, `out of the wall: ${camera.toArray()}`);
  assert.ok(Math.abs(camera.distanceTo(roof) - 3.5) < 1e-9, `still the minimum away: ${camera.distanceTo(roof)}`);
  assert.ok(camera.y > 5.5 && camera.y < 6.2 && camera.x < 0 && camera.x > -3, `up behind the truck, no steeper than about 45 degrees: ${camera.toArray()}`);
  // Under an overhang no height is clear: it holds the minimum (in the wall's padding at worst) and never drops onto the roof.
  const overhang = new THREE.Box3(v(-20, 5, -10), v(20, 30, 10));
  const tucked = v(-9, 4.5, 0);
  pullClear(roof, tucked, [wall, overhang], 0.4, 3.5);
  assert.ok(Math.abs(tucked.distanceTo(roof) - 3.5) < 1e-9, `held at the minimum: ${tucked.toArray()}`);
  // A lamp post whose padding takes in the roof itself blocks every height; the camera still never drops onto the roof.
  const lamp = blocker(-0.5, 0, 0.4, 0.4, 8, 0.9);
  const scraping = v(-9, 4.5, 0);
  pullClear(roof, scraping, [lamp], 0.4, 3.5);
  assert.ok(Math.abs(scraping.distanceTo(roof) - 3.5) < 1e-9, `not on the roof: ${scraping.toArray()}`);
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

/** True when the line from `a` to `b` misses `box`. */
const clearLine = (a, b, box) => new THREE.Ray(a, b.clone().sub(a).normalize()).intersectBox(box, v(0, 0, 0)) === null
  || new THREE.Ray(a, b.clone().sub(a).normalize()).intersectBox(box, v(0, 0, 0)).distanceTo(a) > a.distanceTo(b);

test('a lamp post just behind the vehicle, too tall to crane over, swings the camera round the truck, not behind the pole or nearer the roof', () => {
  // As CI's driving check found it: 3.5 m behind the roof is half a metre from the pole, inside its padding.
  const roof = v(0, 3.6, 0), lamp = blocker(-3.3, 0.1, 0.4, 0.4, 8, 0.9);
  const camera = v(-9, 4.5, 0.3);
  assert.equal(pullClear(roof, camera, [lamp], 0.4, 3.5), true);
  assert.equal(lamp.containsPoint(camera), false, `out of the pole's padding: ${camera.toArray()}`);
  assert.ok(Math.abs(camera.distanceTo(roof) - 3.5) < 1e-9, `the minimum away: ${camera.distanceTo(roof)}`);
  assert.ok(clearLine(roof, camera, lamp), `the pole is not between the camera and the truck: ${camera.toArray()}`);
  assert.ok(camera.x < -2.5, `still behind the truck: ${camera.toArray()}`);
});

test('scraping along a low wall, the camera swings round to the open side rather than sit inside the building', () => {
  // As the stress probe found it: the roof a third of a metre off a 5 m building's padding, too close for any crane angle.
  const roof = v(0, 3.6, 0), building = blocker(0, 9.06, 17, 16, 5, 0.7);
  const camera = v(-8, 4.5, 2.4);
  assert.equal(pullClear(roof, camera, [building], 0.4, 3.5), true);
  assert.equal(building.containsPoint(camera), false, `out of the building: ${camera.toArray()}`);
  assert.ok(clearLine(roof, camera, building) && camera.z < 0.36, `on the road side of the truck: ${camera.toArray()}`);
  assert.ok(Math.abs(camera.distanceTo(roof) - 3.5) < 1e-9);
  // A box round the roof itself leaves nowhere to go: the camera holds the minimum.
  const hemmed = new THREE.Box3(v(-20, -1, -20), v(20, 30, 20)), held = v(-9, 4.5, 0);
  pullClear(roof, held, [hemmed], 0.4, 3.5);
  assert.ok(Math.abs(held.distanceTo(roof) - 3.5) < 1e-9, `held at the minimum: ${held.toArray()}`);
});
