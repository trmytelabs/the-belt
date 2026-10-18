import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SHIFT_LAYOUT, ShiftModel, ROUTE_INFO, ROUTES, WORKER_ROUTES, THROWING, DELIVERY_POINTS, platformLevelAt, floorPileSlot,
} from '../src/game/slice/ShiftModel.ts';
import { StoryRun, Cutscene, BREAK_WINDOW } from '../src/game/slice/StoryModel.ts';
import {
  OPENERS, SCRUM, BREAK_SCENES, DRIVERS, SHAN_NAME, SPEAKER_NAMES, MALL_STORES, SHAN_BREAKAGE_LINES,
} from '../src/game/slice/StoryScript.ts';
import { MallModel, MALL_LAYOUT, MALL_RULES, KeyReturnModel, LOT_LAYOUT } from '../src/game/slice/MallModel.ts';

const never = () => 0.999;
const always = () => 0;

function advance(model, milliseconds, move = { x: 0, y: 0 }, frame = 20) {
  for (let time = 0; time < milliseconds; time += frame) model.update(Math.min(frame, milliseconds - time), move);
}

function walkTo(model, target, worker = model.activeWorker) {
  for (let frame = 0; frame < 2000; frame += 1) {
    const dx = target.x - worker.x;
    const dy = target.y - worker.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 3) return;
    model.update(20, { x: dx / distance, y: dy / distance });
  }
  assert.fail(`could not walk to (${target.x}, ${target.y}); stopped at (${worker.x}, ${worker.y})`);
}

/** A held parcel of the given route and kind for the right worker, without waiting for the belt. */
function holding(route, kind = 'smallbox', random = never) {
  const model = new ShiftModel({ random, autonomousCoworker: false, freightRandom: () => 0 });
  const parcel = model.packages[0];
  parcel.route = route;
  parcel.kind = kind;
  parcel.size = ['mesa', 'atv', 'lobsters', 'mallwood', 'bigbox', 'longbox'].includes(kind) ? 'heavy' : 'normal';
  const skanky = ROUTE_INFO[route].owner === 'skanky';
  if (skanky) model.switchWorker();
  Object.assign(model.activeWorker, { x: skanky ? 560 : 400, y: 200 });
  model.action();
  assert.equal(model.heldPackage?.id, 1);
  model.drainEvents();
  return model;
}

// ---------------------------------------------------------------- destinations

test('each worker owns two trucks and one lower-floor drop, alongside the shared bulk pile', () => {
  assert.deepEqual([...ROUTES].sort(), ['A', 'B', 'C', 'D', 'E', 'S', 'T']);
  for (const worker of ['termite', 'skanky']) {
    const routes = WORKER_ROUTES[worker];
    assert.equal(routes.filter((route) => ROUTE_INFO[route].kind === 'truck').length, 2);
    assert.equal(routes.filter((route) => ROUTE_INFO[route].kind === 'floor').length, 1);
    assert.ok(routes.every((route) => ROUTE_INFO[route].owner === worker));
  }
  assert.equal(ROUTE_INFO.C.kind, 'bulk');
  assert.equal(ROUTE_INFO.C.owner, 'shared', 'the bulk drop remains shared and distinct');
  assert.equal(ROUTE_INFO.A.name, 'MILL WOODS');
  assert.equal(ROUTE_INFO.B.name, 'BONNIE DOON');
  for (const route of ROUTES) {
    assert.ok(ROUTE_INFO[route].name.length > 2 && ROUTE_INFO[route].route === route, `${route} has a readable identity`);
  }
});

test('drop zones never overlap and the lower-floor drops sit below the platform', () => {
  const zones = Object.entries(SHIFT_LAYOUT.dropAreas);
  for (const [a, first] of zones) {
    for (const [b, second] of zones) {
      if (a >= b) continue;
      const sameSide = (first.x < 480) === (second.x < 480);
      if (!sameSide) continue;
      const overlapX = Math.abs(first.x - second.x) < (first.width + second.width) / 2;
      const overlapY = Math.abs(first.y - second.y) < (first.height + second.height) / 2 - 0.001;
      assert.ok(!(overlapX && overlapY), `${a} and ${b} must not overlap`);
    }
  }
  for (const route of ['T', 'S']) {
    const zone = SHIFT_LAYOUT.dropAreas[route];
    assert.ok(zone.y - zone.height / 2 >= SHIFT_LAYOUT.stairs.bottom, `${route} is on the lower floor`);
    assert.equal(platformLevelAt(zone.x, zone.y), 0);
  }
  for (const route of ['A', 'B', 'D', 'E']) {
    const zone = SHIFT_LAYOUT.dropAreas[route];
    assert.equal(platformLevelAt(zone.x, zone.y), 1, `${route} loads from the platform`);
    const truck = SHIFT_LAYOUT.playerTrucks[route];
    const rear = truck.x + (truck.x < 480 ? 74 : -74);
    assert.equal(rear, truck.x < 480 ? SHIFT_LAYOUT.platform.left : SHIFT_LAYOUT.platform.right, `${route}'s rear door is flush with the platform edge`);
  }
});

test('platform, stairs and lower floor have distinct heights', () => {
  assert.equal(platformLevelAt(400, 300), 1, 'the lanes are on the platform');
  assert.equal(platformLevelAt(480, 300), 1, 'the belt stands on the platform');
  assert.equal(platformLevelAt(244, 532), 0, 'trucks park on the lower ground');
  assert.equal(platformLevelAt(150, 300), 0, 'the outer bays are lower ground');
  const mid = (SHIFT_LAYOUT.stairs.top + SHIFT_LAYOUT.stairs.bottom) / 2;
  assert.ok(Math.abs(platformLevelAt(365, mid) - 0.5) < 0.01, 'the stairs descend evenly');
  assert.equal(platformLevelAt(480, mid), 0, 'only the two flights descend; the belt end is a wall');
  assert.equal(platformLevelAt(380, 940), 0);
});

test('every worker destination is reachable through public movement, down the stairs, and pays its base points', () => {
  for (const route of ['A', 'D', 'T', 'B', 'E', 'S']) {
    const model = holding(route);
    const target = SHIFT_LAYOUT.dropAreas[route];
    walkTo(model, { x: target.x, y: target.y });
    assert.equal(model.currentDock(), route);
    model.action();
    assert.equal(model.sorted, 1, `${route} delivered`);
    assert.equal(model.score, DELIVERY_POINTS[route]);
    assert.equal(model.routeSorted[route], 1);
  }
});

test('the bulk drop keeps its shared pile, 120 points and Ralph count alongside the new destinations', () => {
  for (const side of [0, 1]) {
    const model = new ShiftModel({ autonomousCoworker: false, freightRandom: () => 0 });
    model.packages[0].route = 'C';
    if (side === 1) model.switchWorker();
    Object.assign(model.activeWorker, { x: side === 0 ? 400 : 560, y: 200 });
    model.action();
    walkTo(model, side === 0 ? SHIFT_LAYOUT.bulkLeft : SHIFT_LAYOUT.bulkRight);
    model.action();
    assert.equal(model.bulkSorted, 1);
    assert.equal(model.score, 120);
    assert.deepEqual({ x: model.packages[0].x, y: model.packages[0].y }, SHIFT_LAYOUT.bulkPile);
  }
});

test('a worker cannot step off the platform: the only way down is the stairs, and back up the same way', () => {
  const model = new ShiftModel({ autonomousCoworker: false, freightRandom: () => 0 });
  const worker = model.activeWorker;
  walkTo(model, { x: 365, y: 940 });
  assert.equal(platformLevelAt(worker.x, worker.y), 0);
  // From the lower floor beside the belt-end wall, walking up stops at the wall.
  Object.assign(worker, { x: 455, y: 930 });
  advance(model, 1500, { x: 0, y: -1 });
  assert.equal(worker.y, SHIFT_LAYOUT.stairs.bottom, 'the retaining wall blocks a climb outside the stairs');
  assert.equal(worker.x, 455);
  // Step sideways onto the stairs, then up.
  advance(model, 1000, { x: -1, y: -0.2 });
  advance(model, 2500, { x: 0, y: -1 });
  assert.ok(worker.y < SHIFT_LAYOUT.stairs.top, 'the stairs lead back up');
  assert.ok(worker.x >= SHIFT_LAYOUT.leftLane.minX && worker.x <= SHIFT_LAYOUT.leftLane.maxX);
});

test('walking speed is the same on the platform, the stairs and the lower floor', () => {
  for (const y of [400, 830, 930]) {
    const model = new ShiftModel({ autonomousCoworker: false, freightRandom: () => 0 });
    Object.assign(model.activeWorker, { x: 365, y });
    model.update(100, { x: 0, y: 1 });
    assert.ok(Math.abs(model.activeWorker.y - y - 23.5) < 1e-9, `normal speed at y=${y}`);
  }
});

test('lower-floor deliveries pile up in fixed slots that leave the painted range clear', () => {
  const zone = SHIFT_LAYOUT.dropAreas.T;
  const slots = Array.from({ length: 14 }, (_, index) => floorPileSlot('T', index));
  assert.equal(new Set(slots.slice(0, 12).map(({ x, y }) => `${x},${y}`)).size, 12);
  assert.equal(slots[12].layer, 1);
  for (const slot of slots) {
    assert.ok(Math.abs(slot.x - zone.x) <= zone.width / 2 && slot.y - (zone.y - zone.height / 2) >= 0);
    assert.ok(slot.y <= zone.y + 12, 'the far band of the zone stays clear for the letter');
  }
  const model = holding('T');
  walkTo(model, { x: zone.x, y: zone.y });
  model.action();
  assert.equal(model.packages[0].pileIndex, 0);
  assert.deepEqual({ x: model.packages[0].x, y: model.packages[0].y }, { x: slots[0].x, y: slots[0].y });
});

test('authored reference destinations remain interleaved with everyday freight', () => {
  const model = new ShiftModel({ autonomousCoworker: false, freightRandom: () => 0 });
  for (let time = 0; time < 60_000; time += 20) {
    for (const parcel of model.packages) parcel.state = 'delivered';
    model.update(20);
  }
  assert.deepEqual(model.packages.filter((_,i)=>i%3===0).map((parcel) => parcel.route).slice(0, 11), ['A', 'B', 'C', 'A', 'B', 'C', 'D', 'E', 'C', 'T', 'S']);
  assert.ok(model.packages.filter((parcel) => parcel.route === 'T' || parcel.route === 'S').every((parcel) => parcel.size === 'normal'),
    'heavy freight never has to be carried down the stairs');
});

// ---------------------------------------------------------------- throwing

test('throw targets explain carry-only cases and select a reachable physical drop', () => {
  const heavy = holding('A', 'mallwood');
  assert.match(heavy.throwTarget().reason, /TOO HEAVY/);
  const far = holding('T');
  assert.equal(far.throwTarget().ok, false);
  assert.match(far.throwTarget().reason, /TOO FAR/);
  const inDock = holding('A');
  Object.assign(inDock.activeWorker, SHIFT_LAYOUT.dockA);
  assert.match(inDock.throwTarget().reason, /SPACE/);
  const near = holding('A');
  Object.assign(near.activeWorker, { x: 380, y: 360 });
  const target = near.throwTarget();
  assert.equal(target.ok, true);
  assert.equal(target.route, 'A');
  assert.equal(target.breakChance, THROWING.breakChance.ordinary);
  const fragile = holding('B', 'makeup');
  Object.assign(fragile.activeWorker, { x: 580, y: 400 });
  assert.equal(fragile.throwTarget().breakChance, THROWING.breakChance.fragile);
  // The foot of the stairs is already the lower floor: no throwing back up from it,
  // even where walking against the retaining wall leaves the worker exactly there.
  for (const y of [SHIFT_LAYOUT.lowerFloor.top, SHIFT_LAYOUT.lowerFloor.top + 30]) {
    const below = holding('A');
    Object.assign(below.activeWorker, { x: 380, y });
    assert.equal(below.throwTarget().route, 'T', 'throws from the lower floor target its local floor drop');
  }
  const lastStep = holding('A');
  Object.assign(lastStep.activeWorker, { x: 380, y: SHIFT_LAYOUT.lowerFloor.top - 1 });
  assert.doesNotMatch(lastStep.throwTarget().reason, /CAN'T THROW UP/, 'still on the stairs one pixel above the floor');
});

test('a clean throw delivers with normal credit and keeps the streak, while the belt keeps moving', () => {
  const model = holding('A', 'smallbox', never);
  Object.assign(model.activeWorker, { x: 380, y: 360 });
  const travel = model.beltTravel;
  model.throwHeld();
  const parcel = model.packages[0];
  assert.equal(parcel.state, 'thrown');
  assert.equal(model.activeWorker.heldId, null, 'hands are free as soon as it is thrown');
  assert.equal(model.nearestPackage()?.id === 1, false, 'an airborne parcel cannot be grabbed');
  advance(model, THROWING.flightMs + 20);
  assert.equal(parcel.state, 'delivered');
  assert.equal(parcel.thrownDelivery, true);
  assert.equal(model.sorted, 1);
  assert.equal(model.score, 100);
  assert.equal(model.thrownDeliveries, 1);
  assert.ok(model.beltTravel > travel);
});

test('a broken throw earns no credit and exactly one penalty, however often it is touched afterwards', () => {
  const model = holding('B', 'makeup', always);
  model.score = 500;
  Object.assign(model.activeWorker, { x: 580, y: 400 });
  model.throwHeld();
  advance(model, THROWING.flightMs + 20);
  const parcel = model.packages[0];
  assert.equal(parcel.state, 'damaged');
  assert.equal(model.sorted, 0);
  assert.equal(model.damaged, 1);
  assert.equal(model.score, 500 - THROWING.breakPenalty);
  assert.equal(model.combo, 0);
  const damageEvents = model.drainEvents().filter((event) => event.type === 'damage');
  assert.equal(damageEvents.length, 1);
  assert.equal(damageEvents[0].packageId, 1);
  // Time passing, walking over it, pressing SPACE beside it and throwing again do nothing.
  Object.assign(model.activeWorker, { x: SHIFT_LAYOUT.dropAreas.B.x, y: SHIFT_LAYOUT.dropAreas.B.y });
  for (let i = 0; i < 5; i += 1) { model.action(); model.throwHeld(); advance(model, 400, { x: 0.2, y: 0 }); }
  assert.notEqual(model.heldPackage?.id, 1);
  assert.equal(parcel.state, 'damaged');
  assert.equal(model.score, 500 - THROWING.breakPenalty);
  assert.equal(model.damaged, 1);
  assert.equal(model.sorted, 0);
  assert.equal(model.drainEvents().filter((event) => event.type === 'damage').length, 0);
});

test('the penalty never takes the score below zero and the shift end ignores broken freight', () => {
  const model = holding('A', 'duck', always);
  Object.assign(model.activeWorker, { x: 380, y: 360 });
  model.throwHeld();
  advance(model, THROWING.flightMs + 20);
  assert.equal(model.score, 0);
  assert.equal(model.breakagePenalty, 0);
  model.elapsedMs = model.durationMs;
  model.update(20);
  assert.equal(model.ended, true, 'a broken parcel is not unfinished freight');
});

test('one accident keeps the grade; repeated breakages count against it', () => {
  const model = new ShiftModel({ autonomousCoworker: false, freightRandom: () => 0 });
  model.sorted = 24;
  assert.equal(model.grade, 'S');
  model.damaged = 1;
  assert.equal(model.grade, 'S', 'one accident should not ruin the run');
  model.damaged = 3;
  assert.equal(model.errors, 2);
  assert.equal(model.grade, 'A');
  model.damaged = 6;
  assert.equal(model.grade, 'B');
  model.damaged = 9;
  assert.equal(model.grade, 'C');
});

test('a pause or story freeze holds a parcel in mid-air without resolving it', () => {
  const model = holding('A', 'smallbox', always);
  Object.assign(model.activeWorker, { x: 380, y: 360 });
  model.throwHeld();
  advance(model, 200);
  const position = { x: model.packages[0].x, y: model.packages[0].y };
  model.paused = true;
  advance(model, 5000);
  assert.equal(model.packages[0].state, 'thrown');
  assert.deepEqual({ x: model.packages[0].x, y: model.packages[0].y }, position);
  model.paused = false;
  advance(model, THROWING.flightMs);
  assert.equal(model.packages[0].state, 'damaged');
  assert.equal(model.damaged, 1);
});

test('throwing down to the lower floor saves the stairs; light bulk freight can be thrown onto the pile', () => {
  const floor = holding('T', 'smallbox', never);
  Object.assign(floor.activeWorker, { x: 380, y: 784 });
  assert.equal(floor.throwTarget().ok, true);
  floor.throwHeld();
  assert.equal(floor.packages[0].flight.downward, true);
  advance(floor, THROWING.flightMs + 20);
  assert.equal(floor.routeSorted.T, 1);
  assert.equal(floor.packages[0].pileIndex, 0);

  const bulk = holding('C', 'panchetters', never);
  Object.assign(bulk.activeWorker, { x: 400, y: 680 });
  bulk.throwHeld();
  advance(bulk, THROWING.flightMs + 20);
  assert.equal(bulk.bulkSorted, 1, 'a thrown bulk parcel still counts toward Ralph');
  const heavyBulk = holding('C', 'atv', never);
  Object.assign(heavyBulk.activeWorker, { x: 400, y: 450 });
  heavyBulk.throwHeld();
  assert.equal(heavyBulk.heldPackage?.id, 1, 'heavy bulk freight must be carried');
});

test('a worker on the lower floor targets the floor drop, never an upstairs truck', () => {
  const model = holding('A');
  Object.assign(model.activeWorker, { x: 380, y: 900 });
  assert.equal(model.throwTarget().route, 'T');
});

// ---------------------------------------------------------------- story

test('three openers cover both approved situations at overnight times and name Shan correctly', () => {
  assert.equal(OPENERS.length, 3);
  assert.deepEqual(new Set(OPENERS.map((opener) => opener.situation)), new Set(['shan-late', 'pair-late']));
  for (const opener of OPENERS) {
    assert.match(opener.clock, /^[123]:\d\d AM/);
    assert.ok(opener.beats.length >= 5);
    assert.equal(opener.beats.at(-1).cue, 'walk-in', 'every opener ends with everyone going inside');
  }
  assert.equal(new Set(OPENERS.map((opener) => opener.clock)).size, 3, 'each variant has a different time');
  assert.equal(SHAN_NAME, "SHAN O'MAC");
  assert.equal(SPEAKER_NAMES.shan, "SHAN O'MAC");
  const all = JSON.stringify([OPENERS, SCRUM, BREAK_SCENES, SHAN_BREAKAGE_LINES]);
  assert.ok(!/shannon/i.test(all), 'the boss is never called Shannon');
});

test('the scrum keeps the approved lines, in order, before the countdown', () => {
  const lines = SCRUM.beats.filter((beat) => beat.line).map((beat) => [beat.speaker, beat.line]);
  assert.deepEqual(lines, [
    ['shan', "We've had a complaint about broken makeup bottles. Stop throwing the packages."],
    ['shan', "Thanks to everyone who donated. We've got two United Way days to give out. Termite. Skanky."],
    ['doris', "You've got to be fucking kidding me."],
    ['hussan', 'They just started!'],
    ['shan', "Right. Let's get going."],
  ]);
  assert.ok(SCRUM.beats.some((beat) => beat.cue === 'everyone-turns'), 'the announcement gets its beat');
  assert.ok(SCRUM.beats.some((beat) => beat.cue === 'pair-look'));
});

test('both break locations keep all three approved exchanges verbatim', () => {
  const lines = (scene) => scene.beats.filter((beat) => beat.line).map((beat) => beat.line);
  assert.deepEqual(BREAK_SCENES['7eleven'].map(lines), [
    ['You buying lunch or feeding a horse?', 'Apples.', "I can see that. I'm asking why.", 'You coming?'],
    ["You're making us look bad.", 'You did that yourselves.', 'There. Balanced it out.'],
    ['Separate receipts?', "Yeah. Don't put his apples on mine.", 'Why?', "I've got a reputation."],
  ]);
  assert.deepEqual(BREAK_SCENES.timhortons.map(lines), [
    ['Whose is the double-double?', 'Right. Helpful.'],
    ["There's eleven.", 'Someone ate one.', "We haven't left the parking lot.", 'And?'],
    ["Careful. Lid's loose.", "You could've said that before handing it over.", 'I did. You were already taking it.'],
  ]);
  assert.ok(BREAK_SCENES.timhortons[0].beats.some((beat) => /bitten donut/.test(beat.direction ?? '')));
  assert.ok(BREAK_SCENES.timhortons[0].beats.some((beat) => /Three hands rise/.test(beat.direction ?? '')));
  assert.ok(BREAK_SCENES['7eleven'][1].beats.some((beat) => /another chocolate bar/.test(beat.direction ?? '')));
});

test('the drivers scene keeps both approved lines, near the end, after the United Way reaction', () => {
  assert.equal(DRIVERS.coughLine.line, "Could've waited five minutes.");
  assert.equal(DRIVERS.shanLine.line, "Belt's still moving.");
  assert.ok(DRIVERS.arriveAt > 152_400 && DRIVERS.arriveAt < 170_000);
  assert.ok(DRIVERS.firstEngineAt < DRIVERS.coughLine.at && DRIVERS.coughLine.at < DRIVERS.otherEnginesAt);
  assert.ok(DRIVERS.otherEnginesAt < DRIVERS.shanLine.at && DRIVERS.shanLine.at < 180_000);
  assert.equal(DRIVERS.originalCoughAt.length, 4, 'the four original cough lines are kept');
});

test('a run picks valid random variants, can be forced, and offers the break exactly once', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const run = new StoryRun(Math.random);
    const { opener, breakPlace, breakVariant, breakAtMs } = run.choices;
    assert.ok(opener >= 0 && opener < 3);
    assert.ok(breakVariant >= 0 && breakVariant < 3);
    assert.ok(breakAtMs >= BREAK_WINDOW.earliestMs && breakAtMs <= BREAK_WINDOW.latestMs);
    seen.add(`${breakPlace}-${breakVariant}`);
    seen.add(`opener-${opener}`);
  }
  for (const key of ['opener-0', 'opener-1', 'opener-2', '7eleven-0', '7eleven-1', '7eleven-2', 'timhortons-0', 'timhortons-1', 'timhortons-2']) {
    assert.ok(seen.has(key), `${key} is reachable`);
  }
  const edge = new StoryRun(() => 0.99999);
  assert.equal(edge.choices.opener, 2);
  const forced = new StoryRun(Math.random, { opener: 1, breakPlace: 'timhortons', breakVariant: 2, breakAtMs: 50_000 });
  assert.equal(forced.opener.id, 'opener-2');
  assert.equal(forced.breakScene.id, 'timhortons-3');
  assert.equal(forced.breakDue(49_999), false);
  assert.equal(forced.breakDue(50_000), true);
  forced.takeBreak(50_000);
  assert.equal(forced.breakDue(60_000), false, 'the break never repeats after resuming');
  assert.equal(forced.breakDue(50_000), false);
});

test('a cutscene auto-advances, reports each beat once, and skipping lands on its final beat', () => {
  const cutscene = new Cutscene(OPENERS[0]);
  assert.equal(cutscene.takeEntered(), OPENERS[0].beats[0]);
  assert.equal(cutscene.takeEntered(), null);
  for (let t = 0; t < OPENERS[0].beats[0].ms; t += 100) cutscene.update(100);
  assert.equal(cutscene.index, 1);
  cutscene.next();
  assert.equal(cutscene.index, 2);
  cutscene.skip();
  assert.equal(cutscene.done, true);
  assert.equal(cutscene.skipped, true);
  assert.equal(cutscene.index, OPENERS[0].beats.length - 1);
  assert.equal(cutscene.takeEntered(), null, 'a skipped scene does not replay its remaining sounds');
  cutscene.next();
  cutscene.update(100_000);
  assert.equal(cutscene.index, OPENERS[0].beats.length - 1);
  // A player's NEXT never skips a beat that has not been shown yet.
  const guarded = new Cutscene(SCRUM);
  guarded.userNext();
  assert.equal(guarded.index, 0, 'NEXT waits until the first beat is on screen');
  guarded.takeEntered();
  guarded.userNext();
  guarded.userNext();
  assert.equal(guarded.index, 1, 'a double press moves one shown beat at a time');
  for (const scene of [...OPENERS, SCRUM]) {
    const run = new Cutscene(scene);
    let guard = 0;
    while (!run.done && guard < 10_000) { run.update(50); guard += 1; }
    assert.equal(run.done, true, `${scene.id} finishes on its own`);
  }
});

// ---------------------------------------------------------------- mall

function mallWalk(mall, target, { tolerance = 4, frames = 3000 } = {}) {
  const step = (d) => Math.max(-1, Math.min(1, d / 4.7));
  for (let frame = 0; frame < frames; frame += 1) {
    const dx = target.x - mall.skanky.x;
    const dy = target.y - mall.skanky.y;
    if (Math.abs(dx) <= tolerance && Math.abs(dy) <= tolerance) return true;
    const before = { x: mall.skanky.x, y: mall.skanky.y };
    // Axis-first steering slides around the planters and the fountain.
    mall.update(20, Math.abs(dx) > tolerance ? { x: step(dx), y: 0 } : { x: 0, y: step(dy) });
    if (before.x === mall.skanky.x && before.y === mall.skanky.y) {
      mall.update(20, { x: 0, y: Math.sign(dy) || 1 });
      if (before.x === mall.skanky.x && before.y === mall.skanky.y) mall.update(20, { x: Math.sign(dx) || 1, y: 0 });
    }
  }
  return false;
}

/** Route along the concourse's clear north or south row, so the pushed cart never jams. */
function mallRoute(mall, target) {
  const s = mall.skanky;
  const rowFor = (y) => (y < 400 ? 322 : 478);
  if (s.x < 300) {
    assert.ok(mallWalk(mall, { x: s.x, y: 400 }), 'line up with the service passage');
    assert.ok(mallWalk(mall, { x: 330, y: 400 }), 'through the service passage');
  }
  if (target.x < 300) {
    assert.ok(mallWalk(mall, { x: s.x, y: rowFor(s.y) }));
    assert.ok(mallWalk(mall, { x: 330, y: rowFor(s.y) }));
    assert.ok(mallWalk(mall, { x: 330, y: 400 }));
    assert.ok(mallWalk(mall, target), 'back into the dock');
    return;
  }
  assert.ok(mallWalk(mall, { x: s.x, y: rowFor(target.y) }));
  assert.ok(mallWalk(mall, { x: target.x, y: rowFor(target.y) }), 'along the row');
  assert.ok(mallWalk(mall, target), 'reach the store doorway');
}

function doorStand(store) {
  return { x: store.door.x, y: store.side === 'north' ? 322 : 478 };
}

test('the mall needs three cart runs, two stores each, six drops and six signatures, then the cart back at the truck', () => {
  const mall = new MallModel(() => 0.42);
  assert.equal(mall.stores.length, 6);
  assert.deepEqual(mall.stores.map((store) => store.name), MALL_STORES.map((store) => store.name));
  for (let run = 0; run < 3; run += 1) assert.equal(mall.stores.filter((store) => store.run === run).length, 2);
  for (let run = 0; run < 3; run += 1) {
    // Back at the truck: park the cart clear of the tailgate. The next run is only issued here.
    if (mall.cart.pushed) {
      assert.ok(mallWalk(mall, { x: 190, y: 400 }));
      mall.toggleCart();
    }
    assert.ok(mallWalk(mall, { x: mall.skanky.x, y: 470 }));
    assert.ok(mallWalk(mall, { x: 70, y: 470 }));
    for (const store of mall.stores.filter((item) => item.run === run)) {
      const slot = mall.truckBundles.indexOf(store.id);
      assert.ok(mallWalk(mall, { x: 70, y: mall.slotPosition(slot).y }));
      mall.action();
      assert.equal(mall.carrying, store.id, `picked ${store.name}`);
      // Around the parked cart, then up to its side.
      assert.ok(mallWalk(mall, { x: 70, y: 470 }));
      assert.ok(mallWalk(mall, { x: mall.cart.x + 40, y: 470 }));
      assert.ok(mallWalk(mall, { x: mall.cart.x + 40, y: mall.cart.y }, { tolerance: 6 }));
      mall.action();
      assert.ok(mall.cart.load.includes(store.id));
      assert.ok(mallWalk(mall, { x: mall.cart.x + 40, y: 470 }));
      assert.ok(mallWalk(mall, { x: 70, y: 470 }));
    }
    assert.equal(mall.cart.load.length, 2, 'two stores per trip');
    // Take the cart's handle and push it to each store.
    assert.ok(mallWalk(mall, { x: mall.cart.x + 30, y: mall.cart.y }, { tolerance: 6 }));
    mall.toggleCart();
    assert.equal(mall.cart.pushed, true);
    for (const store of mall.stores.filter((item) => item.run === run)) {
      mallRoute(mall, doorStand(store));
      mall.action();
      assert.equal(store.state, 'dropped', `${store.name} received its freight`);
      assert.equal(mall.cart.load.includes(store.id), false, 'the delivered boxes leave the cart');
      mall.action();
      assert.equal(store.state, 'signed');
    }
    mallRoute(mall, { x: 230, y: 400 });
  }
  assert.equal(mall.delivered, 6);
  assert.equal(mall.signatures, 6);
  assert.equal(mall.allSigned, true);
  assert.equal(mall.finished, false, 'the last signature is not the end');
  assert.ok(mallWalk(mall, { x: 150, y: 400 }));
  assert.ok(mall.cartNearTruck);
  mall.toggleCart();
  assert.ok(mallWalk(mall, { x: 150, y: 465 }));
  assert.ok(mallWalk(mall, { x: 80, y: 465 }));
  mall.action();
  assert.equal(mall.finished, true);
});

test('mall interactions cannot create extra credit or skip a reload', () => {
  const mall = new MallModel(() => 0.1);
  const first = mall.stores.filter((store) => store.run === 0);
  const later = mall.stores.find((store) => store.run === 1);
  // A store visited empty-handed gives no credit.
  mall.skanky.x = doorStand(first[0]).x;
  mall.skanky.y = doorStand(first[0]).y;
  mall.action();
  assert.equal(first[0].state, 'waiting');
  assert.equal(mall.delivered, 0);
  // A later run's bundle cannot be taken on this trip.
  mall.skanky.x = 70; mall.skanky.y = mall.slotPosition(mall.truckBundles.indexOf(later.id)).y;
  mall.action();
  assert.equal(mall.carrying, null);
  assert.match(mall.drainEvents().at(-1).message, /run 2/);
  // Load both, then try a third: the cart holds two stores.
  for (const store of first) {
    mall.skanky.x = 70; mall.skanky.y = mall.slotPosition(mall.truckBundles.indexOf(store.id)).y;
    mall.action();
    Object.assign(mall.skanky, { x: mall.cart.x + 40, y: mall.cart.y });
    mall.action();
  }
  assert.equal(mall.cart.load.length, 2);
  // Deliver once, sign once; further presses do nothing.
  Object.assign(mall.cart, { x: doorStand(first[0]).x, y: doorStand(first[0]).y - 30 });
  Object.assign(mall.skanky, doorStand(first[0]));
  for (let i = 0; i < 6; i += 1) mall.action();
  assert.equal(mall.delivered, 1);
  assert.equal(mall.signatures, 1);
  assert.equal(first[0].state, 'signed');
  // The other store's freight is still on the cart; leaving the cart behind blocks delivery.
  Object.assign(mall.skanky, doorStand(first[1]));
  mall.action();
  assert.equal(first[1].state, 'waiting', 'the freight is on the cart, which was left behind');
  assert.equal(mall.delivered, 1);
});

test('only free floor is walkable in the mall and the cart cannot pass through obstacles', () => {
  const mall = new MallModel(() => 0.5);
  assert.equal(mall.free(580, 400, MALL_RULES.skankyRadius), false, 'the planter is solid');
  assert.equal(mall.free(700, 150, MALL_RULES.skankyRadius), false, 'store interiors are behind the counters');
  assert.equal(mall.free(700, 300, MALL_RULES.skankyRadius), true);
  assert.equal(mall.free(270, 400, MALL_RULES.skankyRadius), true, 'the service passage joins the dock to the concourse');
  for (const store of mall.stores) assert.ok(mall.free(doorStand(store).x, doorStand(store).y, MALL_RULES.skankyRadius), `${store.name} is reachable`);
  // Push the cart straight at the planter: it stops short.
  Object.assign(mall.skanky, { x: 480, y: 400 });
  Object.assign(mall.cart, { x: 510, y: 400, facing: 'right', pushed: true });
  for (let i = 0; i < 200; i += 1) mall.update(20, { x: 1, y: 0 });
  assert.ok(mall.cart.x + MALL_RULES.cartSize.w / 2 <= MALL_LAYOUT.obstacles[0].x + 0.5, 'the cart stops at the planter');
});

test('returning the five-ton requires walking its keys to the key drop', () => {
  const lot = new KeyReturnModel();
  lot.action();
  assert.equal(lot.done, false);
  for (let i = 0; i < 400 && !lot.atKeyDrop; i += 1) {
    const dx = LOT_LAYOUT.keyDrop.x + 50 - lot.skanky.x;
    const dy = LOT_LAYOUT.keyDrop.y + 40 - lot.skanky.y;
    lot.update(20, { x: Math.abs(dx) > 3 ? Math.sign(dx) : 0, y: Math.abs(dy) > 3 ? Math.sign(dy) : 0 });
  }
  assert.equal(lot.atKeyDrop, true);
  lot.action();
  assert.equal(lot.done, true);
  assert.equal(lot.drainEvents().filter((event) => event.type === 'done').length, 1);
  lot.action();
  assert.equal(lot.drainEvents().length, 0, 'the keys are only returned once');
});
