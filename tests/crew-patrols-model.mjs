import assert from 'node:assert/strict';
import test from 'node:test';
import { CrewPatrols } from '../src/three/crewPatrols.ts';
import { ShiftModel3D } from '../src/three/ShiftModel3D.ts';

test('John walks both sides around the belt head, stopping for squat sets at varying intervals', () => {
  let seed = 139;
  const patrols = new CrewPatrols(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32));
  let point = { x: 390, y: 548 }, squatting = false, left = 0, right = 0;
  const starts = [], durations = [];
  let started = 0;
  for (let frame = 0; frame < 1800; frame++) {
    const next = patrols.step('john', point, 0.1);
    assert.ok(Math.hypot(next.x - point.x, next.y - point.y) <= 8.4 + 1e-8, 'ordinary walking speed without jumps');
    if (next.x > 428 && next.x < 532) assert.ok(next.y <= 128, 'crosses around receiving, through no belt or running freight');
    assert.ok(next.y <= 1000, 'never blocks a stair entrance');
    if (next.squatting) assert.deepEqual({ x: next.x, y: next.y }, { x: point.x, y: point.y });
    if (next.squatting && !squatting) { starts.push(frame); started = frame; }
    if (!next.squatting && squatting) durations.push(frame - started);
    if (next.x < 428) left++; if (next.x > 532) right++;
    point = next; squatting = next.squatting;
  }
  assert.ok(left > 100 && right > 100);
  assert.ok(starts.length > 8 && starts.length < 25);
  assert.ok(new Set(starts.slice(1).map((start, i) => start - starts[i])).size > 2);
  assert.ok(durations.every(frames => frames >= 24 && frames <= 38));
});

test('Shan and Vic patrol up and down their lanes and zero elapsed time freezes all three walkers', () => {
  const patrols = new CrewPatrols(() => 0.5);
  for (const [id, x] of [['shan', 595], ['vic', 376]]) {
    let point = { x, y: 548 }, minimum = 2000, maximum = 0;
    for (let frame = 0; frame < 600; frame++) {
      const next = patrols.step(id, point, 0.1);
      assert.ok(next.x >= 330 && next.x <= 630 && next.y <= 1000);
      minimum = Math.min(minimum, next.y); maximum = Math.max(maximum, next.y); point = next;
    }
    assert.ok(minimum < 250 && maximum > 990);
    const frozen = patrols.step(id, point, 0);
    assert.equal(frozen.x, point.x); assert.equal(frozen.y, point.y);
  }
  patrols.reset();
  assert.deepEqual(patrols.step('john', { x: 390, y: 548 }, 0), { x: 390, y: 548, squatting: false, squatTime: 0 });
});

test('a supervisor in the way slows a forward approach without trapping or slowing a sidestep', () => {
  const model = new ShiftModel3D({ autonomousCoworker: false });
  model.eventStopped = true;
  Object.assign(model.activeWorker, { x: 370, y: 500 });
  model.laneObstacles = [{ x: 370, y: 525 }];
  model.update(100, { x: 0, y: 1 });
  assert.ok(model.activeWorker.y > 500 && model.activeWorker.y < 523.5);
  const x = model.activeWorker.x;
  model.update(100, { x: 1, y: 0 });
  assert.ok(model.activeWorker.x - x > 23, 'walking around the supervisor keeps ordinary speed');
});
