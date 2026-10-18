import assert from 'node:assert/strict';
import test from 'node:test';
import { ShiftModel, SHIFT_LAYOUT, ROUTE_INFO, ROUTES, THROWING, MESA_CATCH_PENALTY, parcelAddress, routeForStreet, streetRange } from '../src/game/slice/ShiftModel.ts';

const advance = (model, ms) => { for (let time = 0; time < ms; time += 10) model.update(Math.min(10, ms - time)); };
const seeded = (initial = 1234) => {
  let seed = initial;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
};

test('street ranges have inclusive boundaries, no overlaps, and identical neutral styling', () => {
  assert.equal(ROUTE_INFO.A.name, 'MILL WOODS');
  assert.equal(ROUTE_INFO.A.owner, 'termite');
  assert.equal(new Set(ROUTES.map(route => ROUTE_INFO[route].color)).size, 1);
  for (const route of ROUTES.filter(route => route !== 'C')) {
    const [first, last] = ROUTE_INFO[route].streets;
    assert.equal(routeForStreet(first), route);
    assert.equal(routeForStreet(last), route);
    assert.match(streetRange(route), /^\d+–\d+ ST$/);
    for (let street = first; street <= last; street++) {
      assert.equal(ROUTES.filter(candidate => {
        const range = ROUTE_INFO[candidate].streets;
        return range && street >= range[0] && street <= range[1];
      }).length, 1);
    }
  }
  for (const invalid of [9, 200, 27.5, NaN]) assert.equal(routeForStreet(invalid), null);
});

test('triple freight mixes random ordinary items with every named reference and keeps belt spacing', () => {
  const model = new ShiftModel({ autonomousCoworker: false, freightRandom: seeded() });
  const originalAddress = parcelAddress(model.packages[0]);
  for (let time = 0; time < 178_000; time += 10) {
    // Synthetic collection isolates spawning from the failure condition.
    for (const parcel of model.packages) if (parcel.y > 500) parcel.state = 'delivered';
    model.update(10);
    const belt = model.packages.filter(parcel => parcel.state === 'belt').sort((a,b) => a.y-b.y);
    for (let i = 1; i < belt.length; i++) assert.ok(belt[i].y-belt[i-1].y >= SHIFT_LAYOUT.parcelGap - 1e-7);
    if (time === 4_000) assert.equal(model.packages.length, 3, 'three arrivals in the old first six-second window');
  }
  assert.ok(model.packages.length >= 130, 'the shift carries about triple its previous regular workload');
  const labels = new Set(model.packages.map(parcel => parcel.label));
  for (const label of ['BOOKS','CLOTHING','SPORTS EQUIPMENT','DOCUMENTS','MESA BOOGIE','LE DUCK','MAKEUP LOTION']) assert.ok(labels.has(label), label);
  for (const parcel of model.packages) {
    if (parcel.route !== 'C') {
      assert.equal(routeForStreet(parcel.street), parcel.route);
      assert.match(parcel.address, /^\d+ \d+ ST$/);
    }
  }
  assert.equal(parcelAddress(model.packages[0]), originalAddress);
});

test('the inactive worker walks, collects, carries down stairs and returns through them', () => {
  for (const activeIndex of [0, 1]) {
    const model = new ShiftModel();
    model.activeIndex = activeIndex;
    model.eventStopped = true;
    const active = model.activeWorker;
    const activePosition = { x: active.x, y: active.y };
    const other = model.workers[1-activeIndex];
    const parcel = model.packages[0];
    Object.assign(parcel, { route: other.side === 'left' ? 'T' : 'S', kind: 'smallbox', size: 'normal', y: 470 });
    let moved = false, held = false;
    for (let step = 0; step < 1_000 && parcel.state !== 'delivered'; step++) {
      model.update(10);
      moved ||= other.moving;
      held ||= other.heldId === parcel.id;
      assert.ok(model.walkable(other.side, other.x, other.y));
    }
    assert.ok(moved && held);
    assert.equal(parcel.state, 'delivered');
    assert.equal(model.sorted, 1);
    assert.deepEqual({ x: active.x, y: active.y }, activePosition);
    // The next parcel is back on the platform. Start outside the stair width.
    other.x = other.side === 'left' ? 450 : 510;
    const next = { ...parcel, id: 99, route: other.side === 'left' ? 'A' : 'B', state: 'belt', workerId: null, x: 480, y: 450, beltOffset: 450-model.beltTravel };
    model.packages.push(next);
    advance(model, 10_000);
    assert.equal(next.state, 'delivered');
    assert.equal(model.sorted, 2);
    model.paused = true;
    const frozen = JSON.stringify(model.workers);
    advance(model, 500);
    assert.equal(JSON.stringify(model.workers), frozen);
    model.paused = false;
    model.switchWorker();
    const controlled = { x: model.activeWorker.x, y: model.activeWorker.y };
    advance(model, 100);
    assert.deepEqual({ x: model.activeWorker.x, y: model.activeWorker.y }, controlled);
  }
});

test('a held parcel stays clear of either 2D worker and preserves its address through handoff', () => {
  const model = new ShiftModel({ autonomousCoworker: false });
  const parcel = model.packages[0];
  const address = parcelAddress(parcel);
  for (const side of [0, 1]) {
    model.activeIndex = side;
    const worker = model.activeWorker;
    Object.assign(worker, { x: side ? 560 : 400, y: 200 });
    model.action();
    assert.equal(worker.heldId, parcel.id);
    assert.ok(Math.abs(parcel.x-worker.x) >= 42);
    assert.equal(parcelAddress(parcel), address);
    model.action();
    assert.equal(parcel.state, 'belt');
  }
});

test('stair-top throws break at exactly 30 percent for ordinary and fragile freight on either side', () => {
  for (const side of [0, 1]) for (const kind of ['smallbox', 'makeup']) for (const roll of [0, 0.299999999, 0.3, 0.999]) {
    let calls = 0;
    const model = new ShiftModel({ autonomousCoworker: false, random: () => { calls++; return roll; } });
    model.eventStopped = true;
    model.activeIndex = side;
    const worker = model.activeWorker;
    const parcel = model.packages[0];
    Object.assign(parcel, { route: side ? 'S' : 'T', kind, size: 'normal' });
    Object.assign(worker, { x: side ? 560 : 400, y: 200 });
    model.action();
    Object.assign(worker, { y: SHIFT_LAYOUT.stairs.top });
    model.update(10);
    model.score = 1000;
    assert.equal(model.throwTarget().breakChance, 0.3);
    model.throwHeld();
    assert.equal(parcel.flight.downward, true);
    model.switchWorker();
    advance(model, THROWING.flightMs + 100);
    assert.equal(calls, 1);
    assert.equal(parcel.state, roll < 0.3 ? 'damaged' : 'delivered');
    assert.equal(model.score, roll < 0.3 ? 850 : 1100);
    assert.equal(model.ended, false);
    advance(model, 100);
    assert.equal(calls, 1);
  }
});

test('throwing does not solve an address: the nearby wrong drop earns no dispatch', () => {
  const model = new ShiftModel({ autonomousCoworker: false, random: () => 0.99 });
  const parcel = model.packages[0];
  Object.assign(parcel, { route: 'D', kind: 'smallbox', size: 'normal' });
  Object.assign(model.activeWorker, { x: 400, y: 200 });
  model.action();
  Object.assign(model.activeWorker, { y: 400 });
  model.update(10);
  assert.equal(model.throwTarget().route, 'A');
  model.throwHeld();
  advance(model, 700);
  assert.equal(model.sorted, 0);
  assert.equal(parcel.state, 'floor');
  assert.equal(model.errors, 1);
});

test('Mesa catch deducts points without ending or rewinding the shift, including a low score', () => {
  const model = new ShiftModel();
  model.score = 1000;
  model.combo = 7;
  model.elapsedMs = 35_000;
  assert.equal(model.penalizeMesaTheft(), MESA_CATCH_PENALTY);
  assert.equal(model.score, 500);
  assert.equal(model.combo, 0);
  assert.equal(model.elapsedMs, 35_000);
  assert.equal(model.ended, false);
  model.score = 40;
  assert.equal(model.penalizeMesaTheft(), 40);
  assert.equal(model.score, 0);
});
