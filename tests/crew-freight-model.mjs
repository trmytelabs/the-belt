import assert from 'node:assert/strict';
import test from 'node:test';
import { CrewFreightTrip } from '../src/three/crewFreight.ts';

test('a crew box visibly rides the tread before pickup, and the same trip lifts into the hands', () => {
  const trip = new CrewFreightTrip(1000, 200, 548, 60);
  assert.equal(trip.sample(1000, 200).beltY, 470);
  assert.equal(trip.sample(1500, 230).beltY, 500);
  assert.equal(trip.sample(1500, 230).lift, 0);
  const pickup = trip.sample(2300, 278);
  assert.equal(pickup.beltY, 548); assert.equal(pickup.cycle, 1300); assert.equal(pickup.lift, 0);
  assert.equal(trip.sample(2475, 288.5).lift, 0.5);
  assert.equal(trip.sample(2650, 299).lift, 1);
});

test('a braked or stopped belt keeps NPC freight in place and the worker waits instead of grabbing empty space', () => {
  const trip = new CrewFreightTrip(0, 0, 388, 50);
  const waiting = trip.sample(3000, 0);
  assert.equal(waiting.beltY, 323); assert.equal(waiting.cycle, 1299); assert.equal(waiting.lift, 0);
  assert.deepEqual(trip.sample(3000, 0), waiting, 'pause is stable');
  assert.equal(trip.sample(4000, 25).beltY, 348);
  assert.equal(trip.sample(4800, 65).cycle, 1300);
  assert.equal(trip.sample(5150, 82.5).lift, 1);
});

test('front-row crew freight starts on the visible belt; speed ramps retain the travel offset', () => {
  const trip = new CrewFreightTrip(0, 100, 228, 69.25);
  assert.equal(trip.sample(0, 100).beltY, 164);
  assert.equal(trip.sample(500, 125).beltY, 189);
  assert.equal(trip.sample(900, 155).beltY, 219);
  assert.equal(trip.sample(1300, 200).beltY, 228);
});
