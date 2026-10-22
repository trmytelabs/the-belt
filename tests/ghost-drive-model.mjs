import assert from 'node:assert/strict';
import test from 'node:test';
import { GHOST_KEY, GHOST_MAX_SECONDS, GHOST_STEP, GhostRecorder, ghostPose, keepFaster, loadGhosts, saveGhosts } from '../src/three/ghostDrive.ts';
import { DrivingModel } from '../src/three/DrivingModel.ts';

// Ghost drives: the fastest five-ton drive to each yard, recorded, kept on this device and replayed.

const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, String(value)); }, data };
};
/** A straight drive east at `speed` metres a second, sampled at uneven frames, parked after `seconds`. */
const straight = (seconds, speed = 10) => {
  const recorder = new GhostRecorder();
  let t = 0;
  const frames = [1 / 60, 1 / 30, 0.25, 1 / 144];
  for (let i = 0; t < seconds; i++) {
    recorder.sample(t, { x: speed * t, z: 0, heading: 0 });
    t = Math.min(seconds, t + frames[i % frames.length]);
  }
  return recorder.finish(seconds, { x: speed * seconds, z: 0, heading: 0 });
};

test('a drive keeps a pose for every step of its clock, even across a long frame, and ends parked', () => {
  const drive = straight(12.3);
  assert.equal(drive.seconds, 12.3);
  assert.equal(drive.poses.length, Math.floor(12.3 / GHOST_STEP) + 2);
  drive.poses.slice(0, -1).forEach((pose, index) => assert.ok(Math.abs(pose.x - index * GHOST_STEP * 10) <= 2.5 + 1e-9, `step ${index}: ${pose.x}`));
  assert.deepEqual(drive.poses.at(-1), { x: 123, z: 0, heading: 0 });
  assert.equal(new GhostRecorder().finish(0, { x: 0, z: 0, heading: 0 }), null, 'nothing kept for no drive');
  assert.equal(new GhostRecorder().finish(GHOST_MAX_SECONDS + 1, { x: 0, z: 0, heading: 0 }), null, 'nor for one too long');
});

test('the ghost moves smoothly between its poses, turns the short way and waits parked at the end', () => {
  const ghost = { seconds: 0.4, poses: [{ x: 0, z: 0, heading: 3.1 }, { x: 2, z: 4, heading: -3.1 }, { x: 4, z: 8, heading: -3.1 }] };
  assert.deepEqual(ghostPose(ghost, -1), ghost.poses[0]);
  const half = ghostPose(ghost, GHOST_STEP / 2);
  assert.ok(Math.abs(half.x - 1) < 1e-9 && Math.abs(half.z - 2) < 1e-9);
  // From 3.1 to −3.1 radians is a small turn across ±π, not nearly a full circle.
  assert.ok(Math.abs(Math.atan2(Math.sin(half.heading - Math.PI), Math.cos(half.heading - Math.PI))) < 0.05, `heading ${half.heading}`);
  assert.deepEqual(ghostPose(ghost, 99), ghost.poses[2], 'parked once the drive is over');
});

test('only the first or a faster drive becomes the ghost', () => {
  const slow = straight(70), fast = straight(58), slower = straight(75);
  let result = keepFaster({}, 'mall', slow);
  assert.deepEqual([result.newBest, result.previous], [true, null]);
  result = keepFaster(result.store, 'mall', fast);
  assert.deepEqual([result.newBest, result.previous?.seconds, result.store.mall.seconds], [true, 70, 58]);
  const kept = keepFaster(result.store, 'mall', slower);
  assert.deepEqual([kept.newBest, kept.store.mall.seconds], [false, 58]);
  assert.equal(kept.store.ups, undefined, 'each yard keeps its own');
});

test('ghosts round-trip through storage in a few kilobytes, and odd or blocked storage reads as none', () => {
  const storage = memory();
  const store = { mall: straight(64), ups: straight(81) };
  saveGhosts(storage, store);
  assert.ok(storage.data.get(GHOST_KEY).length < 16_000, `${storage.data.get(GHOST_KEY).length} bytes`);
  assert.deepEqual(loadGhosts(storage), store);
  assert.deepEqual(loadGhosts(null), {});
  assert.deepEqual(loadGhosts(memory({ [GHOST_KEY]: 'nope' })), {});
  const odd = { mall: { seconds: 60, poses: [1, 2] }, ups: { seconds: -4, poses: [0, 0, 0, 1, 1, 1] }, bank: { seconds: 5, poses: [0, 0, 0, 1, 1, 1] } };
  assert.deepEqual(loadGhosts(memory({ [GHOST_KEY]: JSON.stringify(odd) })), {});
  const half = { mall: { seconds: 60, poses: [0, 0, 0, 1, 'x', 1] }, ups: { seconds: 3, poses: [0, 0, 0, 1, 1, 1] } };
  assert.deepEqual(Object.keys(loadGhosts(memory({ [GHOST_KEY]: JSON.stringify(half) }))), ['ups']);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(loadGhosts(blocked), {});
  assert.doesNotThrow(() => saveGhosts(blocked, store));
});

test('a real drive recorded frame by frame replays its own path', () => {
  const drive = new DrivingModel('mall');
  const recorder = new GhostRecorder();
  const path = [];
  for (let i = 0; i < 300; i++) {
    drive.update(1 / 60, { steer: i > 120 && i < 200 ? 0.6 : 0, throttle: 1, brake: 0 });
    recorder.sample(drive.elapsed, drive.pose);
    path.push({ t: drive.elapsed, x: drive.x, z: drive.z });
  }
  const ghost = recorder.finish(drive.elapsed, drive.pose);
  for (const point of path.filter((_, i) => i % 25 === 0)) {
    const pose = ghostPose(ghost, point.t);
    assert.ok(Math.hypot(pose.x - point.x, pose.z - point.z) < 0.6, `at ${point.t.toFixed(2)} s the ghost is where the truck was: ${JSON.stringify({ pose, point })}`);
  }
});
