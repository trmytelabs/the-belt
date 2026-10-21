import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { plantFeet } from '../src/three/footing.ts';
import { BODY } from '../src/three/figure.ts';
import { CLIP_SPANS, ROCKETBOX_CLIPS } from '../src/three/rocketboxClips.ts';
import { LIFT_SECONDS } from '../src/three/characterModels.ts';
import { DEPOT_3D_LAYOUT, platformLevelAt } from '../src/three/layout.ts';

// Feet planted on the stairs, and the lift's crouch clips.

/** The figure's pivots as `createCharacter` lays them out, without its meshes. */
function figure() {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  root.add(body); body.add(head); head.position.y = BODY.neckY;
  const side = (sign) => {
    const arm = new THREE.Group(); arm.position.set(sign * BODY.shoulderX, BODY.shoulderY, 0); body.add(arm);
    const forearm = new THREE.Group(); forearm.position.y = -BODY.upperArm; arm.add(forearm);
    const hand = new THREE.Group(); hand.position.y = -BODY.forearm; forearm.add(hand);
    const leg = new THREE.Group(); leg.position.set(sign * BODY.hipX, BODY.hipY, 0); body.add(leg);
    const shin = new THREE.Group(); shin.position.y = -BODY.thigh; leg.add(shin);
    return { arm, forearm, hand, leg, shin };
  };
  const l = side(-1), r = side(1);
  return { root, body, head, leftArm: l.arm, rightArm: r.arm, leftForearm: l.forearm, rightForearm: r.forearm, leftHand: l.hand, rightHand: r.hand,
    leftLeg: l.leg, rightLeg: r.leg, leftShin: l.shin, rightShin: r.shin, motion: { stairs: false } };
}
const ankle = (shin) => shin.localToWorld(new THREE.Vector3(0, -BODY.shin, 0));

test('on a flat floor the feet are left to the walk cycle', () => {
  const person = figure();
  person.root.position.set(1, 0.4, 2);
  person.leftLeg.rotation.x = 0.5; person.rightLeg.rotation.x = -0.5; person.leftShin.rotation.x = 0.6;
  const before = [person.leftLeg.quaternion.clone(), person.leftShin.rotation.x];
  assert.equal(plantFeet(person, () => 0.4), false);
  assert.ok(person.leftLeg.quaternion.equals(before[0]) && person.leftShin.rotation.x === before[1], 'nothing moved');
  assert.equal(person.motion.stairs, false);
});

test('on a flight the uphill foot bends to its tread and the downhill foot reaches down, each keeping its place', () => {
  const person = figure();
  // Facing +z (the figure's forward) with the root on a middle tread; treads rise 0.12 m every 0.3 m ahead,
  // as the depot's flights do, and the legs are mid-stride with bent knees.
  person.root.position.set(0, 0.6, 0);
  person.leftLeg.rotation.x = -0.45; person.rightLeg.rotation.x = 0.3; person.leftShin.rotation.x = 0.5; person.rightShin.rotation.x = 0.35;
  const treads = (x, z) => 0.6 + Math.floor(z / 0.3 + 0.5) * 0.12;
  person.root.updateWorldMatrix(true, true);
  const beforeL = ankle(person.leftShin), beforeR = ankle(person.rightShin);
  assert.equal(plantFeet(person, treads), true);
  assert.equal(person.motion.stairs, true);
  person.root.updateWorldMatrix(true, true);
  for (const [shin, before] of [[person.leftShin, beforeL], [person.rightShin, beforeR]]) {
    const after = ankle(shin);
    // The solver stops a millimetre short of a straight leg, so a foot may slide a hair.
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.005, `the foot keeps its x and z: ${before.toArray().map(v => v.toFixed(3))} -> ${after.toArray().map(v => v.toFixed(3))}`);
    const ground = treads(after.x, after.z);
    assert.ok(Math.abs(after.y - (ground + 0.05)) < 0.005 || after.y > ground + 0.14, `the ankle stands on its tread or keeps its swing: ${after.y.toFixed(3)} over ${ground}`);
  }
  // The forward (uphill) foot stands higher than the trailing one.
  assert.ok(ankle(person.leftShin).y > ankle(person.rightShin).y);
});

test('a swinging foot keeps its lift rather than slamming onto the tread', () => {
  const person = figure();
  person.root.position.set(0, 0.6, 0);
  // The left leg swings forward and high; the right stands.
  person.leftLeg.rotation.x = -0.9; person.leftShin.rotation.x = 1.4; person.rightLeg.rotation.x = 0.2;
  person.root.updateWorldMatrix(true, true);
  const lifted = ankle(person.leftShin).y - person.root.position.y;
  const treads = (x, z) => 0.6 + (z > 0.15 ? 0.2 : 0);
  assert.equal(plantFeet(person, treads), true);
  person.root.updateWorldMatrix(true, true);
  const after = ankle(person.leftShin);
  assert.ok(Math.abs(after.y - (treads(after.x, after.z) + lifted)) < 1e-6, 'the swing foot carries its lift over the tread under it');
});

test('the depot surface under a world point follows its depot pixel, stairs included', () => {
  // The game maps a world point to its depot pixel (x × 32 + 480, z × 32 + 340) before asking the layout;
  // the lower floor, the deck, and treads part way down the left flight.
  const { platform, stairs } = DEPOT_3D_LAYOUT;
  const surface = (x, z) => platformLevelAt(x * 32 + 480, z * 32 + 340);
  const toWorld = (px, py) => [(px - 480) / 32, (py - 340) / 32];
  const { lowerFloor } = DEPOT_3D_LAYOUT;
  assert.equal(surface(...toWorld((lowerFloor.left.minX + lowerFloor.left.maxX) / 2, stairs.centerY)), 0, 'the lower floor');
  assert.ok(surface(...toWorld((platform.left + platform.right) / 2, (platform.top + platform.bottom) / 2)) >= 1, 'the deck');
  const flight = stairs.left;
  const heights = [0.15, 0.5, 0.85].map((f) => surface(...toWorld(flight.topX + (flight.bottomX - flight.topX) * f, stairs.centerY)));
  assert.ok(heights[0] > heights[1] && heights[1] > heights[2] && heights[2] > 0, `treads step down the flight: ${heights.map((h) => h.toFixed(2))}`);
});

test('the crouch clips exist for both bodies with their motion spans inside the clips', () => {
  for (const role of ['crouchIn', 'crouchOut']) {
    const source = ROCKETBOX_CLIPS.find((c) => c.role === role);
    assert.ok(source && !source.loop, `${role} is a one-shot clip`);
    for (const name of [`m_${role}`, `f_${role}`]) {
      const span = CLIP_SPANS[name];
      assert.ok(span && span[0] >= 0 && span[1] > span[0] && span[1] <= 5, `${name} has a motion span: ${span}`);
    }
  }
  assert.ok(LIFT_SECONDS > 0.5 && LIFT_SECONDS < 2, 'a lift takes under two seconds on a model');
});
