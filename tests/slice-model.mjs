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

function walkTo(model, target) {
  for (let frame = 0; frame < 1000; frame += 1) {
    const dx = target.x - model.activeWorker.x;
    const dy = target.y - model.activeWorker.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 3) return;
    model.update(20, { x: dx / distance, y: dy / distance });
    assert.equal(model.ended, false, 'walking to a reachable destination must not lose the shift');
  }
  assert.fail(`worker could not walk to (${target.x}, ${target.y})`);
}

test('the opening A, B and C can be picked and delivered through public controls in the restored layout', () => {
  const model = new ShiftModel();
  assert.deepEqual(model.workers.map(({ x, y }) => ({ x, y })), [{ x: 382, y: 500 }, { x: 578, y: 500 }]);
  const opening = [
    { id: 1, worker: 0, dock: SHIFT_LAYOUT.dockA, destination: SHIFT_LAYOUT.dockA },
    { id: 2, worker: 1, dock: SHIFT_LAYOUT.dockB, destination: SHIFT_LAYOUT.dockB },
    { id: 3, worker: 0, dock: SHIFT_LAYOUT.bulkLeft, destination: SHIFT_LAYOUT.bulkPile },
  ];
  for (const item of opening) {
    if (model.activeIndex !== item.worker) model.switchWorker();
    walkTo(model, { x: item.worker === 0 ? 400 : 560, y: 500 });
    for (let frame = 0; model.nearestPackage()?.id !== item.id && frame < 1000; frame += 1) model.update(20);
    assert.equal(model.nearestPackage()?.id, item.id);
    model.action();
    assert.equal(model.heldPackage?.id, item.id);
    walkTo(model, item.dock);
    assert.equal(model.currentDock(), model.heldPackage.route);
    assert.equal(model.sorted, item.id - 1, 'arrival at a dock still requires explicit delivery');
    model.action();
    const parcel = model.packages.find(parcel => parcel.id === item.id);
    assert.equal(parcel.state, 'delivered');
    assert.deepEqual({ x: parcel.x, y: parcel.y }, item.destination);
  }
  assert.equal(model.sorted, 3);
  assert.equal(model.bulkSorted, 1);
  assert.equal(model.missed, 0);
});

test('both bulk hand-ins feed one central pile and the old side bays no longer accept freight', () => {
  for (const side of [0, 1]) {
    const model = new ShiftModel();
    model.packages[0].route = 'C';
    if (side === 1) model.switchWorker();
    Object.assign(model.activeWorker, { x: side === 0 ? 400 : 560, y: 200 });
    model.action();
    assert.equal(model.heldPackage?.id, 1);
    const oldBay = { ...model.activeWorker, x: side === 0 ? 260 : 700, y: 492 };
    assert.equal(model.currentDock(oldBay), null);
    Object.assign(model.activeWorker, { x: side === 0 ? 330 : 630, y: 492 });
    assert.equal(model.currentDock(), null, 'the closest reachable edge of the old side bay is not a bulk dock');
    Object.assign(model.activeWorker, side === 0 ? SHIFT_LAYOUT.dockA : SHIFT_LAYOUT.dockB);
    model.action();
    assert.equal(model.heldPackage?.id, 1, 'bulk freight must not be accepted by a truck dock');
    assert.equal(model.sorted, 0);
    Object.assign(model.activeWorker, side === 0 ? SHIFT_LAYOUT.bulkLeft : SHIFT_LAYOUT.bulkRight);
    model.action();
    assert.deepEqual({ x: model.packages[0].x, y: model.packages[0].y }, SHIFT_LAYOUT.bulkPile);
    assert.equal(model.bulkSorted, 1);
    assert.equal(model.pileup, 0);
  }
});

test('truck and bulk hit areas stay separate and reject a wrong route at the central pile', () => {
  for (const side of [0, 1]) {
    const model = new ShiftModel();
    model.packages[0].route = side === 0 ? 'A' : 'B';
    if (side === 1) model.switchWorker();
    Object.assign(model.activeWorker, { x: side === 0 ? 400 : 560, y: 200 });
    model.action();
    Object.assign(model.activeWorker, side === 0 ? SHIFT_LAYOUT.bulkLeft : SHIFT_LAYOUT.bulkRight);
    assert.equal(model.currentDock(), 'C');
    model.drainEvents();
    model.action();
    assert.equal(model.heldPackage?.id, 1);
    assert.equal(model.sorted, 0);
    assert.match(model.drainEvents()[0].message, side === 0 ? /A.*left dock/ : /B.*right dock/);
    for (const y of [553, 557, 561]) {
      model.activeWorker.y = y;
      assert.equal(model.currentDock(), null, 'the gap between truck and bulk areas must not submit freight');
    }
    Object.assign(model.activeWorker, side === 0 ? SHIFT_LAYOUT.dockA : SHIFT_LAYOUT.dockB);
    model.action();
    assert.equal(model.sorted, 1);
  }
});

test('misses enter a separate recovery pile and dropping below the belt stays on the floor', () => {
  const model = new ShiftModel();
  advance(model, 7_600);
  const parcel = model.packages[0];
  assert.equal(parcel.state, 'missed');
  assert.deepEqual({ x: parcel.x, y: parcel.y }, SHIFT_LAYOUT.recoveryPile);
  assert.notEqual(parcel.y, SHIFT_LAYOUT.bulkPile.y);
  Object.assign(model.activeWorker, { x: 400, y: 620 });
  model.action();
  assert.equal(model.heldPackage?.id, parcel.id);
  model.action();
  assert.equal(parcel.state, 'floor');
  assert.ok(parcel.y > SHIFT_LAYOUT.beltBottom);
  assert.equal(model.pileup, 0);
  assert.equal(model.bulkSorted, 0);
  model.action();
  Object.assign(model.activeWorker, SHIFT_LAYOUT.dockA);
  model.action();
  assert.equal(model.score, 50);
});

test('belt parcels stay locked to tread travel, including speed changes and brake', () => {
  const model = new ShiftModel();
  const parcel = model.packages[0];
  const offset = parcel.y - model.beltTravel;
  for (const elapsed of [0, 36_000, 126_000]) {
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
  straight.activeWorker.x = diagonal.activeWorker.x = 365;
  straight.activeWorker.y = diagonal.activeWorker.y = 400;
  const initial = { x: 365, y: 400 };
  straight.update(100, { x: -1, y: 0 });
  diagonal.update(100, { x: -1, y: 1 });
  const displacement = (worker) => Math.hypot(worker.x - initial.x, worker.y - initial.y);
  assert.ok(Math.abs(displacement(straight.activeWorker) - displacement(diagonal.activeWorker)) < 1e-9);
  const heavy = new ShiftModel();
  heavy.packages[0].size = 'heavy';
  heavy.packages[0].kind = 'mesa';
  reachFirst(heavy);
  const startY = heavy.activeWorker.y;
  heavy.update(100, { x: 0, y: 1 });
  assert.ok(Math.abs(heavy.activeWorker.y - startY - 9.4) < 1e-9);
  advance(heavy, 7_000, { x: 1, y: 1 });
  assert.equal(heavy.activeWorker.x, 400);
  assert.equal(heavy.activeWorker.y, SHIFT_LAYOUT.workerMaxY);
});

test('workers stop at main truck corners and can walk around the front from either direction', () => {
  for (const side of [0, 1]) {
    for (const vertical of [-1, 1]) {
      const model = new ShiftModel();
      if (side === 1) model.switchWorker();
      const worker = model.activeWorker;
      const outerX = side === 0 ? 340 : 620;
      Object.assign(worker, { x: outerX, y: vertical === 1 ? 440 : 620 });
      advance(model, 500, { x: 0, y: vertical });
      assert.equal(worker.x, outerX, 'touching a truck edge must not snap the worker sideways');
      assert.equal(worker.y, vertical === 1 ? 476 : 588);
      const edge = worker.y;
      advance(model, 200, { x: side === 0 ? 1 : -1, y: 0 });
      assert.equal(worker.y, edge);
      assert.ok(side === 0 ? worker.x >= 360 : worker.x <= 600);
      for (let frame = 0; frame < 35; frame += 1) {
        model.update(20, { x: 0, y: vertical });
        if (worker.y > 476 && worker.y < 588) assert.ok(side === 0 ? worker.x >= 360 : worker.x <= 600);
      }
      assert.ok(vertical === 1 ? worker.y > 588 : worker.y < 476, 'the worker must be able to pass the truck along its front');
    }
  }
});

test('main truck fronts block horizontal penetration without restricting the other rows', () => {
  for (const side of [0, 1]) {
    const model = new ShiftModel();
    if (side === 1) model.switchWorker();
    const worker = model.activeWorker;
    Object.assign(worker, { x: side === 0 ? 380 : 580, y: 532 });
    const outward = side === 0 ? -1 : 1;
    advance(model, 500, { x: outward, y: 0 });
    assert.equal(worker.x, side === 0 ? 360 : 600);
    assert.equal(worker.y, 532);
    assert.equal(worker.moving, false, 'pushing against a solid truck must not animate walking');
    advance(model, 400, { x: 0, y: -1 });
    assert.ok(worker.y < 476);
    advance(model, 300, { x: outward, y: 0 });
    assert.equal(worker.x, side === 0 ? 330 : 630, 'the wider outer lane remains usable above the truck');
  }
});

test('every original freight form restores its distinct carrying weight', () => {
  const multipliers = {
    envelope: 1, smallbox: 0.95, standard: 0.85, bigbox: 0.7, longbox: 0.7,
    mallwood: 0.7, goji: 0.9, lobsters: 0.55, duck: 0.95, makeup: 0.85,
    mesa: 0.4, panchetters: 0.85, atv: 0.4,
  };
  for (const [kind, multiplier] of Object.entries(multipliers)) {
    const model = new ShiftModel();
    model.packages[0].kind = kind;
    reachFirst(model);
    const before = model.activeWorker.y;
    model.update(100, { x: 0, y: 1 });
    assert.ok(Math.abs(model.activeWorker.y - before - 23.5 * multiplier) < 1e-9, `${kind} must retain its original carry multiplier`);
  }
});

test('a Vic/Shan machinery stop freezes freight and intake while workers and the shift clock continue', () => {
  const model = new ShiftModel();
  const parcel = model.packages[0];
  const firstY = parcel.y;
  model.eventStopped = true;
  advance(model, 6_000);
  assert.equal(model.elapsedMs, 6_000);
  assert.equal(model.beltTravel, 0);
  assert.equal(parcel.y, firstY);
  assert.equal(model.packages.length, 1);
  assert.equal(model.beltSpeed, 0);
  const firstX = model.activeWorker.x;
  model.update(100, { x: -1, y: 0 });
  assert.ok(model.activeWorker.x < firstX);
  assert.equal(model.elapsedMs, 6_100);
  model.eventStopped = false;
  model.update(100);
  assert.equal(model.beltTravel, 5);
  assert.equal(parcel.y, firstY + 5);
  assert.equal(parcel.y - model.beltTravel, parcel.beltOffset);
});

test('correct sort is explicit, releases contact, and rewards a continued streak', () => {
  const model = new ShiftModel();
  reachFirst(model);
  Object.assign(model.activeWorker, SHIFT_LAYOUT.dockA);
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
  Object.assign(model.activeWorker, SHIFT_LAYOUT.dockB);
  model.action();
  assert.equal(model.sorted, 2);
  assert.equal(model.score, 215);
  assert.equal(model.bestCombo, 2);
});

test('wrong dock keeps the parcel and gives one route-specific explanation per press', () => {
  const model = new ShiftModel();
  reachFirst(model);
  Object.assign(model.activeWorker, SHIFT_LAYOUT.bulkLeft);
  model.drainEvents();
  model.action();
  const events = model.drainEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'wrong');
  assert.match(events[0].message, /A.*left dock/);
  assert.equal(model.heldPackage.id, 1);
  assert.equal(model.sorted, 0);
  assert.equal(model.errors, 1);
  advance(model, 1_000);
  assert.equal(model.drainEvents().length, 0, 'feedback should not repeat every frame');
  assert.equal(model.errors, 1, 'remaining in a wrong dock must not create frame-by-frame errors');
});

test('original grade thresholds and punchlines remain available in the warehouse results', () => {
  const cases = [
    [10, 0, 100, 'S', 'PERFECT SHIFT'],
    [19, 1, 95, 'A', 'GOOD WORK'],
    [9, 1, 90, 'A', 'GOOD WORK'],
    [8, 2, 80, 'B', 'ACCEPTABLE'],
    [7, 3, 70, 'C', 'SHAN IS WATCHING'],
    [6, 4, 60, 'F', 'DO NOT COME BACK MONDAY'],
    [24, 10, 71, 'F', 'DO NOT COME BACK MONDAY'],
  ];
  for (const [sorted, missed, accuracy, grade, quote] of cases) {
    const model = new ShiftModel();
    model.sorted = sorted;
    model.missed = missed;
    assert.equal(model.accuracy, accuracy);
    assert.equal(model.grade, grade);
    assert.equal(model.gradeQuote, quote);
  }
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
  model.activeWorker.y = SHIFT_LAYOUT.workerMaxY;
  model.action();
  assert.equal(model.heldPackage.id, 1);
  assert.equal(model.pileup, 0);
  assert.equal(model.heldPackage.recovered, true);
  model.activeWorker.y = 500;
  model.action();
  advance(model, 1_000);
  assert.equal(model.pileup, 1);
  assert.equal(model.missed, 1);
  model.activeWorker.y = SHIFT_LAYOUT.workerMaxY;
  model.action();
  Object.assign(model.activeWorker, SHIFT_LAYOUT.dockA);
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

test('original comic freight opens the shift with its teaching routes and original forms', () => {
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
  assert.deepEqual(model.packages.map((parcel) => parcel.size), ['heavy', 'normal', 'heavy', 'normal', 'normal', 'heavy']);
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
  model.activeWorker.y = SHIFT_LAYOUT.workerMaxY;
  model.action();
  assert.equal(model.heldPackage.id, parcel.id);
  Object.assign(model.activeWorker, SHIFT_LAYOUT.dockA);
  model.action();
  assert.equal(parcel.state, 'delivered');
  assert.deepEqual({ kind: parcel.kind, label: parcel.label, route: parcel.route }, originalIdentity);
});

test('makeup arrives intact then cracks once at its seeded belt position, preserving damage when carried', () => {
  const model = new ShiftModel();
  const replay = new ShiftModel();
  for (let time = 0; time < 24_000; time += 20) {
    for (const simulation of [model, replay]) {
      for (const parcel of simulation.packages) parcel.state = 'delivered';
      simulation.update(20);
    }
  }
  const makeup = model.packages.at(-1);
  assert.equal(makeup.kind, 'makeup');
  assert.equal(makeup.broken, false);
  assert.ok(makeup.breakY >= 220 && makeup.breakY <= 520);
  assert.equal(makeup.breakY, replay.packages.at(-1).breakY);
  const untilBreakMs = (makeup.breakY - makeup.y) / 50 * 1000;
  advance(model, untilBreakMs - 20);
  assert.equal(makeup.broken, false);
  model.eventStopped = true;
  advance(model, 1_000);
  assert.equal(makeup.broken, false, 'an intact parcel does not crack while the belt is stopped');
  model.eventStopped = false;
  model.drainEvents();
  model.update(20);
  assert.equal(makeup.broken, true);
  const spills = model.drainEvents().filter((event) => event.type === 'spill');
  assert.equal(spills.length, 1);
  assert.equal(spills[0].message, 'MAKEUP LOTION');
  assert.equal(spills[0].packageId, makeup.id);
  model.activeWorker.x = 400;
  model.activeWorker.y = makeup.y;
  model.action();
  assert.equal(model.heldPackage.id, makeup.id);
  model.action();
  advance(model, 500);
  assert.equal(makeup.broken, true);
  assert.equal(model.drainEvents().some((event) => event.type === 'spill'), false);
});

test('Brian announces once and sends exactly five bulk parcels before ordinary freight resumes', () => {
  const model = new ShiftModel();
  const arrivals = [{ time: 0, parcel: model.packages[0] }];
  const announcements = [];
  let previousCount = 1;
  for (let time = 0; time < 76_000; time += 20) {
    for (const parcel of model.packages) {
      if (parcel.y > SHIFT_LAYOUT.beltBottom - 20) parcel.state = 'delivered';
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
      if (event.type === 'brian') announcements.push({ time: model.elapsedMs, message: event.message });
    }
  }
  assert.deepEqual(announcements, [{ time: 63_000, message: 'BRIAN: SENDING 5 DOWN TO BULK!' }]);
  const burst = arrivals.slice(13, 18);
  assert.deepEqual(burst.map(({ time }) => time), [64_000, 65_900, 67_800, 69_700, 71_600]);
  assert.deepEqual(burst.map(({ parcel }) => parcel.kind), ['atv', 'lobsters', 'mesa', 'panchetters', 'mallwood']);
  assert.ok(burst.every(({ parcel }) => parcel.route === 'C'));
  assert.deepEqual(burst.map(({ parcel }) => parcel.size), ['heavy', 'heavy', 'heavy', 'normal', 'heavy']);
  assert.equal(model.brianRemaining, 0);
  assert.equal(arrivals[18].time, 75_600);
  assert.equal(arrivals[18].parcel.route, 'A');
  assert.equal(arrivals[18].parcel.kind, 'bigbox');
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

test('intake closes at three minutes and unfinished freight receives ten seconds of cleanup', () => {
  const model = new ShiftModel();
  reachFirst(model);
  model.elapsedMs = 179_980;
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
  for (let tick = 0; tick < 10_000 && !model.ended; tick += 1) {
    const held = model.heldPackage;
    let target;
    if (held) {
      target = held.route === 'C' ? (model.activeWorker.side === 'left' ? SHIFT_LAYOUT.bulkLeft : SHIFT_LAYOUT.bulkRight)
        : held.route === 'A' ? SHIFT_LAYOUT.dockA : SHIFT_LAYOUT.dockB;
      if (Math.hypot(model.activeWorker.x - target.x, model.activeWorker.y - target.y) < 12) model.action();
    } else {
      const parcel = model.packages.filter((item) => item.state === 'belt' || item.state === 'missed' || item.state === 'floor').sort((a, b) => b.y - a.y)[0];
      if (parcel) {
        const intended = parcel.route === 'B' ? 1 : 0;
        if (model.activeIndex !== intended) model.switchWorker();
        target = { x: intended === 0 ? 400 : 560, y: Math.max(SHIFT_LAYOUT.workerMinY, Math.min(SHIFT_LAYOUT.workerMaxY, parcel.y)) };
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
  assert.ok(model.sorted >= 24, 'the normal-input simulation must meet the full warehouse shift target');
  assert.equal(model.sorted, model.packages.length, 'the original freight weights must still allow the full workload to be dispatched');
  assert.deepEqual([...seen].filter((phase) => phase !== 'cleanup'), ['lesson', 'flow', 'rush', 'ended']);
  assert.equal(model.missed, 0);
  assert.deepEqual([...new Set(model.packages.map((parcel) => parcel.label))].sort(), [
    'MALLWOOD RD EAST', 'GOJI BERRIES', 'LIVE LOBSTERS', 'LE DUCK', 'MAKEUP LOTION',
    'MESA BOOGIE', 'PANCHETTERS', 'SMALL ATV', 'PARCEL', 'ENVELOPE', 'SMALL BOX', 'BIG BOX', 'LONG BOX',
  ].sort(), 'all original comic parcel references must actually reach a normal playable shift');
  assert.deepEqual(model.packages.slice(0, 24).map((parcel) => parcel.route), [
    'A', 'B', 'C', 'A', 'B', 'C', 'B', 'A', 'C', 'B', 'A', 'B', 'C',
    'C', 'C', 'C', 'C', 'C', 'A', 'B', 'C', 'B', 'A', 'B',
  ], 'Brian’s five-parcel bulk incident should be the only change to the route sequence');
  assert.equal(model.packages.some((parcel) => parcel.kind === 'snakes'), false, 'Hussan’s CELL belongs to its separate NPC event');
  const events = model.drainEvents();
  assert.equal(events.filter((event) => event.type === 'brian').length, 1, 'the later rush phase must not repeat Brian’s incident');
});
