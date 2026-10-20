import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';

// The 3D figures' motion layers: the walk's lean and sway, the one-shot lift,
// put-down and throw, the heavy-load stance and the head turning to the work.
// Loaded through Vite so the actual pose code runs without canvas-backed art.
const server = await createServer({ cacheDir: 'node_modules/.vite-character-animation', server: { middlewareMode: true } });
let animateCharacter, lookToward, triggerAction, ACTION_SECONDS, BODY;
try {
  ({ animateCharacter, lookToward, triggerAction, ACTION_SECONDS, BODY } = await server.ssrLoadModule('/src/three/characters.ts'));
} finally { await server.close(); }

function figure() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const pivot = (parent, x, y) => { const joint = new THREE.Group(); joint.position.set(x, y, 0); parent.add(joint); return joint; };
  const leftArm = pivot(body, -BODY.shoulderX, BODY.shoulderY), rightArm = pivot(body, BODY.shoulderX, BODY.shoulderY);
  const leftForearm = pivot(leftArm, 0, -BODY.upperArm), rightForearm = pivot(rightArm, 0, -BODY.upperArm);
  const leftLeg = pivot(body, -BODY.hipX, BODY.hipY), rightLeg = pivot(body, BODY.hipX, BODY.hipY);
  return { root, body, head: pivot(body, 0, BODY.neckY), leftArm, rightArm, leftForearm, rightForearm,
    leftHand: pivot(leftForearm, 0, -BODY.forearm), rightHand: pivot(rightForearm, 0, -BODY.forearm),
    leftLeg, rightLeg, leftShin: pivot(leftLeg, 0, -BODY.thigh), rightShin: pivot(rightLeg, 0, -BODY.thigh), walkPhase: 0 };
}
const FRAME = 1 / 60;
/** Runs `seconds` of frames, collecting whatever `sample` reads after each one. */
function run(character, seconds, state, sample = () => undefined) {
  const samples = [];
  for (let frame = 0; frame < Math.round(seconds / FRAME); frame++) {
    animateCharacter(character, FRAME, { ...state, time: state.time + frame * FRAME });
    samples.push(sample(character));
  }
  return samples;
}

test('walking leans the torso in and sways it; standing straightens it again; reduced motion stays upright', () => {
  const c = figure();
  const walking = run(c, 2, { moving: true, time: 0 }, (f) => ({ lean: f.body.rotation.x, sway: f.body.rotation.z }));
  const settled = walking.slice(60);
  assert.ok(settled.every((s) => s.lean > 0.03 && s.lean < 0.09), 'a walk leans the torso a few degrees forward');
  assert.ok(Math.max(...settled.map((s) => s.sway)) > 0.01 && Math.min(...settled.map((s) => s.sway)) < -0.01, 'the torso sways both ways with the steps');
  const standing = run(c, 1, { moving: false, time: 2 }, (f) => f.body.rotation.x);
  assert.ok(Math.abs(standing.at(-1)) < 0.005, 'standing still straightens the torso');
  const still = figure();
  run(still, 1, { moving: true, time: 0, reducedMotion: true });
  assert.equal(still.body.rotation.x, 0, 'reduced motion never leans');
  assert.equal(still.body.rotation.z, 0, 'reduced motion never sways');
});

test('a heavy load pulls the carrier back onto their heels and lowers the arms', () => {
  const light = figure(), heavy = figure();
  run(light, 1, { moving: false, carrying: true, time: 0, load: 0 });
  run(heavy, 1, { moving: false, carrying: true, time: 0, load: 1 });
  assert.ok(Math.abs(light.body.rotation.x) < 0.005, 'an envelope needs no lean');
  assert.ok(heavy.body.rotation.x < -0.05 && heavy.body.rotation.x > -0.1, 'a heavy box leans the torso back');
  assert.ok(heavy.leftArm.rotation.x > light.leftArm.rotation.x + 0.08, 'a heavy box hangs lower in the arms');
  assert.ok(heavy.leftForearm.rotation.x > light.leftForearm.rotation.x + 0.1, 'the elbows open under the weight');
});

test('a lift dips the hips and knees briefly, then the figure recovers and the action clears itself', () => {
  const c = figure();
  run(c, 1, { moving: false, time: 0 });
  const rest = c.body.position.y;
  triggerAction(c, 'lift', 1);
  assert.equal(c.action.kind, 'lift');
  const dip = run(c, ACTION_SECONDS.lift, { moving: false, carrying: true, time: 1 }, (f) => ({ y: f.body.position.y, knee: f.leftShin.rotation.x, thigh: f.leftLeg.rotation.x, lean: f.body.rotation.x }));
  assert.ok(Math.min(...dip.map((s) => s.y)) < rest - 0.06, 'the hips drop for the lift');
  assert.ok(Math.max(...dip.map((s) => s.knee)) > 0.3, 'the knees fold');
  assert.ok(Math.min(...dip.map((s) => s.thigh)) < -0.15, 'the thighs come forward into a crouch');
  assert.ok(Math.max(...dip.map((s) => s.lean)) > 0.04, 'the torso leans over the box');
  run(c, 0.8, { moving: false, carrying: true, time: 1 + ACTION_SECONDS.lift });
  assert.equal(c.action, undefined, 'the motion clears itself once it has played');
  assert.ok(Math.abs(c.body.position.y - rest) < 0.012, 'the hips come back up');
  assert.ok(c.leftShin.rotation.x < 0.06, 'the knees straighten again');
});

test('a put-down is a shallower dip than a lift, and reduced motion plays neither', () => {
  const lift = figure(), drop = figure();
  triggerAction(lift, 'lift', 0); triggerAction(drop, 'drop', 0);
  const liftDepth = Math.min(...run(lift, ACTION_SECONDS.lift, { moving: false, time: 0 }, (f) => f.body.position.y));
  const dropDepth = Math.min(...run(drop, ACTION_SECONDS.drop, { moving: false, time: 0 }, (f) => f.body.position.y));
  assert.ok(dropDepth < -0.04 && dropDepth > liftDepth, `a put-down (${dropDepth.toFixed(3)}) dips less than a lift (${liftDepth.toFixed(3)})`);
  const still = figure();
  triggerAction(still, 'lift', 0);
  const motion = run(still, ACTION_SECONDS.lift + 0.1, { moving: false, time: 0, reducedMotion: true }, (f) => f.body.position.y);
  assert.ok(motion.every((y) => Math.abs(y) < 0.01), 'reduced motion keeps the figure still');
  assert.equal(still.action, undefined, 'the action still expires under reduced motion');
});

test('a throw swings both arms forward and up, then they settle back by the sides', () => {
  const c = figure();
  run(c, 1, { moving: false, time: 0 });
  triggerAction(c, 'throw', 1);
  const swing = run(c, ACTION_SECONDS.throw, { moving: false, time: 1 }, (f) => Math.min(f.leftArm.rotation.x, f.rightArm.rotation.x));
  assert.ok(Math.min(...swing) < -0.6, 'the arms swing well forward');
  run(c, 1, { moving: false, time: 1 + ACTION_SECONDS.throw });
  assert.ok(Math.abs(c.leftArm.rotation.x) < 0.03 && Math.abs(c.rightArm.rotation.x) < 0.03, 'the arms return to rest');
  assert.equal(c.action, undefined);
});

test('a lift never starts the walk cycle, and a walk keeps its arm swing through a lift', () => {
  const c = figure();
  triggerAction(c, 'lift', 0);
  run(c, ACTION_SECONDS.lift, { moving: false, time: 0 });
  assert.equal(c.walkPhase, 0, 'standing still through a lift advances no steps');
  const walker = figure();
  run(walker, 1, { moving: true, time: 0 });
  triggerAction(walker, 'lift', 1);
  const arms = run(walker, ACTION_SECONDS.lift, { moving: true, time: 1 }, (f) => f.leftArm.rotation.x);
  assert.ok(arms.every((x) => x > -0.6 && x < 0.3), 'the reach stays a modest motion over the swing');
});

test('the head turns toward a point within the neck\'s range, looks down at close work and eases back', () => {
  const c = figure();
  for (let frame = 0; frame < 90; frame++) lookToward(c, { x: 1, z: 1 }, FRAME);
  assert.ok(Math.abs(c.head.rotation.y - Math.PI / 4) < 0.01, 'a point ahead and to the right turns the head 45 degrees right');
  assert.ok(c.head.rotation.x > 0.15, 'close work tips the head down');
  for (let frame = 0; frame < 90; frame++) lookToward(c, { x: -10, z: 0.1 }, FRAME);
  assert.ok(Math.abs(c.head.rotation.y + 1.0) < 0.01, 'a point far to the left turns the head only as far as the neck allows');
  assert.ok(c.head.rotation.x < 0.1, 'distant work keeps the head nearly level');
  for (let frame = 0; frame < 90; frame++) lookToward(c, null, FRAME);
  assert.ok(Math.abs(c.head.rotation.y) < 0.01 && Math.abs(c.head.rotation.x) < 0.01, 'with nothing to look at the head returns to centre');
  for (let frame = 0; frame < 30; frame++) lookToward(c, { x: 1, z: 0 }, FRAME, true);
  assert.ok(Math.abs(c.head.rotation.y) < 1e-3, 'reduced motion keeps the head still');
});
