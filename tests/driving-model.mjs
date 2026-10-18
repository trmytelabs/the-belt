import assert from 'node:assert/strict';
import test from 'node:test';
import { DrivingModel, DRIVING } from '../src/three/DrivingModel.ts';
import { CITY, DESTINATIONS, CITY_SIGNALS, cityRoute, signalColor, nearestRoad, separation } from '../src/three/drivingCity.ts';
import { makeDriver, driverState } from './driving-input.mjs';
const gas = { steer: 0, throttle: 1, brake: 0 };
const advance = (m, seconds, input = gas) => { for (let t = 0; t < seconds; t += 1 / 60) m.update(Math.min(1 / 60, seconds - t), input); };
const finish = (m, via, step = 1 / 60) => {
  const driver = makeDriver(m, m.goal, via);
  while (!m.canPark && m.elapsed < 120) m.update(step, driver(driverState(m)));
  return m;
};

for (const destination of ['mall', 'ups']) {
  test(`${destination}: a direct street journey takes 20–30 seconds and requires parking`, () => {
    const m = new DrivingModel(destination);
    assert.equal(m.park(), false);
    finish(m);
    assert.ok(m.elapsed >= 20 && m.elapsed <= 30, `duration ${m.elapsed}`);
    assert.equal(m.collisions, 0, 'a clean direct route has no unavoidable collision');
    assert.equal(m.redLights, 0, 'the driver brakes for a red signal');
    assert.equal(m.parked, false);
    assert.equal(m.park(), true);
    assert.deepEqual(m.drainEvents(), [{ type: 'parked' }]);
    const before = JSON.stringify(m); advance(m, 2);
    assert.equal(JSON.stringify(m), before);
    assert.equal(m.park(), false);
  });
}

test('intersections offer real branches and a long detour can still reach the same mall', () => {
  const direct = finish(new DrivingModel('mall'));
  const m = new DrivingModel('mall');
  const via = [{ x: 2.6, z: 20 }, { x: -60, z: 20 }, { x: -60, z: -100 }, { x: 60, z: -100 }, { x: 60, z: -220 }, m.goal];
  finish(m, via);
  assert.equal(m.canPark, true);
  assert.ok(m.distance > direct.distance + 100, 'different streets cover a genuinely longer trip');
  assert.ok(m.elapsed > direct.elapsed + 5, 'exploration has no 30-second cut-off');
  assert.ok(CITY.streetsX.length * CITY.streetsZ.length >= 20);
  assert.equal(CITY.groundWidth * CITY.groundDepth, 2 * 300 * 420, 'the driving world is twice the previous ground area');
});

test('holding gas does not follow a prescribed route or complete the journey', () => {
  const m = new DrivingModel('mall'); advance(m, 18);
  assert.ok(Math.abs(m.x - 2.6) < 0.01, 'the model never snaps to a bend');
  assert.equal(m.parked, false);
  assert.ok(m.remaining > 100, 'a real turn is needed to reach the mall');
});

test('left and right lead to different streets; navigation recalculates after a wrong turn', () => {
  for (const steer of [-1, 1]) {
    const m = new DrivingModel('mall'), initial = m.navigation.angle;
    advance(m, 1, { ...gas, steer });
    assert.ok(steer < 0 ? m.x < 2 : m.x > 3.2, `steering ${steer} changes world position`);
    assert.ok(Math.abs(m.navigation.angle - initial) > 0.2);
  }
  const route = cityRoute({ x: -60, z: -100 }, DESTINATIONS.mall, Math.PI / 2);
  assert.deepEqual(route.at(-1), DESTINATIONS.mall);
  for (let i = 1; i < route.length - 1; i++) assert.ok(nearestRoad(route[i]).distance < 0.001);
});

test('braking stops, holding it reverses, and soft city edges never trap the truck', () => {
  const m = new DrivingModel('mall'); advance(m, 2);
  advance(m, 0.9, { steer: 0, throttle: 0, brake: 1 });
  assert.ok(Math.abs(m.speed) < 0.1);
  const at = m.z; advance(m, 1, { steer: 0, throttle: 0, brake: 1 });
  assert.ok(m.speed < 0 && m.z > at, 'hold brake to back out');
  advance(m, 1, gas); assert.ok(m.speed > 0);
  Object.assign(m, { x: CITY.maxX - 3.1, z: -10, heading: 0, speed: 12 });
  advance(m, 1);
  assert.ok(m.x < CITY.maxX - 3 && Number.isFinite(m.heading), 'the boundary guides back into the city');
});

test('one cone collision charges five points and briefly slows without cargo state', () => {
  const m = new DrivingModel('mall'); advance(m, 2);
  Object.assign(m.obstacles[0], { x: m.x, z: m.z - 2 });
  m.update(1 / 60, gas);
  assert.equal(m.collisions, 1); assert.equal(m.penalty, 5);
  assert.ok(m.speed < 8 && m.slowdown > 0);
  assert.deepEqual(m.drainEvents(), [{ type: 'collision', kind: 'cone', points: 5 }]);
  advance(m, 2);
  assert.equal(m.slowdown, 0); assert.equal(m.collisions, 1);
  assert.equal('cargo' in m, false);
});

test('pause freezes world position, traffic, signal clocks and parking', () => {
  const m = new DrivingModel('ups'); advance(m, 2); m.paused = true;
  const before = JSON.stringify(m); advance(m, 5, { ...gas, steer: 1 });
  assert.equal(JSON.stringify(m), before); assert.equal(m.park(), false);
});

test('entering on red costs five points once per crossing; opposing directions share a phase', () => {
  const m = new DrivingModel('mall'), s = CITY_SIGNALS[0];
  Object.assign(m, { x: s.x + 2.6, z: s.z + 7.1, heading: Math.PI / 2, speed: 8 });
  m.update(0.05, gas);
  assert.equal(m.redLights, 1); assert.equal(m.penalty, 5);
  advance(m, 0.2);
  assert.equal(m.penalty, 5);
  assert.equal(signalColor(s, 0, 'ns'), 'red');
  assert.equal(signalColor(s, 0, 'ew'), 'green');
  assert.equal(signalColor(s, 8.5, 'ns'), 'amber');
  assert.equal(signalColor(s, 5, 'ns'), 'green');
});

test('street navigation and actual goal bearing change while exploring and reverse for UPS', () => {
  const outbound = new DrivingModel('mall'), inbound = new DrivingModel('ups');
  assert.ok(Math.abs(outbound.navigation.angle) < 0.2);
  assert.ok(Math.abs(inbound.navigation.angle) < 0.2);
  Object.assign(outbound, { x: 60, z: -40, heading: Math.PI });
  const route = outbound.navigation.route;
  assert.deepEqual(route.at(-1), DESTINATIONS.mall);
  assert.ok(separation(route[0], outbound) < 0.001);
});

test('slow-frame substeps retain similar free-drive journey timing', () => {
  const fast = finish(new DrivingModel('mall'), undefined, 1 / 120), slow = finish(new DrivingModel('mall'), undefined, 0.1);
  assert.ok(Math.abs(fast.elapsed - slow.elapsed) < 0.8);
  assert.ok(slow.canPark && fast.canPark);
});
