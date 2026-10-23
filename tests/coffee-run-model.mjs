import assert from 'node:assert/strict';
import test from 'node:test';
import { COFFEE_HAZARDS, COFFEE_ROUTE, COFFEE_RUN, CUP_SPOTS, CoffeeRunModel } from '../src/three/coffeeRun.ts';
import { CITY, CITY_SIGNALS, nearestRoad } from '../src/three/drivingCity.ts';

// The Timmies run: thirty seconds of Termite's driving with Skanky holding two trays of coffees.

const FRAME = 1000 / 60;
/** Runs a whole ride, steering the trays with `hands` (given the run, it returns the controls), and keeps every event. */
const ride = (hands = () => ({ x: 0, y: 0 }), seed) => {
  const run = new CoffeeRunModel(seed === undefined ? {} : { seed });
  const events = [];
  let maxLevel = 0;
  while (!run.done) {
    run.update(FRAME, hands(run));
    maxLevel = Math.max(maxLevel, run.level);
    for (const event of run.drainEvents()) events.push({ ...event, at: run.elapsedMs, distance: run.distance, speed: run.speed });
  }
  return { run, events, maxLevel };
};
/** A steady pair of hands: tilts each way exactly against the car's push. */
const steady = (run) => ({ x: Math.max(-1, Math.min(1, run.acceleration.right / COFFEE_RUN.tiltPush)), y: -Math.max(-1, Math.min(1, run.acceleration.forward / COFFEE_RUN.tiltPush)) });

test('the route keeps to the city\'s streets, from the coffee crossing to the UPS gate, in the right-hand lanes', () => {
  assert.ok(COFFEE_ROUTE.length > 260 && COFFEE_ROUTE.length < 300, `${COFFEE_ROUTE.length} m`);
  for (const point of COFFEE_ROUTE.points) assert.ok(nearestRoad(point).distance < CITY.roadHalfWidth - 1, `on the road at ${JSON.stringify(point)}`);
  const [start] = COFFEE_ROUTE.points, end = COFFEE_ROUTE.points.at(-1);
  assert.ok(Math.hypot(start.x - 0, start.z + 160) < 15, 'it starts by the coffee crossing');
  assert.ok(Math.hypot(end.x + 60, end.z - 80) < 6, 'and ends at the UPS gate');
  assert.ok(CITY_SIGNALS.some((signal) => signal.id === COFFEE_ROUTE.signal), 'its red light is a real signal');
  const kinds = COFFEE_ROUTE.landmarks.map((landmark) => landmark.kind);
  assert.deepEqual([kinds.filter((kind) => kind === 'parked-car').length, kinds.filter((kind) => kind === 'speed-bump').length], [1, 1]);
  assert.ok(kinds.filter((kind) => kind === 'pothole').length >= 3);
});

test('thirty seconds of driving: every hazard warned well ahead, in order, with a late stop at the red light', () => {
  const { run, events } = ride(steady);
  assert.equal(run.done, true);
  assert.ok(Math.abs(run.elapsedMs - COFFEE_RUN.durationMs) < 10);
  const warnings = events.filter((event) => event.type === 'warn').map((event) => event.hazard.kind);
  assert.deepEqual(warnings, ['pothole', 'swerve', 'red-light', 'green', 'turn-right', 'speed-bump', 'turn-left', 'potholes']);
  // Each bump comes a second or so after its warning.
  const firstWarning = (kind) => events.find((event) => event.type === 'warn' && event.hazard.kind === kind);
  const bumps = events.filter((event) => event.type === 'bump');
  assert.equal(bumps.length, 6, 'a pothole, the speed bump\'s two wheels, three potholes');
  const pothole = firstWarning('pothole'), speedBump = firstWarning('speed-bump');
  assert.ok(bumps[0].at - pothole.at > 800 && bumps[0].at - pothole.at < 1500, `${bumps[0].at - pothole.at} ms`);
  assert.ok(bumps[1].at - speedBump.at > 800 && bumps[1].at - speedBump.at < 1500);
  // The red light: Termite brakes hard, waits, then the green and the right turn straight after.
  const red = firstWarning('red-light'), green = firstWarning('green');
  assert.ok(green.at - red.at > COFFEE_RUN.warnMs + 1500, 'a real wait at the light');
  assert.ok(firstWarning('turn-right').at >= green.at, 'the turn after the light is warned only once it goes green');
  assert.equal(run.released, true);
  assert.ok(run.distance > 200 && run.distance < COFFEE_ROUTE.length, `most of the way to the gate: ${run.distance} m`);
  assert.deepEqual(COFFEE_HAZARDS['turn-right'].hint, 'lean right');
});

/** Keys pressed as a player does, a reaction (`delayMs`) behind the gauge: toward the middle while the dot is off it. */
const keys = (delayMs, margin = 0.15) => {
  const seen = [];
  return (run) => {
    seen.push({ forward: run.slosh.forward, right: run.slosh.right });
    const was = seen[Math.max(0, seen.length - 1 - Math.round(delayMs / FRAME))];
    return { x: Math.abs(was.right) > margin ? -Math.sign(was.right) : 0, y: Math.abs(was.forward) > margin ? Math.sign(was.forward) : 0 };
  };
};

test('hands that never move spill most of the coffee; steady hands keep all eight for 300 points', () => {
  const idle = ride();
  assert.ok(idle.run.cupsLeft <= 4, `${idle.run.cupsLeft} coffees left`);
  const spills = idle.events.filter((event) => event.type === 'spill');
  assert.equal(spills.length, COFFEE_RUN.cups - idle.run.cupsLeft);
  assert.deepEqual(spills.map((event) => event.left), spills.map((_, i) => COFFEE_RUN.cups - 1 - i));
  assert.equal(new Set(spills.map((event) => event.cup)).size, spills.length, 'each cup spills once');
  for (let i = 1; i < spills.length; i++) assert.ok(spills[i].at - spills[i - 1].at >= COFFEE_RUN.spillGapMs - 10, 'one cup at a time');
  const good = ride(steady);
  assert.equal(good.run.cupsLeft, 8);
  assert.equal(good.run.points, 8 * COFFEE_RUN.pointsPerCup + COFFEE_RUN.allSafeBonus);
  assert.ok(good.maxLevel < 1, `never at the rim: ${good.maxLevel}`);
  const done = good.events.at(-1);
  assert.deepEqual([done.type, done.cups, done.points], ['done', 8, 300]);
});

test('the keys pressed toward the middle keep every coffee, even a slow reaction behind the gauge', () => {
  // The owner found the run too hard: a key tilts all the way, which threw the coffee past the middle and back.
  for (const delayMs of [250, 400]) assert.equal(ride(keys(delayMs)).run.cupsLeft, 8, `${delayMs} ms behind`);
  assert.ok(ride(keys(500, 0.3)).run.cupsLeft >= 6, 'and a sloppy pair of hands keeps most');
});

test('barely-trying hands keep some: the points are 25 a coffee, with the bonus only for all eight', () => {
  const half = ride((run) => { const full = steady(run); return { x: full.x * 0.2, y: full.y * 0.2 }; });
  assert.ok(half.run.cupsLeft > 0 && half.run.cupsLeft < 8, `${half.run.cupsLeft} coffees`);
  assert.equal(half.run.points, half.run.cupsLeft * COFFEE_RUN.pointsPerCup);
});

test('the coffee goes the way the car throws it, and tilting the trays against it holds it', () => {
  // Pulling away from Tim Hortons throws the coffee back, toward Skanky.
  const run = new CoffeeRunModel();
  for (let t = 0; t < 600; t += FRAME) run.update(FRAME);
  assert.ok(run.acceleration.forward > 2 && run.slosh.forward < -0.3, JSON.stringify({ a: run.acceleration, s: run.slosh }));
  // Leaning forward just enough (W, held part way on a stick: the controls' y is back) holds it in the middle; all
  // the way (a key), the trays tilt only as far as holds it there too, rather than overcorrecting it forward.
  const leaning = new CoffeeRunModel(), over = new CoffeeRunModel();
  for (let t = 0; t < 600; t += FRAME) { leaning.update(FRAME, { x: 0, y: -2.8 / COFFEE_RUN.tiltPush }); over.update(FRAME, { x: 0, y: -1 }); }
  assert.ok(Math.abs(leaning.slosh.forward) < 0.1, `held: ${leaning.slosh.forward}`);
  assert.ok(Math.abs(over.slosh.forward) < 0.15 && over.tilt.forward < 0.9, `a full key holds it too: ${over.slosh.forward}, tilt ${over.tilt.forward}`);
  // Away from the middle, the trays follow the controls at a hand's pace, not at once.
  const quick = new CoffeeRunModel();
  quick.slosh.right = 0.5;
  quick.update(50, { x: 1, y: 0 });
  assert.ok(quick.tilt.right > 0.1 && quick.tilt.right < 0.3, `${quick.tilt.right}`);
  // A spill takes the cup furthest toward the coffee: to the passenger's side, the door tray's outer cups.
  const spilling = new CoffeeRunModel();
  spilling.slosh.right = 1.2;
  spilling.update(FRAME);
  const spill = spilling.drainEvents().find((event) => event.type === 'spill');
  assert.ok(spill && CUP_SPOTS[spill.cup].right === Math.max(...CUP_SPOTS.map((spot) => spot.right)), JSON.stringify(spill));
});

test('a ride is the same each time for the same hands, and odd controls or frames change nothing', () => {
  const a = ride(steady), b = ride(steady);
  assert.deepEqual([a.run.cupsLeft, a.run.distance, a.events.length], [b.run.cupsLeft, b.run.distance, b.events.length]);
  const odd = new CoffeeRunModel();
  odd.update(FRAME, { x: Number.NaN, y: Infinity });
  odd.update(-5); odd.update(Number.NaN);
  assert.ok(Number.isFinite(odd.tilt.right) && Number.isFinite(odd.tilt.forward) && Number.isFinite(odd.slosh.forward));
  // A long frame is taken in fixed steps, a quarter second at most.
  const lagged = new CoffeeRunModel();
  lagged.update(5_000);
  assert.ok(lagged.elapsedMs <= 251);
  const finished = ride(steady).run, before = finished.elapsedMs;
  finished.update(1_000, { x: 1, y: 1 });
  assert.equal(finished.elapsedMs, before, 'nothing moves once the ride is over');
});
