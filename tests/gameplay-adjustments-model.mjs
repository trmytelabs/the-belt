import assert from 'node:assert/strict';
import test from 'node:test';
import { ShiftModel3D } from '../src/three/ShiftModel3D.ts';
import { DEPOT_3D_LAYOUT as L } from '../src/three/layout.ts';
import { ROUTE_INFO, ROUTES, MESA_CATCH_PENALTY, parcelAddress, routeForStreet, streetRange } from '../src/three/addresses.ts';

const advance = (model, ms) => { for (let time = 0; time < ms; time += 10) model.update(Math.min(10, ms - time)); };
const seeded = (initial = 1234) => {
  let seed = initial;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
};

test('3D street ranges have inclusive boundaries, no overlaps, and identical neutral styling', () => {
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

test('slower 3D freight mixes ordinary items with named references and keeps belt spacing', () => {
  const model = new ShiftModel3D({ autonomousCoworker: false, freightRandom: seeded() });
  const originalAddress = parcelAddress(model.packages[0]);
  for (let time = 0; time < 178_000; time += 10) {
    // Synthetic collection isolates intake from the backlog failure condition.
    for (const parcel of model.packages) if (parcel.y > 500) parcel.state = 'delivered';
    model.update(10);
    const belt = model.packages.filter(parcel => parcel.state === 'belt').sort((a,b) => a.y-b.y);
    for (let i = 1; i < belt.length; i++) assert.ok(belt[i].y-belt[i-1].y >= L.parcelGap - 1e-7);
    if (time === 4_000) assert.equal(model.packages.length, 1);
    if (time === 4_800) assert.equal(model.packages.length, 2);
  }
  assert.ok(model.packages.length >= 55 && model.packages.length <= 70, 'slower intake still provides a full shift');
  const labels = new Set(model.packages.map(parcel => parcel.label));
  for (const label of ['BOOKS','CLOTHING','SPORTS EQUIPMENT','DOCUMENTS','MESA BOOGIE','LE DUCK','MAKEUP LOTION']) assert.ok(labels.has(label), label);
  for (const parcel of model.packages) if (parcel.route !== 'C') {
    assert.equal(routeForStreet(parcel.street), parcel.route);
    assert.match(parcel.address, /^\d+ \d+ ST$/);
  }
  assert.equal(parcelAddress(model.packages[0]), originalAddress);
});

test('3D parcels retain their address through pickup, a floor put-down and truck loading', () => {
  for (const activeIndex of [0, 1]) {
    const model = new ShiftModel3D({ autonomousCoworker: false });
    model.activeIndex = activeIndex; model.eventStopped = true;
    const worker = model.activeWorker, parcel = model.packages[0];
    const route = activeIndex ? 'B' : 'A';
    Object.assign(parcel, { route, kind: 'smallbox', size: 'normal', y: 400,
      street: activeIndex ? 70 : 30, address: activeIndex ? '1234 70 ST' : '1234 30 ST' });
    const address = parcelAddress(parcel);
    Object.assign(worker, { x: activeIndex ? 560 : 400, y: 400 });
    model.action();
    assert.equal(worker.heldId, parcel.id);
    assert.ok(Math.abs(parcel.x-worker.x) >= 42);
    worker.x = activeIndex ? 595 : 365;
    model.action();
    assert.equal(parcel.state, 'floor');
    model.action();
    assert.equal(parcel.state, 'held');
    Object.assign(worker, L.playerTrucks[route]);
    model.action();
    assert.equal(parcel.state, 'delivered');
    assert.equal(model.truckLoads.get(parcel.id).route, route);
    assert.equal(parcelAddress(parcel), address);
  }
});

test('throwing to the wrong lower-floor address costs a tiny penalty without a dispatch', () => {
  const model = new ShiftModel3D({ autonomousCoworker: false, random: () => 0.99 });
  model.eventStopped = true; model.score = 1000;
  const worker = model.activeWorker, parcel = model.packages[0];
  Object.assign(parcel, { route: 'D', kind: 'smallbox', size: 'normal', state: 'held', workerId: worker.id });
  Object.assign(worker, { x: 330, y: L.stairs.centerY, heldId: parcel.id });
  assert.equal(model.throwTarget().route, 'T');
  model.throwHeld(); advance(model, 700);
  assert.equal(model.sorted, 0);
  assert.equal(parcel.state, 'floor');
  assert.equal(model.wrongDrops, 1);
  assert.equal(model.score, 990);
});

test('3D Mesa catch deducts points without ending or rewinding the shift, including a low score', () => {
  const model = new ShiftModel3D();
  model.score = 1000; model.combo = 7; model.elapsedMs = 35_000;
  assert.equal(model.penalizeMesaTheft(), MESA_CATCH_PENALTY);
  assert.equal(model.score, 500);
  assert.equal(model.combo, 0);
  assert.equal(model.elapsedMs, 35_000);
  assert.equal(model.ended, false);
  model.score = 40;
  assert.equal(model.penalizeMesaTheft(), 40);
  assert.equal(model.score, 0);
});
