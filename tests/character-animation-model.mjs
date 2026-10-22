import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';

// The 3D figures' motion layers: the walk's lean and sway, the one-shot lift,
// put-down and throw, the heavy-load stance and the head turning to the work.
// Loaded through Vite so the actual pose code runs without canvas-backed art.
const server = await createServer({ cacheDir: 'node_modules/.vite-character-animation', server: { middlewareMode: true } });
let animateCharacter, lookToward, triggerAction, ACTION_SECONDS, BODY, snapshotPose, blendPose, SEAT_BLEND_SECONDS, GAIT_START_SECONDS, GAIT_STOP_SECONDS;
try {
  ({ animateCharacter, lookToward, triggerAction, ACTION_SECONDS, BODY, snapshotPose, blendPose, SEAT_BLEND_SECONDS, GAIT_START_SECONDS, GAIT_STOP_SECONDS } = await server.ssrLoadModule('/src/three/characters.ts'));
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
  for (let frame = 0; frame < 90; frame++) lookToward(c, { x: 1, z: 2 }, FRAME);
  assert.ok(Math.abs(c.head.rotation.y - Math.atan2(1, 2)) < 0.01, 'a point ahead and to the right turns the head toward it');
  assert.ok(c.head.rotation.x > 0.15, 'close work tips the head down');
  for (let frame = 0; frame < 120; frame++) lookToward(c, { x: -10, z: 0.1 }, FRAME);
  assert.ok(Math.abs(c.head.rotation.y + 0.7) < 0.01, 'a point far to the left turns the head only as far as the neck allows');
  assert.ok(c.head.rotation.x < 0.1, 'distant work keeps the head nearly level');
  for (let frame = 0; frame < 120; frame++) lookToward(c, null, FRAME);
  assert.ok(Math.abs(c.head.rotation.y) < 0.01 && Math.abs(c.head.rotation.x) < 0.01, 'with nothing to look at the head returns to centre');
  for (let frame = 0; frame < 30; frame++) lookToward(c, { x: 1, z: 0 }, FRAME, true);
  assert.ok(Math.abs(c.head.rotation.y) < 1e-3, 'reduced motion keeps the head still');
});

test('a walk builds over its first steps and winds down over its last instead of starting and stopping in a frame', () => {
  const c = figure();
  const stride = (samples) => Math.max(...samples.map((x) => Math.abs(x)));
  const first = run(c, 0.1, { moving: true, time: 0 }, (f) => f.leftLeg.rotation.x);
  assert.ok(stride(first) < 0.2, `the first tenth of a second is barely a step: ${stride(first).toFixed(3)}`);
  const full = run(c, 1, { moving: true, time: 0.1 }, (f) => f.leftLeg.rotation.x).slice(-40);
  assert.ok(stride(full) > 0.4, `after a second the stride is full: ${stride(full).toFixed(3)}`);
  assert.ok(GAIT_START_SECONDS >= 0.2 && GAIT_START_SECONDS <= 0.5 && GAIT_STOP_SECONDS >= 0.2 && GAIT_STOP_SECONDS <= 0.5);
  const stopping = run(c, 0.12, { moving: false, time: 1.1 }, (f) => f.leftLeg.rotation.x);
  assert.ok(c.gait > 0.4, `a tenth of a second after stopping the stride is still winding down: gait ${c.gait.toFixed(2)}`);
  run(c, 0.6, { moving: false, time: 1.22 });
  assert.equal(c.gait, 0, 'and soon the figure stands');
  assert.ok(Math.abs(c.leftLeg.rotation.x) < 0.02 && Math.abs(c.rightLeg.rotation.x) < 0.02, 'with the legs together');
  void stopping;
  const still = figure();
  run(still, 0.5, { moving: true, time: 0, reducedMotion: true });
  assert.equal(still.gait, 0, 'reduced motion never strides');
});

test('sitting down eases the legs over the seat blend; in a car the hips drop at once, off a bench they ease too', () => {
  const sitFrom = (body) => {
    const c = figure();
    run(c, 0.3, { moving: false, time: 0 });
    snapshotPose(c, 1, { seconds: SEAT_BLEND_SECONDS, body });
    // The seated pose the stage applies after the walk cycle: hips down, thighs forward, knees folded.
    const seat = (time) => {
      animateCharacter(c, FRAME, { moving: false, time });
      c.body.position.y = -0.41; c.leftLeg.rotation.x = c.rightLeg.rotation.x = -1.45; c.leftShin.rotation.x = c.rightShin.rotation.x = 1.45;
      blendPose(c, time);
    };
    seat(1 + FRAME);
    const early = { hips: c.body.position.y, thigh: c.leftLeg.rotation.x };
    seat(1 + SEAT_BLEND_SECONDS * 0.5);
    const half = { hips: c.body.position.y, thigh: c.leftLeg.rotation.x };
    seat(1 + SEAT_BLEND_SECONDS + FRAME);
    return { early, half, done: { hips: c.body.position.y, thigh: c.leftLeg.rotation.x } };
  };
  const car = sitFrom(false), bench = sitFrom(true);
  assert.ok(car.early.thigh > -0.2 && car.half.thigh < -0.4 && car.half.thigh > -1.2 && Math.abs(car.done.thigh + 1.45) < 1e-6, `the thighs come forward over the blend: ${JSON.stringify(car)}`);
  assert.equal(car.early.hips, -0.41, 'in a car the hips are in the seat from the first frame');
  assert.ok(bench.early.hips > -0.1 && bench.half.hips < -0.1 && bench.half.hips > -0.35 && bench.done.hips === -0.41, `off a bench the hips lower over the blend: ${JSON.stringify(bench)}`);
  assert.ok(SEAT_BLEND_SECONDS > 0.3 && SEAT_BLEND_SECONDS < 0.8);
});

test('a hand-built pose blends part way, not held then snapped', () => {
  const c = figure();
  run(c, 0.2, { moving: false, time: 0 });
  snapshotPose(c, 1);
  // The new pose, applied each frame after the walk cycle: the right arm raised.
  const pose = (time) => { animateCharacter(c, FRAME, { moving: false, time }); c.rightArm.rotation.x = -2.4; blendPose(c, time); return c.rightArm.rotation.x; };
  const early = pose(1 + 0.05), middle = pose(1 + 0.11), late = pose(1 + 0.3);
  assert.ok(early < -0.05 && early > -1.2, `a twentieth of a second in, the arm is on its way: ${early.toFixed(3)}`);
  assert.ok(middle < early && middle > -2.3, `half way, further: ${middle.toFixed(3)}`);
  assert.ok(Math.abs(late + 2.4) < 1e-6, `after the blend, there: ${late.toFixed(3)}`);
});

test('the head turns at a calm pace: a third of a second gets it most of the way, never a snap', () => {
  const c = figure();
  const steps = [];
  for (let frame = 0; frame < 20; frame++) { lookToward(c, { x: -10, z: 0.1 }, FRAME); steps.push(c.head.rotation.y); }
  assert.ok(Math.abs(steps[0]) < 0.05, `the first frame turns only a little: ${steps[0]}`);
  assert.ok(steps[19] < -0.4 && steps[19] > -0.7, `about a third of a second in, most of the way: ${steps[19]}`);
});
