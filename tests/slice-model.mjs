import assert from 'node:assert/strict';
import test from 'node:test';

import { ShiftModel, SHIFT_LAYOUT } from '../src/game/slice/ShiftModel.ts';

function advance(model, milliseconds, move = { x: 0, y: 0 }, frame = 20) {
  for (let time = 0; time < milliseconds; time += frame) model.update(Math.min(frame, milliseconds - time), move);
}

function reachFirst(model) {
  model.activeWorker.x = 400;
  model.activeWorker.y = 200;
  model.action();
  assert.equal(model.heldPackage?.id, 1);
}

test('belt parcels stay locked to tread travel, including speed changes and brake', () => {
  const model = new ShiftModel();
  const parcel = model.packages[0];
  const offset = parcel.y - model.beltTravel;
  for (const elapsed of [0, 36_000, 63_000]) {
    model.elapsedMs = elapsed;
    const beforeY = parcel.y;
    const beforeTravel = model.beltTravel;
    model.update(80);
    assert.ok(Math.abs((parcel.y - beforeY) - (model.beltTravel - beforeTravel)) < 1e-9);
    assert.ok(Math.abs(parcel.y - model.beltTravel - offset) < 1e-9);
  }
  model.brake();
  const stoppedY = parcel.y;
  const stoppedTravel = model.beltTravel;
  advance(model, 2_000);
  assert.equal(parcel.y, stoppedY);
  assert.equal(model.beltTravel, stoppedTravel);
  advance(model, 100);
  assert.ok(parcel.y > stoppedY);
  assert.ok(Math.abs(parcel.y - model.beltTravel - offset) < 1e-9);
});

test('same elapsed time produces equivalent belt positions at 50 and 100 fps', () => {
  const first = new ShiftModel();
  const second = new ShiftModel();
  advance(first, 5_000, { x: 0, y: 0 }, 20);
  advance(second, 5_000, { x: 0, y: 0 }, 10);
  assert.equal(first.beltTravel, second.beltTravel);
  assert.deepEqual(first.packages, second.packages);
});

test('paused state is stable and ignores all gameplay input', () => {
  const model = new ShiftModel();
  reachFirst(model);
  model.paused = true;
  const snapshot = JSON.stringify(model);
  model.update(100, { x: -1, y: 1 });
  model.action();
  model.switchWorker();
  model.brake();
  assert.equal(JSON.stringify(model), snapshot);
});

test('large background-tab frame is capped instead of skipping freight', () => {
  const model = new ShiftModel();
  model.update(60_000);
  assert.equal(model.elapsedMs, 100);
  assert.equal(model.beltTravel, 5);
  model.update(Number.NaN);
  assert.equal(model.elapsedMs, 100);
});

test('movement normalizes diagonals, respects lane bounds, and slows heavy carries', () => {
  const straight = new ShiftModel();
  const diagonal = new ShiftModel();
  straight.activeWorker.x = diagonal.activeWorker.x = 310;
  const initial = { x: 310, y: 380 };
  straight.update(100, { x: -1, y: 0 });
  diagonal.update(100, { x: -1, y: 1 });
  const displacement = (worker) => Math.hypot(worker.x - initial.x, worker.y - initial.y);
  assert.ok(Math.abs(displacement(straight.activeWorker) - displacement(diagonal.activeWorker)) < 1e-9);
  const heavy = new ShiftModel();
  heavy.packages[0].size = 'heavy';
  reachFirst(heavy);
  const startY = heavy.activeWorker.y;
  heavy.update(100, { x: 0, y: 1 });
  assert.ok(Math.abs(heavy.activeWorker.y - startY - 17) < 1e-9);
  advance(heavy, 5_000, { x: 1, y: 1 });
  assert.equal(heavy.activeWorker.x, 400);
  assert.equal(heavy.activeWorker.y, 580);
});

test('correct sort is explicit, releases contact, and rewards a continued streak', () => {
  const model = new ShiftModel();
  reachFirst(model);
  model.activeWorker.x = 260;
  model.activeWorker.y = 300;
  model.update(20);
  assert.equal(model.sorted, 0, 'walking into a dock must not silently submit freight');
  model.action();
  assert.equal(model.sorted, 1);
  assert.equal(model.score, 100);
  assert.equal(model.activeWorker.heldId, null);
  assert.equal(model.packages[0].state, 'delivered');
  advance(model, 6_000);
  model.switchWorker();
  model.activeWorker.x = 560;
  model.activeWorker.y = model.packages[1].y + 12;
  model.action();
  model.activeWorker.x = 700;
  model.activeWorker.y = 300;
  model.action();
  assert.equal(model.sorted, 2);
  assert.equal(model.score, 215);
  assert.equal(model.bestCombo, 2);
});

test('wrong dock keeps the parcel and gives one route-specific explanation per press', () => {
  const model = new ShiftModel();
  reachFirst(model);
  model.activeWorker.x = 260;
  model.activeWorker.y = 492;
  model.drainEvents();
  model.action();
  const events = model.drainEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'wrong');
  assert.match(events[0].message, /A.*left dock/);
  assert.equal(model.heldPackage.id, 1);
  assert.equal(model.sorted, 0);
  advance(model, 1_000);
  assert.equal(model.drainEvents().length, 0, 'feedback should not repeat every frame');
});

test('occupied belt placement is rejected; successful handoff preserves shared travel', () => {
  const model = new ShiftModel();
  reachFirst(model);
  model.packages.push({ ...model.packages[0], id: 99, state: 'belt', workerId: null, x: 480, y: 200, beltOffset: 200 });
  model.action();
  assert.equal(model.heldPackage.id, 1);
  assert.match(model.drainEvents().at(-1).message, /occupied/);
  model.activeWorker.y = 300;
  model.action();
  assert.equal(model.heldPackage, null);
  const dropped = model.packages[0];
  assert.equal(dropped.state, 'belt');
  assert.equal(dropped.y - model.beltTravel, dropped.beltOffset);
  model.switchWorker();
  model.activeWorker.x = 560;
  model.activeWorker.y = 300;
  model.action();
  assert.equal(model.heldPackage.id, 1);
  assert.equal(dropped.workerId, 'skanky');
});

test('floor parcel remains still and can be recovered by its worker', () => {
  const model = new ShiftModel();
  reachFirst(model);
  model.activeWorker.x = 340;
  model.activeWorker.y = 390;
  model.action();
  const parcel = model.packages[0];
  assert.equal(parcel.state, 'floor');
  const position = { x: parcel.x, y: parcel.y };
  advance(model, 500);
  assert.deepEqual({ x: parcel.x, y: parcel.y }, position);
  model.action();
  assert.equal(model.heldPackage.id, parcel.id);
});

test('missed freight remains recoverable and never counts a second miss for the same parcel', () => {
  const model = new ShiftModel();
  advance(model, 8_800);
  assert.equal(model.pileup, 1);
  assert.equal(model.missed, 1);
  model.activeWorker.x = 400;
  model.activeWorker.y = 580;
  model.action();
  assert.equal(model.heldPackage.id, 1);
  assert.equal(model.pileup, 0);
  assert.equal(model.heldPackage.recovered, true);
  model.action();
  advance(model, 1_000);
  assert.equal(model.pileup, 1);
  assert.equal(model.missed, 1);
  model.action();
  model.activeWorker.x = 260;
  model.activeWorker.y = 300;
  model.action();
  assert.equal(model.sorted, 1);
  assert.equal(model.score, 50);
  assert.equal(model.pileup, 0);
});

test('five unattended parcels end the shift with an understandable recovery failure', () => {
  const model = new ShiftModel();
  advance(model, 40_000);
  assert.equal(model.ended, true);
  assert.equal(model.won, false);
  assert.equal(model.pileup, 5);
  const ending = model.drainEvents().find((event) => event.type === 'end');
  assert.match(ending.message, /five/);
});

test('the opening lesson keeps six-second arrivals and phases never bunch two arrivals together', () => {
  const model = new ShiftModel();
  const arrivals = [{ time: 0, route: model.packages[0].route }];
  let previousCount = 1;
  for (let time = 0; time < 45_000; time += 20) {
    for (const parcel of model.packages) parcel.state = 'delivered';
    model.update(20);
    if (model.packages.length > previousCount) {
      arrivals.push({ time: model.elapsedMs, route: model.packages.at(-1).route });
      previousCount = model.packages.length;
    }
  }
  assert.deepEqual(arrivals.slice(0, 6).map((arrival) => arrival.route), ['A', 'B', 'C', 'A', 'B', 'C']);
  assert.deepEqual(arrivals.map((arrival) => arrival.time), [0, 6_000, 12_000, 18_000, 24_000, 30_000, 36_000, 40_000, 44_000]);
});

test('original comic freight opens the shift without changing its teaching routes or carry weights', () => {
  const model = new ShiftModel();
  for (let time = 0; time < 30_000; time += 20) {
    for (const parcel of model.packages) parcel.state = 'delivered';
    model.update(20);
  }
  assert.deepEqual(model.packages.map(({ route, kind, label }) => ({ route, kind, label })), [
    { route: 'A', kind: 'mallwood', label: 'MALLWOOD RD EAST' },
    { route: 'B', kind: 'goji', label: 'GOJI BERRIES' },
    { route: 'C', kind: 'lobsters', label: 'LIVE LOBSTERS' },
    { route: 'A', kind: 'duck', label: 'LE DUCK' },
    { route: 'B', kind: 'makeup', label: 'MAKEUP LOTION' },
    { route: 'C', kind: 'mesa', label: 'MESA BOOGIE' },
  ]);
  assert.deepEqual(model.packages.map((parcel) => parcel.size), ['normal', 'normal', 'heavy', 'normal', 'normal', 'heavy']);
});

test('comic parcel identity survives pickup, handoff, pile recovery, and dispatch', () => {
  const model = new ShiftModel();
  const parcel = model.packages[0];
  const originalIdentity = { kind: parcel.kind, label: parcel.label, route: parcel.route };
  reachFirst(model);
  model.activeWorker.y = 550;
  model.action();
  model.switchWorker();
  model.activeWorker.x = 560;
  model.activeWorker.y = 550;
  model.action();
  assert.equal(model.heldPackage.id, parcel.id);
  model.action();
  advance(model, 1_300);
  assert.equal(parcel.state, 'missed');
  model.switchWorker();
  model.activeWorker.y = 580;
  model.action();
  assert.equal(model.heldPackage.id, parcel.id);
  model.activeWorker.x = 260;
  model.activeWorker.y = 300;
  model.action();
  assert.equal(parcel.state, 'delivered');
  assert.deepEqual({ kind: parcel.kind, label: parcel.label, route: parcel.route }, originalIdentity);
});

test('Brian announces once and sends exactly five bulk parcels before ordinary freight resumes', () => {
  const model = new ShiftModel();
  const arrivals = [{ time: 0, parcel: model.packages[0] }];
  const announcements = [];
  let previousCount = 1;
  for (let time = 0; time < 75_000; time += 20) {
    for (const parcel of model.packages) {
      if (parcel.y > 550) parcel.state = 'delivered';
    }
    model.update(20);
    if (model.packages.length > previousCount) {
      arrivals.push({ time: model.elapsedMs, parcel: model.packages.at(-1) });
      previousCount = model.packages.length;
    }
    const beltParcels = model.packages.filter((parcel) => parcel.state === 'belt').sort((a, b) => a.y - b.y);
    for (let index = 1; index < beltParcels.length; index += 1) {
      assert.ok(beltParcels[index].y - beltParcels[index - 1].y >= SHIFT_LAYOUT.parcelGap);
    }
    for (const event of model.drainEvents()) {
      if (event.message.startsWith('BRIAN:')) announcements.push({ time: model.elapsedMs, message: event.message });
    }
  }
  assert.deepEqual(announcements, [{ time: 63_000, message: 'BRIAN: SENDING 5 DOWN TO BULK!' }]);
  const burst = arrivals.slice(13, 18);
  assert.deepEqual(burst.map(({ time }) => time), [64_000, 65_900, 67_800, 69_700, 71_600]);
  assert.deepEqual(burst.map(({ parcel }) => parcel.kind), ['atv', 'lobsters', 'mesa', 'panchetters', 'mallwood']);
  assert.ok(burst.every(({ parcel }) => parcel.route === 'C' && parcel.size === 'heavy'));
  assert.equal(model.brianRemaining, 0);
  assert.equal(arrivals[18].time, 74_600);
  assert.equal(arrivals[18].parcel.route, 'A');
  assert.equal(arrivals[18].parcel.kind, 'snakes');
  assert.deepEqual(arrivals.slice(0, 13).map(({ time }) => time), [
    0, 6_000, 12_000, 18_000, 24_000, 30_000, 36_000, 40_000, 44_000, 48_000, 52_000, 56_000, 60_000,
  ], 'Brian must not change the first63seconds of teaching and ordinary freight');
});

test('pausing and braking Brian’s burst delay arrivals without consuming his remaining parcels', () => {
  const model = new ShiftModel();
  for (let time = 0; time < 64_000; time += 20) {
    for (const parcel of model.packages) parcel.state = 'delivered';
    model.update(20);
  }
  assert.equal(model.brianRemaining, 4);
  const firstBulk = model.packages.at(-1);
  const count = model.packages.length;
  const travel = model.beltTravel;
  model.paused = true;
  advance(model, 1_000);
  assert.equal(model.elapsedMs, 64_000);
  assert.equal(model.brianRemaining, 4);
  model.paused = false;
  model.brake();
  advance(model, 2_000);
  assert.equal(model.packages.length, count);
  assert.equal(model.brianRemaining, 4);
  assert.equal(model.beltTravel, travel);
  advance(model, 1_880);
  assert.equal(model.packages.length, count);
  model.update(20);
  assert.equal(model.packages.length, count + 1);
  assert.equal(model.brianRemaining, 3);
  const secondBulk = model.packages.at(-1);
  assert.equal(secondBulk.kind, 'lobsters');
  assert.ok(firstBulk.y - secondBulk.y >= SHIFT_LAYOUT.parcelGap);
});

test('intake closes at ninety seconds and unfinished freight receives ten seconds of cleanup', () => {
  const model = new ShiftModel();
  reachFirst(model);
  model.elapsedMs = 89_980;
  model.update(20);
  assert.equal(model.phase, 'cleanup');
  const count = model.packages.length;
  advance(model, 9_980);
  assert.equal(model.ended, false);
  assert.equal(model.packages.length, count);
  model.update(20);
  assert.equal(model.ended, true);
  assert.equal(model.won, false);
});

test('full deterministic shift is winnable through public movement and action inputs', () => {
  const model = new ShiftModel();
  const seen = new Set();
  for (let tick = 0; tick < 6_000 && !model.ended; tick += 1) {
    const held = model.heldPackage;
    let target;
    if (held) {
      target = { x: model.activeWorker.side === 'left' ? 260 : 700, y: held.route === 'C' ? 492 : 300 };
      if (Math.hypot(model.activeWorker.x - target.x, model.activeWorker.y - target.y) < 12) model.action();
    } else {
      const parcel = model.packages.filter((item) => item.state === 'belt' || item.state === 'missed' || item.state === 'floor').sort((a, b) => b.y - a.y)[0];
      if (parcel) {
        const intended = parcel.route === 'B' ? 1 : 0;
        if (model.activeIndex !== intended) model.switchWorker();
        target = { x: intended === 0 ? 400 : 560, y: Math.max(180, Math.min(580, parcel.y)) };
        if (Math.hypot(model.activeWorker.x - parcel.x, model.activeWorker.y - parcel.y) < SHIFT_LAYOUT.grabRadius - 1) model.action();
      }
    }
    const dx = target ? target.x - model.activeWorker.x : 0;
    const dy = target ? target.y - model.activeWorker.y : 0;
    const length = Math.hypot(dx, dy);
    model.update(20, { x: length > 3 ? dx / length : 0, y: length > 3 ? dy / length : 0 });
    seen.add(model.phase);
    for (const parcel of model.packages) {
      if (parcel.state === 'belt') assert.ok(Math.abs(parcel.y - model.beltTravel - parcel.beltOffset) < 1e-8);
    }
  }
  assert.equal(model.ended, true);
  assert.equal(model.won, true);
  assert.ok(model.sorted >= model.goal);
  assert.ok(model.sorted >= 20, 'the normal-input simulation should manage the whole representative workload');
  assert.deepEqual([...seen].filter((phase) => phase !== 'cleanup'), ['lesson', 'flow', 'rush', 'ended']);
  assert.equal(model.missed, 0);
  assert.deepEqual([...new Set(model.packages.map((parcel) => parcel.label))].sort(), [
    'MALLWOOD RD EAST', 'GOJI BERRIES', 'LIVE LOBSTERS', 'LE DUCK', 'MAKEUP LOTION',
    'MESA BOOGIE', 'PANCHETTERS', 'THE SNAKES CELL', 'SMALL ATV', 'PARCEL',
  ].sort(), 'all original comic parcel references must actually reach a normal playable shift');
  assert.deepEqual(model.packages.map((parcel) => parcel.route), [
    'A', 'B', 'C', 'A', 'B', 'C', 'B', 'A', 'C', 'B', 'A', 'B', 'C',
    'C', 'C', 'C', 'C', 'C', 'A', 'B', 'C', 'B', 'A', 'B',
  ], 'Brian’s five-parcel bulk incident should be the only change to the route sequence');
});
