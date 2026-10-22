import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DrivingNavigation } from '../src/three/drivingNavigation.ts';
import { DrivingModel, DRIVING, DRIVE_PAR, driveClock, parBonus } from '../src/three/DrivingModel.ts';
import { CITY, DESTINATIONS, HOME_SPAWN, SPAWNS, TERMINALS, CITY_SIGNALS, cityRoute, signalColor, nearestRoad, separation, angleDelta, trafficPose, inLoadingYard } from '../src/three/drivingCity.ts';
import { makeDriver, driverState } from './driving-input.mjs';
const gas = { steer: 0, throttle: 1, brake: 0 };
const advance = (m, seconds, input = gas) => { for (let t = 0; t < seconds; t += 1 / 60) m.update(Math.min(1 / 60, seconds - t), input); };
const finish = (m, via, step = 1 / 60) => {
  const driver = makeDriver(m, m.goal, via);
  while (!m.canPark && m.elapsed < 120) m.update(step, driver(driverState(m)));
  return m;
};

for (const destination of ['mall', 'ups']) {
  test(`${destination}: a longer city journey takes 35–65 seconds and requires loading-yard parking`, () => {
    const m = new DrivingModel(destination);
    assert.equal(m.park(), false);
    finish(m);
    assert.ok(m.elapsed >= 35 && m.elapsed <= 65, `duration ${m.elapsed}`);
    assert.equal(m.penalty, 100 * (m.collisions + m.redLights), 'every traffic incident has the requested deduction');
    assert.equal(m.redLights, 0, 'the driver brakes for a red signal');
    assert.equal(m.parked, false);
    assert.equal(m.park(), true);
    assert.equal(m.drainEvents().filter(event => event.type === 'parked').length, 1);
    const before = JSON.stringify(m); advance(m, 2);
    assert.equal(JSON.stringify(m), before);
    assert.equal(m.park(), false);
  });
}

test('the 3D drive in to work starts on a street near home and parks in the UPS yard', () => {
  const m = new DrivingModel('ups', 'home');
  assert.equal(m.origin, 'home');
  assert.deepEqual({ x: m.x, z: m.z, heading: m.heading }, HOME_SPAWN);
  assert.ok(nearestRoad(m).distance < 1, 'home is on a public street');
  assert.equal(inLoadingYard(m), false);
  finish(m);
  assert.ok(m.canPark && inLoadingYard(m, 'ups'), 'parks in the UPS loading yard');
  assert.ok(m.elapsed >= 20 && m.elapsed <= 65, `duration ${m.elapsed}`);
  assert.equal(m.redLights, 0, 'the driver brakes for a red signal');
  assert.equal(new DrivingModel('ups').origin, 'depot', 'the drive back from the mall still starts at Southgate');
});

test('intersections offer real branches and a long detour can still reach the same mall', () => {
  const direct = finish(new DrivingModel('mall'));
  const m = new DrivingModel('mall');
  const via = [SPAWNS.mall, { x: -60, z: 80 }, { x: -120, z: 80 }, { x: -120, z: -100 }, { x: 0, z: -100 }, { x: 0, z: -280 }, { x: 180, z: -280 }, m.goal];
  finish(m, via);
  assert.equal(m.canPark, true);
  assert.ok(m.distance > direct.distance + 100, 'different streets cover a genuinely longer trip');
  assert.ok(m.elapsed > direct.elapsed + 5, 'exploration has no 30-second cut-off');
  assert.equal(CITY.streetsX.length * CITY.streetsZ.length, 42);
  assert.equal(CITY.groundWidth * CITY.groundDepth, 2 * 420 * 600, 'the scenery area doubles again');
  assert.equal((CITY.maxX - CITY.minX) * (CITY.maxZ - CITY.minZ), 2 * 270 * 350, 'the actual playable bounds also double');
});

test('holding gas does not follow a prescribed route or complete the journey', () => {
  const m = new DrivingModel('mall'); advance(m, 18);
  assert.ok(Math.abs(m.x - SPAWNS.mall.x) < 0.01, 'the model never snaps to a bend');
  assert.equal(m.parked, false);
  assert.ok(m.remaining > 100, 'a real turn is needed to reach the mall');
});

test('left and right lead to different streets; navigation recalculates after a wrong turn', () => {
  for (const steer of [-1, 1]) {
    const m = new DrivingModel('mall'), initial = m.navigation.angle;
    advance(m, 1, { ...gas, steer });
    assert.ok(steer < 0 ? m.x < SPAWNS.mall.x - 0.5 : m.x > SPAWNS.mall.x + 0.5, `steering ${steer} changes world position`);
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

test('one cone collision charges 100 points and briefly slows without cargo state', () => {
  const m = new DrivingModel('mall'); advance(m, 2);
  Object.assign(m.obstacles[0], { x: m.x, z: m.z - 2 });
  m.update(1 / 60, gas);
  assert.equal(m.collisions, 1); assert.equal(m.penalty, 100);
  assert.ok(m.speed < 8 && m.slowdown > 0);
  assert.deepEqual(m.drainEvents(), [{ type: 'collision', kind: 'cone', points: 100 }]);
  advance(m, 2);
  assert.equal(m.slowdown, 0); assert.equal(m.collisions, 1);
  assert.equal('cargo' in m, false);
});

test('pause freezes world position, traffic, signal clocks and parking', () => {
  const m = new DrivingModel('ups'); advance(m, 2); m.paused = true;
  const before = JSON.stringify(m); advance(m, 5, { ...gas, steer: 1 });
  assert.equal(JSON.stringify(m), before); assert.equal(m.park(), false);
});

test('entering on red costs 100 points once per crossing; opposing directions share a phase', () => {
  const m = new DrivingModel('mall'), s = CITY_SIGNALS[0];
  Object.assign(m, { x: s.x + 2.6, z: s.z + 7.1, heading: Math.PI / 2, speed: 8 });
  m.update(0.05, gas);
  assert.equal(m.redLights, 1); assert.equal(m.penalty, 100);
  advance(m, 0.2);
  assert.equal(m.penalty, 100);
  assert.equal(signalColor(s, 0, 'ns'), 'red');
  assert.equal(signalColor(s, 0, 'ew'), 'green');
  assert.equal(signalColor(s, 8.5, 'ns'), 'amber');
  assert.equal(signalColor(s, 5, 'ns'), 'green');
});

test('the destination compass always targets the actual loading bay, including across side streets', () => {
  const outbound = new DrivingModel('mall'), inbound = new DrivingModel('ups');
  assert.ok(outbound.navigation.angle > 0.4 && outbound.navigation.angle < 0.7, 'the destination is northeast, beyond the first street waypoint');
  assert.ok(inbound.navigation.angle > 0.4 && inbound.navigation.angle < 0.7);
  Object.assign(outbound, { x: 60, z: -40, heading: Math.PI });
  assert.deepEqual(outbound.navigation.target, DESTINATIONS.mall);
  assert.ok(separation(outbound.navigation.target, outbound) > 100);
});

test('the green 3D compass stays aligned with the destination through all headings and camera lag', () => {
  const camera = new THREE.PerspectiveCamera(), compass = new DrivingNavigation(camera);
  for (const destination of ['mall', 'ups']) for (const x of CITY.streetsX) for (const z of CITY.streetsZ) for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const m = new DrivingModel(destination); Object.assign(m, { x, z, heading });
    const yaw = heading + 0.32;
    camera.position.set(x - Math.cos(yaw) * 9, 4.5, z + Math.sin(yaw) * 9);
    camera.lookAt(x + Math.cos(yaw) * 10, 1.2, z - Math.sin(yaw) * 10);
    compass.update(m, camera);
    const tip = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), compass.pointer.rotation.y);
    const world = { x: -tip.z * Math.cos(yaw) + tip.x * Math.sin(yaw), z: tip.z * Math.sin(yaw) + tip.x * Math.cos(yaw) };
    const distance = separation(m, m.goal);
    const dot = (world.x * (m.goal.x - x) + world.z * (m.goal.z - z)) / distance;
    assert.ok(dot > 0.999999, `${destination} compass points at its real dock from ${x},${z}`);
    assert.equal(compass.pointer.rotation.z, 0, 'the arrow turns around its vertical 3D axis');
  }
});

test('traffic positions and headings stay continuous through every turn and loop seam in both directions', () => {
  for (let route = 0; route < 3; route++) for (const reverse of [false, true]) {
    let previous = trafficPose(route, 0, reverse);
    for (let distance = 0.25; distance < 2000; distance += 0.25) {
      const next = trafficPose(route, distance * (reverse ? -1 : 1), reverse);
      assert.ok(separation(previous, next) <= 0.251, 'no position jump at a corner');
      assert.ok(Math.abs(angleDelta(next.heading - previous.heading)) < 0.04, 'heading changes gradually along a turn');
      const dot = ((next.x - previous.x) * next.tx + (next.z - previous.z) * next.tz) / separation(previous, next);
      assert.ok(dot > 0.999, 'the car faces its actual movement'); previous = next;
    }
  }
});

test('traffic never stops inside another car, queues behind the truck and keeps moving', () => {
  // Oriented boxes: traffic sedans 4.2 by 1.8 m, the truck 6 by 2.4 m.
  const overlaps = (a, b) => [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2].every((angle) => {
    const x = Math.cos(angle), z = -Math.sin(angle);
    const r = (box) => Math.abs(Math.cos(box.heading) * x - Math.sin(box.heading) * z) * box.length / 2
      + Math.abs(Math.sin(box.heading) * x + Math.cos(box.heading) * z) * box.width / 2;
    return r(a) + r(b) - Math.abs((a.x - b.x) * x + (a.z - b.z) * z) > 0.05;
  });
  const coast = { steer: 0, throttle: 0, brake: 0 };
  // Idle at the depot for three minutes (two routes merge into each other's street by then), and
  // stopped in route 0's lane, where cars come up behind the truck within a minute.
  for (const [scenario, seconds] of [['idle', 180], ['in-lane', 75]]) {
    const m = new DrivingModel('mall');
    if (scenario === 'in-lane') Object.assign(m, trafficPose(0, 300));
    const truck = { x: m.x, z: m.z, heading: m.heading, length: 6, width: 2.4 };
    const cars = m.obstacles.filter((o) => o.kind === 'car'), start = cars.map((car) => car.travel);
    for (let t = 1; t <= seconds; t += 1) {
      advance(m, 1, coast);
      const boxes = cars.map((car) => ({ id: car.id, x: car.x, z: car.z, heading: car.heading, length: 4.2, width: 1.8 }));
      for (const [i, a] of boxes.entries()) {
        if (scenario === 'in-lane') assert.ok(!overlaps(a, truck), `${a.id} drives into the stopped truck at ${t} s`);
        for (const b of boxes.slice(i + 1)) assert.ok(!overlaps(a, b), `${a.id} and ${b.id} overlap at ${t} s (${scenario})`);
      }
    }
    if (scenario === 'idle') {
      const speed = cars.reduce((sum, car, i) => sum + Math.abs(car.travel - start[i]), 0) / cars.length / seconds;
      assert.ok(speed > 6.5, `traffic flows instead of jamming: ${speed.toFixed(2)} m/s`);
    }
  }
});

test('both loading bays are beyond the public road, inside separate paved yards', () => {
  for (const destination of ['mall', 'ups']) {
    const m = new DrivingModel(destination), terminal = TERMINALS[destination];
    Object.assign(m, { x: terminal.x, z: terminal.z, speed: 0 });
    assert.equal(m.canPark, false, 'stopping on the road never parks');
    assert.ok(nearestRoad(m.goal).distance > CITY.roadHalfWidth + 6);
    Object.assign(m, m.goal);
    assert.ok(inLoadingYard(m, destination) && m.canPark && !m.offRoad, 'the destination is a drivable loading yard');
  }
});

test('slow-frame substeps retain similar free-drive journey timing', () => {
  const fast = finish(new DrivingModel('mall'), undefined, 1 / 120), slow = finish(new DrivingModel('mall'), undefined, 0.1);
  assert.ok(Math.abs(fast.elapsed - slow.elapsed) < 0.8);
  assert.ok(slow.canPark && fast.canPark);
});

test('a delivery drive pays for beating par, a little for a fair time, and nothing slower; the clock reads m:ss', () => {
  assert.deepEqual(DRIVE_PAR, { fast: 60, fair: 80, fastBonus: 200, fairBonus: 100 });
  assert.equal(parBonus(40), 200);
  assert.equal(parBonus(60), 200);
  assert.equal(parBonus(60.1), 100);
  assert.equal(parBonus(80), 100);
  assert.equal(parBonus(80.1), 0);
  assert.equal(parBonus(Number.NaN), 0);
  assert.equal(parBonus(-1), 0);
  assert.equal(driveClock(0), '0:00');
  assert.equal(driveClock(75), '1:15');
  assert.equal(driveClock(64.9), '1:04');
  assert.equal(driveClock(-3), '0:00');
});
