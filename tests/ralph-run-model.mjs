import assert from 'node:assert/strict';
import test from 'node:test';
import { RALPH_LINES, RALPH_RUN, RALPH_STOPS, RalphRunModel } from '../src/three/ralphRun.ts';
import { CITY_BUILDINGS, nearestRoad } from '../src/three/drivingCity.ts';

// The Ralph run: Termite's five-ton paper route with Ralph, throwing each business its parcel out of the window.

const SOUTH = Math.PI / 2;
/** Drives a straight line past a point at `speed`, from `start` metres before it, throwing when `throwAt` metres before it. */
const driveBy = (run, { x, z, heading, speed, start = 20, throwAt }) => {
  const forward = { x: Math.cos(heading), z: -Math.sin(heading) };
  let along = -start, thrown = false;
  while (along < 15) {
    const truck = { x: x + forward.x * along, z: z + forward.z * along, heading, speed };
    if (!thrown && along >= -throwAt) { run.throwParcel(truck); thrown = true; }
    run.update(1000 / 60);
    along += speed / 60;
  }
  for (let t = 0; t < 1000; t += 1000 / 60) run.update(1000 / 60);
  return run.drainEvents();
};

test('eight businesses on the sidewalks of the loop by the depot, clear of every building', () => {
  assert.equal(RALPH_STOPS.length, 8);
  assert.equal(new Set(RALPH_STOPS.map((stop) => stop.name)).size, 8);
  for (const stop of RALPH_STOPS) {
    assert.ok(Math.abs(nearestRoad(stop).distance - 8.5) < 1e-9, `${stop.name} on a sidewalk`);
    assert.ok(!CITY_BUILDINGS.some((b) => Math.abs(stop.x - b.x) < b.width / 2 + 1 && Math.abs(stop.z - b.z) < b.depth / 2 + 1), `${stop.name} clear of buildings`);
  }
});

test('Ralph says the owner\'s notes about him, in order, one every eight seconds from the third', () => {
  assert.deepEqual(RALPH_LINES, [
    "I've had three sets of triplets.", 'All of them with the initials T.N.T.', "I'm rich too, you know.", 'I live in a penthouse.',
    "I'm only doing this job till I can retire.", 'Got three houses in Florida.', 'I was in the military.', 'Shot people escaping the brig.',
  ]);
  const run = new RalphRunModel();
  const said = [];
  for (let t = 0; t < 70_000; t += 50) {
    run.update(50);
    for (const event of run.drainEvents()) if (event.type === 'line') said.push({ at: run.elapsedMs, line: event.line });
  }
  assert.deepEqual(said.map((entry) => entry.line), [...RALPH_LINES]);
  said.forEach((entry, index) => assert.ok(Math.abs(entry.at - (RALPH_RUN.firstLineMs + index * RALPH_RUN.lineEveryMs)) <= 50));
});

test('a throw led a little before the business lands on its mark; thrown late it lands past it', () => {
  // The barber on the right of the x = −60 street, the truck in the right-hand lane, southbound at 8 m/s.
  const barber = RALPH_STOPS[0];
  const lane = { x: -56.5, z: barber.z, heading: SOUTH, speed: 8 };
  // The parcel keeps the truck's speed: thrown when the window is about its flight's travel short of the mark.
  const lead = RALPH_RUN.window.forward + 8 * RALPH_RUN.flightMs / 1000;
  const good = new RalphRunModel();
  const events = driveBy(good, { ...lane, throwAt: lead });
  const hit = events.find((event) => event.type === 'hit');
  assert.ok(hit && hit.stop.name === 'BARBER', JSON.stringify(events.filter((event) => event.type !== 'line')));
  assert.equal(good.stops[0].delivered, true);
  assert.equal(good.parcelsLeft, RALPH_RUN.parcels - 1);
  assert.equal(good.points, hit.points);
  // Thrown as the cab passes the business, the parcel sails on past its mark.
  const late = new RalphRunModel();
  const lateEvents = driveBy(late, { ...lane, throwAt: -2 });
  assert.ok(lateEvents.some((event) => event.type === 'miss') && !lateEvents.some((event) => event.type === 'hit'));
  assert.equal(late.points, 0);
});

test('it goes out of the window on the stop\'s side, judged across the street; dead on pays extra', () => {
  const run = new RalphRunModel();
  // Southbound past the pizza place on the left (x −68.5), from the right-hand lane: the throw crosses the street.
  const pizza = RALPH_STOPS[1];
  const truck = { x: -56.5, z: pizza.z + 7.3, heading: SOUTH, speed: 10 };
  assert.equal(run.sideFor(truck), 'left');
  assert.equal(run.sideFor({ ...truck, x: -56.5, z: RALPH_STOPS[0].z + 6 }), 'right');
  const parcel = run.throwParcel(truck);
  assert.ok(Math.abs(parcel.to.x - pizza.x) < 1e-6, `across the street to the sidewalk: ${parcel.to.x}`);
  for (let t = 0; t < 1000; t += 50) run.update(50);
  const hit = run.drainEvents().find((event) => event.type === 'hit');
  assert.ok(hit && hit.stop.name === 'PIZZA');
  // Landing within a bullseye of the mark pays the extra.
  assert.equal(hit.bullseye, Math.hypot(parcel.to.x - pizza.x, parcel.to.z - pizza.z) <= RALPH_RUN.bullseye);
  assert.equal(hit.points, RALPH_RUN.hitPoints + (hit.bullseye ? RALPH_RUN.bullseyePoints : 0));
  // A served stop takes nothing more; the HUD's next stop follows the loop from the last served.
  assert.equal(run.routeNext({ x: 0, z: 0 }).stop.name, 'PAWN SHOP');
});

test('the run ends with every stop served (seconds to spare pay), at the clock, or out of parcels', () => {
  const all = new RalphRunModel();
  for (const stop of all.stops) stop.delivered = true;
  all.points = 400;
  all.update(10);
  const done = all.drainEvents().find((event) => event.type === 'done');
  assert.equal(done.reason, 'all');
  assert.equal(all.points, 400 + Math.floor(all.remainingMs / 1000) * RALPH_RUN.secondPoints);
  const clock = new RalphRunModel();
  for (let t = 0; t < RALPH_RUN.durationMs + 500; t += 250) clock.update(250);
  assert.equal(clock.drainEvents().find((event) => event.type === 'done')?.reason, 'time');
  assert.equal(clock.done, true);
  const empty = new RalphRunModel();
  const far = { x: 0, z: 200, heading: 0, speed: 0 };
  for (let i = 0; i < RALPH_RUN.parcels; i++) empty.throwParcel(far);
  assert.equal(empty.throwParcel(far), null, 'nothing left to throw');
  for (let t = 0; t < 1000; t += 50) empty.update(50);
  const events = empty.drainEvents();
  assert.ok(events.some((event) => event.type === 'empty'));
  assert.equal(events.find((event) => event.type === 'done')?.reason, 'parcels');
});
