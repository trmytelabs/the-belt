import assert from 'node:assert/strict';
import test from 'node:test';
import { DrivingModel, DRIVING, ROAD_LENGTH, roadPoint } from '../src/three/DrivingModel.ts';

const gas = { steer: 0, throttle: 1, brake: 0 };
const advance = (model, seconds, input = gas, step = 1 / 60) => {
  for (let t = 0; t < seconds; t += step) model.update(Math.min(step, seconds - t), input);
};

for (const destination of ['mall', 'ups']) {
  test(`${destination}: a complete drive takes 20–30 seconds and requires parking`, () => {
    const m = new DrivingModel(destination);
    assert.equal(m.park(), false, 'cannot park at the departure');
    while (!m.canPark && m.elapsed < 40) m.update(1 / 60, gas);
    assert.ok(m.elapsed >= 20 && m.elapsed <= 30, `duration ${m.elapsed}`);
    assert.equal(m.collisions, 0, 'the gently guided lane clears normal traffic');
    assert.equal(m.parked, false, 'arrival waits for the driver');
    assert.equal(m.park(), true);
    assert.deepEqual(m.drainEvents(), [{ type: 'parked' }]);
    const distance = m.distance;
    advance(m, 5);
    assert.equal(m.distance, distance);
    assert.equal(m.park(), false, 'one parking credit');
  });

  test(`${destination}: brake, coast, recover from either edge and still finish`, () => {
    for (const steer of [-1, 1]) {
      const m = new DrivingModel(destination);
      advance(m, 6, { ...gas, steer });
      assert.ok(Math.abs(m.offset) <= DRIVING.shoulderLimit);
      const at = m.distance;
      advance(m, 1, { steer: 0, throttle: 0, brake: 1 });
      assert.equal(m.speed, 0);
      advance(m, 1, { steer: 0, throttle: 0, brake: 0 });
      assert.ok(m.distance >= at && m.distance < at + 14);
      while (!m.canPark && m.elapsed < 60) m.update(1 / 30, gas);
      assert.equal(m.canPark, true, 'no wedged edge or reverse required');
      assert.ok(Math.abs(m.offset - DRIVING.lane) < 0.6, 'bay gently aligns the truck');
    }
  });
}

test('collision is one five-point bump with temporary slowdown and no cargo model', () => {
  const m = new DrivingModel('mall');
  advance(m, 3);
  const cone = m.obstacles[0];
  Object.assign(cone, { distance: m.distance + 1, offset: m.offset });
  m.update(1 / 60, gas);
  assert.equal(m.collisions, 1);
  assert.equal(m.penalty, 5);
  assert.ok(m.speed < 7 && m.slowdown > 0);
  assert.deepEqual(m.drainEvents(), [{ type: 'collision', kind: 'cone', points: 5 }]);
  advance(m, 2);
  assert.equal(m.slowdown, 0);
  assert.ok(m.speed > 10);
  assert.equal(m.collisions, 1, 'contact cannot repeatedly charge the same cone');
  assert.equal(m.parked, false);
  assert.equal('cargo' in m, false, 'freight remains in the existing mall model');
});

test('pause freezes truck, traffic, collision clocks and parking', () => {
  const m = new DrivingModel('ups'); advance(m, 2);
  m.paused = true;
  const before = JSON.stringify(m);
  advance(m, 5, { ...gas, steer: 1 });
  assert.equal(JSON.stringify(m), before);
  assert.equal(m.park(), false);
  m.paused = false; advance(m, 1);
  assert.ok(m.elapsed > 2.5);
});

test('the return retraces the same road with the camera facing the opposite way', () => {
  for (let s = 0; s < ROAD_LENGTH; s += 5) {
    const a = roadPoint(s), b = roadPoint(ROAD_LENGTH - s, 0, 'ups');
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-8);
    assert.ok(Math.abs(a.tx + b.tx) < 1e-8 && Math.abs(a.tz + b.tz) < 1e-8);
  }
});

test('slow-frame substeps retain collisions and similar journey timing', () => {
  const run = step => {
    const m = new DrivingModel('mall');
    while (!m.canPark && m.elapsed < 40) m.update(step, gas);
    return m;
  };
  const fast = run(1 / 120), slow = run(0.1);
  assert.ok(Math.abs(fast.elapsed - slow.elapsed) < 0.2);
  assert.ok(Math.abs(fast.distance - slow.distance) < 0.2);
});
