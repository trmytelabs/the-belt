import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { STEP_GAP, footfall } from '../src/three/footsteps.ts';
import { LOOK_CONE, PASSING_RANGE, VOICE_RANGE, bearingOf, gazeInFigureFrame, lookTargetFor } from '../src/three/attention.ts';
import { BODY } from '../src/three/figure.ts';
import { lookToward } from '../src/three/attention.ts';

// Footfalls read off the feet, and who the crew look at.

/** The figure's pivots as `createCharacter` lays them out, without its meshes. */
function figure(scale = 1) {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  root.add(body); body.add(head); head.position.y = BODY.neckY; root.scale.setScalar(scale);
  const side = (sign) => {
    const leg = new THREE.Group(); leg.position.set(sign * BODY.hipX, BODY.hipY, 0); body.add(leg);
    const shin = new THREE.Group(); shin.position.y = -BODY.thigh; leg.add(shin);
    return { leg, shin };
  };
  const l = side(-1), r = side(1);
  return { root, body, head, leftLeg: l.leg, rightLeg: r.leg, leftShin: l.shin, rightShin: r.shin, headHeight: 1.85 * scale, motion: { moving: true } };
}

/** Walks the figure for `seconds` at 60 fps with a sine gait, feeding each frame to the detector; returns the footfalls with their times. */
function walk(person, seconds, { stairsPerMetre = 0, speed = 1.2 } = {}) {
  const falls = [];
  let time = 10;
  for (let i = 0; i < seconds * 60; i++) {
    time += 1 / 60;
    const phase = time * 9 * speed;
    person.root.position.z += speed / 60;
    person.root.position.y = Math.floor(person.root.position.z * stairsPerMetre) * 0.12;
    // The forward leg swings ahead and the knee lifts the trailing foot on its way through.
    person.leftLeg.rotation.x = Math.sin(phase) * 0.5; person.rightLeg.rotation.x = -Math.sin(phase) * 0.5;
    person.leftShin.rotation.x = Math.max(0, -Math.cos(phase)) * 0.9; person.rightShin.rotation.x = Math.max(0, Math.cos(phase)) * 0.9;
    person.root.updateWorldMatrix(true, true);
    const foot = footfall(person, null, time);
    if (foot) falls.push({ foot, time });
  }
  return falls;
}

test("a walking figure lands alternate feet at the gait's cadence, never two within the step gap", () => {
  const falls = walk(figure(), 4);
  assert.ok(falls.length >= 10 && falls.length <= 16, `about two falls a second over four seconds: ${falls.length}`);
  for (let i = 1; i < falls.length; i++) {
    assert.notEqual(falls[i].foot, falls[i - 1].foot, 'the feet alternate');
    assert.ok(falls[i].time - falls[i - 1].time >= STEP_GAP - 1e-9, 'never two footfalls within the step gap');
  }
});

test('standing still, or a frame whose matrices did not change, lands no foot', () => {
  const person = figure();
  person.root.updateWorldMatrix(true, true);
  let time = 10;
  for (let i = 0; i < 120; i++) { time += 1 / 60; assert.equal(footfall(person, null, time), null); }
  // A step frozen mid-air (the renderer skipped its draw, so nothing moved) is not a landing.
  person.leftLeg.rotation.x = -0.6; person.leftShin.rotation.x = 1.2; person.root.updateWorldMatrix(true, true);
  time += 1 / 60; footfall(person, null, time);
  for (let i = 0; i < 10; i++) { time += 1 / 60; assert.equal(footfall(person, null, time), null, 'an unchanged foot is skipped'); }
});

test('footfalls follow the feet up a flight of stairs and scale with a small figure', () => {
  const climbing = walk(figure(), 4, { stairsPerMetre: 3 });
  assert.ok(climbing.length >= 8, `the stairs still count their steps: ${climbing.length}`);
  const small = walk(figure(0.78), 4);
  assert.ok(small.length >= 10, `a 0.78-scale figure's shorter lifts still land: ${small.length}`);
});

test("model foot bones are read in place of the figure's ankles when given", () => {
  const person = figure();
  const left = new THREE.Object3D(), right = new THREE.Object3D();
  person.root.add(left, right);
  let time = 10, falls = 0;
  for (let i = 0; i < 180; i++) {
    time += 1 / 60;
    const phase = time * 9;
    left.position.y = Math.max(0, Math.sin(phase)) * 0.12; right.position.y = Math.max(0, -Math.sin(phase)) * 0.12;
    person.root.updateWorldMatrix(true, true);
    if (footfall(person, [left, right], time)) falls += 1;
  }
  assert.ok(falls >= 6 && falls <= 10, `the bones' own lifts are counted: ${falls}`);
});

test('a voice in earshot wins over a passing worker, which wins over nothing; far, behind and self are ignored', () => {
  const self = { id: 'hussan', x: 0, z: 0, facing: 0 };
  const voice = (id, x, z, until = 99) => ({ id, x, z, y: 1.7, until });
  const worker = (x, z) => ({ x, z, y: 1.6 });
  assert.deepEqual(lookTargetFor(self, 5, [voice('shan', 2, 6)], [worker(1, 2)]), voice('shan', 2, 6), 'the speaker, though the worker is nearer');
  assert.deepEqual(lookTargetFor(self, 5, [voice('shan', 0, VOICE_RANGE + 1)], [worker(1, 2)]), worker(1, 2), 'a voice out of earshot leaves the worker');
  assert.deepEqual(lookTargetFor(self, 5, [voice('hussan', 0, 3)], [worker(0, PASSING_RANGE + 0.5)]), null, 'never oneself, and a worker out of reach is nothing');
  assert.deepEqual(lookTargetFor(self, 5, [voice('shan', 0, 3, 4)], []), null, 'a line that has ended no longer draws the eye');
  assert.deepEqual(lookTargetFor(self, 5, [voice('shan', 0, -4)], []), null, 'nobody looks over their own shoulder');
  assert.deepEqual(lookTargetFor({ ...self, facing: Math.PI }, 5, [voice('shan', 0, -4)], []), voice('shan', 0, -4), 'facing the other way, the same point is ahead');
  assert.deepEqual(lookTargetFor(self, 5, [voice('shan', 2, 6), voice('john', 1, 2)], []), voice('john', 1, 2), 'the nearer of two voices');
  assert.ok(Math.abs(bearingOf(self, { x: 1, z: 1, y: 0 }) - Math.PI / 4) < 1e-9 && LOOK_CONE > Math.PI / 2);
});

test("a gaze in the figure's frame turns the head the right way, up to another head and down to a parcel", () => {
  const person = figure();
  person.root.position.set(4, 0, 2); person.root.rotation.y = Math.PI / 2; // facing world +x
  // A head 3 m ahead (world +x) and to the figure's left (world +z) at eye level: yaw negative, pitch about level.
  const ahead = gazeInFigureFrame(person, { x: 7, y: 1.85 * 0.92, z: 3 });
  assert.ok(Math.abs(ahead.z - 3) < 1e-9 && Math.abs(ahead.x + 1) < 1e-9 && Math.abs(ahead.y) < 1e-9, JSON.stringify(ahead));
  lookToward(person, ahead, 1);
  assert.ok(person.head.rotation.y < -0.25 && Math.abs(person.head.rotation.x) < 0.02, `left and level: ${person.head.rotation.y}, ${person.head.rotation.x}`);
  // A tall speaker close by is looked up at; the belt (no height given) is looked down at as before.
  const tall = figure(); lookToward(tall, { x: 0, z: 1.5, y: 0.6 }, 1);
  assert.ok(tall.head.rotation.x < -0.3, `looking up: ${tall.head.rotation.x}`);
  const belt = figure(); lookToward(belt, { x: 0, z: 1.5 }, 1);
  assert.ok(Math.abs(belt.head.rotation.x - 0.2) < 1e-9, 'the belt look is unchanged');
});
