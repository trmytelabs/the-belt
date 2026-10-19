import assert from 'node:assert/strict';
import test from 'node:test';
import { ShiftModel } from '../src/game/slice/ShiftModel.ts';
import { ShiftModel3D } from '../src/three/ShiftModel3D.ts';
import { DEPOT_3D_LAYOUT as L } from '../src/three/layout.ts';
import { ROUTE_INFO, ROUTES, parcelStreet } from '../src/three/addresses.ts';
import { sortingGuide } from '../src/three/sortingGuide.ts';

test('recovery allows six parcels, fails on seven, and rescuing one frees capacity', () => {
  for (const rescue of [false, true]) {
    const m = new ShiftModel3D({ autonomousCoworker: false });
    m.eventStopped = true;
    const template = { ...m.packages[0], route: 'A', state: 'missed', ...L.recoveryPile };
    m.packages.splice(0, m.packages.length, ...Array.from({ length: 6 }, (_, i) => ({ ...template, id: i + 1 })));
    m.update(10);
    assert.equal(m.ended, false);
    if (rescue) {
      Object.assign(m.activeWorker, { x: 400, y: L.recoveryPile.y });
      m.action(); assert.equal(m.pileup, 5); assert.equal(m.heldPackage.recovered, true);
    }
    m.packages.push({ ...template, id: 7 }); m.update(10);
    assert.equal(m.ended, !rescue);
    if (!rescue) assert.match(m.drainEvents().find(e => e.type === 'end').message, /before 7 stack up/);
  }
  const legacy = new ShiftModel();
  assert.equal(legacy.capacity, 5); assert.equal(legacy.cleanupMs, 10000);
});

test('25-second cleanup leaves time to finish a carried parcel; the deadline still ends a short shift', () => {
  const m = new ShiftModel3D({ autonomousCoworker: false });
  m.eventStopped = true; m.elapsedMs = m.durationMs + 10000;
  Object.assign(m.packages[0], { state: 'held', workerId: 'termite' });
  m.activeWorker.heldId = m.packages[0].id;
  m.update(10); assert.equal(m.ended, false);
  m.elapsedMs = m.durationMs + 24990;
  m.update(10); assert.equal(m.ended, true); assert.equal(m.won, false);
});

test('even the heaviest carried parcel can keep up with the final belt; no input leaves the player in control', () => {
  for (const kind of ['envelope', 'smallbox', 'standard', 'longbox', 'mesa', 'atv']) {
    const m = new ShiftModel3D({ autonomousCoworker: false });
    m.elapsedMs = 140000;
    const p = m.packages[0]; Object.assign(p, { state: 'held', kind, workerId: 'termite' });
    Object.assign(m.activeWorker, { x: 400, y: 500, heldId: p.id });
    m.update(100, { x: 0, y: 1 });
    assert.ok(m.activeWorker.y >= 521.7, `${kind} has a forgiving carry speed`);
    assert.ok(m.activeWorker.y - 500 > m.beltSpeed / 10 * 2.5);
    const before = { x: m.activeWorker.x, y: m.activeWorker.y };
    m.update(100);
    assert.deepEqual({ x: m.activeWorker.x, y: m.activeWorker.y }, before);
  }
});

test('the guide names all seven destinations and only asks to load inside the correct truck', () => {
  for (const route of ROUTES) {
    const m = new ShiftModel3D({ autonomousCoworker: false });
    const info = ROUTE_INFO[route]; m.activeIndex = info.side === 'right' ? 1 : 0;
    const p = m.packages[0];
    Object.assign(p, { route, street: info.streets?.[0], address: undefined, state: 'held', workerId: m.activeWorker.id });
    m.activeWorker.heldId = p.id;
    assert.match(sortingGuide(m, false).title, new RegExp(info.name));
    if (info.kind === 'truck') {
      assert.ok(sortingGuide(m, false).detail.includes(info.caption));
      assert.doesNotMatch(sortingGuide(m, false).detail, /enter/i);
      Object.assign(m.activeWorker, { x: m.activeIndex ? 630 : 330, y: L.playerTrucks[route].y });
      assert.match(sortingGuide(m, false).detail, /^2 ·/);
    }
    Object.assign(m.activeWorker, m.deliveryPoint(p));
    assert.match(sortingGuide(m, false).detail, /^3 · SPACE ·/);
    assert.match(sortingGuide(m, true).detail, /GRAB \/ DELIVER/);
  }
  assert.equal(parcelStreet({ id: 1, route: 'T', address: '2417 119 ST' }), '119 ST');
});
