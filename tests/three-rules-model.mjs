import assert from 'node:assert/strict';
import test from 'node:test';
import { ShiftModel, SHIFT_LAYOUT } from '../src/game/slice/ShiftModel.ts';
import { ARRIVALS_3D, ENDLESS_3D, FLOW_3D, INSPECTION_3D, PEAK_NIGHT, PRIORITY_3D, ShiftModel3D, SURPRISE_3D, TRICK_SHOTS, WRONG_DROP_PENALTY, WORKER_SPEED_3D } from '../src/three/ShiftModel3D.ts';
import { ROUTE_INFO } from '../src/three/addresses.ts';
import { DEPOT_3D_LAYOUT as L, platformLevelAt, onLowerFloor, truckInteriorAt } from '../src/three/layout.ts';
import { platformWalkPath, pathLength, walkPath } from '../src/three/walking.ts';
import { RECEIVING_CROSSING_Y, RECEIVING_FEEDERS, receivingBlocked, clearReceiving } from '../src/three/receivingCollision.ts';

test('3D allows exactly three two-second belt stops with a 15-second cooldown from each press', () => {
  const model = new ShiftModel3D({ autonomousCoworker: false });
  model.drainEvents();
  for (const left of [2, 1, 0]) {
    model.brake();
    assert.equal(model.beltStopsRemaining, left);
    assert.equal(model.beltSpeed, 0);
    assert.equal(model.brakeCooldownMs, 15000);
    const travel = model.beltTravel;
    advance(model, 1990);
    assert.equal(model.beltTravel, travel, 'parcels stay still for the stop');
    assert.equal(model.brakeRemainingMs, 10);
    advance(model, 10);
    assert.ok(model.beltSpeed > 0, 'the belt restarts after two seconds');
    advance(model, 12990);
    assert.equal(model.canStopBelt, false);
    model.brake();
    assert.equal(model.beltStopsRemaining, left, 'an early press spends no use');
    assert.equal(model.brakeCooldownMs, 10, 'an early press cannot restart the cooldown');
    advance(model, 10);
    assert.equal(model.canStopBelt, left > 0);
  }
  const travel = model.beltTravel;
  model.brake();
  advance(model, 100);
  assert.ok(model.beltTravel > travel, 'a fourth press cannot stop the belt even after the cooldown');
  const events = model.drainEvents();
  assert.equal(events.filter(event => event.type === 'brake').length, 3);
  assert.match(events.at(-1).message, /No belt stops left/);
  assert.ok(events.every(event => !/brake/i.test(event.message)));
});

test('paused, finished and story-stopped shifts spend no stop; pausing freezes the cooldown', () => {
  const model = new ShiftModel3D({ autonomousCoworker: false });
  model.paused = true; model.brake();
  assert.equal(model.beltStopsRemaining, 3);
  model.paused = false; model.eventStopped = true; model.brake();
  assert.equal(model.beltStopsRemaining, 3);
  model.eventStopped = false; model.brake();
  model.paused = true; advance(model, 15000);
  assert.equal(model.brakeRemainingMs, 2000);
  assert.equal(model.brakeCooldownMs, 15000);
  model.paused = false; model.ended = true; model.brake();
  assert.equal(model.beltStopsRemaining, 2);
  assert.equal(new ShiftModel3D().beltStopsRemaining, 3);
});

test('legacy belt stops retain the eight-second cooldown and unlimited uses', () => {
  const model = new ShiftModel();
  for (let use = 0; use < 4; use++) {
    model.brakeCooldownMs = 0;
    model.brake();
    assert.equal(model.brakeCooldownMs, 8000);
    assert.equal(model.brakeRemainingMs, 2000);
  }
  assert.equal('beltStopsRemaining' in model, false);
});

const advance = (m, ms) => { for (let t = 0; t < ms; t += 10) m.update(10); };
const hold = (m, route, at) => {
  const p = m.packages[0], w = m.activeWorker;
  Object.assign(p, { route, kind: 'smallbox', size: 'normal', state: 'held', workerId: w.id, flight: null });
  Object.assign(w, at, { heldId: p.id });
  return p;
};

test('receiving feeders and head drive block bodies while the crossing stays open', () => {
  const model = new ShiftModel3D();
  for (const { from, to } of RECEIVING_FEEDERS) {
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    assert.equal(receivingBlocked(middle, 12), true);
    assert.equal(model.walkable(middle.x < 480 ? 'left' : 'right', middle.x, middle.y), false);
  }
  assert.equal(model.walkable('left', 432, 128), false, 'head motor is solid');
  for (let x = 342; x <= 618; x += 4) assert.equal(receivingBlocked({ x, y: RECEIVING_CROSSING_Y }, 12), false, 'clear walkway around the head');
  for (let x = 340; x <= 620; x += 14) for (let y = -150; y < 165; y += 13) {
    const result = clearReceiving({ x, y }, 12);
    assert.equal(receivingBlocked(result, 12), false, `nearest rotated edge clears ${x}/${y}`);
  }
});

test('open deck beside the belt, bulk and stair approach has no invisible lane fence', () => {
  const m = new ShiftModel3D();
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    const mirror = x => side === 'left' ? x : 960 - x;
    for (const point of [{ x: 414, y: 700 }, { x: 430, y: 1040 }, { x: 432, y: 1132 }, { x: 350, y: 1080 }, { x: 428, y: 918 }]) {
      assert.equal(m.walkable(side, mirror(point.x), point.y), true, `open floor ${side}: ${JSON.stringify(point)}`);
    }
    for (const point of [{ x: 438, y: 700 }, { x: 438, y: 918 }, { x: 444, y: 1132 }]) {
      assert.equal(m.walkable(side, mirror(point.x), point.y), false, 'visible equipment still blocks the body');
    }
    m.activeIndex = side === 'left' ? 0 : 1;
    Object.assign(m.activeWorker, { x: mirror(400), y: 1040 });
    for (let i = 0; i < 12; i++) m.moveWorker(16, { x: sign, y: 0 });
    assert.ok(side === 'left' ? m.activeWorker.x > 430 : m.activeWorker.x < 530);
  }
});

test('empty hands walk where they are pointed beside the stairs and trucks; a carried box is still lined up', () => {
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    const mirror = x => side === 'left' ? x : 960 - x;
    const walk = (from, move, carrying = false) => {
      const m = new ShiftModel3D();
      m.activeIndex = side === 'left' ? 0 : 1;
      const worker = m.activeWorker;
      worker.heldId = null;
      if (carrying) {
        Object.assign(m.packages[0], { state: 'held', workerId: worker.id, kind: 'standard', route: side === 'left' ? 'T' : 'S' });
        worker.heldId = m.packages[0].id;
      }
      Object.assign(worker, { x: mirror(from.x), y: from.y });
      for (let i = 0; i < 60; i++) m.moveWorker(1000 / 60, move, worker);
      return { x: mirror(worker.x), y: worker.y };
    };
    // Down beside the stairs stays in line (it was dragged across to the stair line).
    assert.equal(walk({ x: 440, y: 1060 }, { x: 0, y: 1 }).x, 440, `${side}: walking down beside the stairs`);
    // Outward near the stairs stops at the platform edge (it was pulled down the flight).
    assert.deepEqual(walk({ x: 420, y: 1080 }, { x: -sign, y: 0 }), { x: 330, y: 1080 }, `${side}: walking outward above the stairs`);
    // Outward past a truck's door stays on its line (it was pulled into the truck).
    assert.deepEqual(walk({ x: 360, y: 1000 }, { x: -sign, y: 0 }), { x: 330, y: 1000 }, `${side}: walking outward past a truck`);
    // A carried box is still lined up with the stair flight.
    assert.ok(walk({ x: 440, y: 1060 }, { x: 0, y: 1 }, true).x < 420, `${side}: a carried box is steered toward the stairs`);
  }
});

test("two players: the partner walks on the second player's input, takes bulk and throws; nobody switches", () => {
  const m = new ShiftModel3D();
  m.coop = true;
  const p1 = m.activeWorker, p2 = m.partnerWorker;
  assert.notEqual(p1, p2);
  // Left alone, the second player's worker stands still: no coworker sorting for them.
  const start = { x: p2.x, y: p2.y };
  m.update(2000);
  assert.deepEqual({ x: p2.x, y: p2.y }, start, 'the partner waits for the second player');
  // The second player's stick walks them.
  m.partnerMove = { x: 0, y: 1 };
  for (let i = 0; i < 30; i++) m.update(1000 / 60);
  assert.ok(p2.y > start.y + 50 && p2.moving, `the second player walks the partner: ${JSON.stringify({ start, now: { x: p2.x, y: p2.y } })}`);
  m.partnerMove = { x: 0, y: 0 };
  // Nobody switches: each player keeps their worker.
  m.switchWorker();
  assert.equal(m.activeWorker, p1);
  // Either player takes bulk freight off the belt (alone, only the played worker can).
  const template = m.packages[0];
  const bulk = { ...template, id: 900, route: 'C', kind: 'standard', size: 'normal', state: 'belt', workerId: null, flight: null, x: 480, y: p2.y };
  const own = { ...template, id: 901, route: 'A', kind: 'standard', size: 'normal', state: 'held', workerId: p1.id, flight: null };
  m.packages.push(bulk, own);
  m.action(p2);
  assert.equal(p2.heldId, bulk.id, 'the partner picks up bulk');
  // And throws their own parcel, at bulk within range, leaving the first player's alone.
  p1.heldId = own.id;
  Object.assign(p2, { x: 580, y: 1080 });
  m.throwHeld(p2);
  assert.equal(bulk.state, 'thrown', "the partner's throw");
  assert.equal(own.state, 'held', "the first player's parcel stays in hand");
});

test('a long throw into bulk that lands clean pays a trick-shot bonus and is remembered', () => {
  const throwFrom = (at) => {
    const m = new ShiftModel3D({ autonomousCoworker: false, random: () => 0.99 });
    m.eventStopped = true;
    const worker = m.activeWorker;
    const parcel = { ...m.packages[0], id: 950, route: 'C', kind: 'standard', size: 'normal', state: 'held', workerId: worker.id, flight: null };
    m.packages.push(parcel);
    Object.assign(worker, at, { heldId: parcel.id });
    const target = m.throwTarget();
    const score = m.score;
    m.throwHeld();
    advance(m, 2000);
    const trick = m.drainEvents().find((event) => event.type === 'trick');
    return { target, state: parcel.state, bonus: m.score - score, trick, longest: m.longestThrowPx, tricks: m.trickShots };
  };
  // From far up the deck, bulk freight still goes to bulk (a truck drop is nearer, but trucks take no throws).
  const far = throwFrom({ x: 440, y: 900 });
  assert.equal(far.target.route, 'C', JSON.stringify(far.target));
  assert.equal(far.state, 'delivered');
  assert.match(far.trick?.message ?? '', /^TRICK SHOT · 7\.\d m · \+50$/);
  assert.ok(far.longest >= TRICK_SHOTS.trick.px && far.tricks === 1);
  const mid = throwFrom({ x: 420, y: 960 });
  assert.match(mid.trick?.message ?? '', /^LONG THROW · 5\.\d m · \+25$/);
  const short = throwFrom({ x: 410, y: 1060 });
  assert.equal(short.state, 'delivered');
  assert.equal(short.trick, undefined, 'a short throw pays no bonus');
  assert.ok(short.longest > 0 && short.tricks === 0, 'but still counts as the longest so far');
});

test('3D keeps truck rows before rear bulk, outward stairs and every drop before the terminal wall', () => {
  assert.ok(L.dockA.y < L.dockD.y && L.dockD.y < L.bulkPile.y);
  assert.ok(L.stairs.left.bottomX < L.stairs.left.topX);
  assert.ok(L.stairs.right.bottomX > L.stairs.right.topX);
  for (const point of [L.bulkPile, L.floorT, L.floorS]) assert.ok(point.y < L.bulkRearWall.y);
  for (const side of ['left', 'right']) {
    const flight = L.stairs[side];
    const heights = Array.from({ length: 9 }, (_, i) => platformLevelAt(flight.topX + (flight.bottomX - flight.topX) * i / 8, L.stairs.centerY));
    assert.equal(heights[0], 1); assert.equal(heights.at(-1), 0);
    for (let i = 1; i < heights.length; i++) assert.ok(heights[i] <= heights[i - 1]);
  }
  assert.equal(onLowerFloor({ x: 380, y: L.stairs.centerY }), false);
  assert.equal(onLowerFloor(L.floorT), true);
  const legacy = new ShiftModel();
  assert.equal(legacy.layout, SHIFT_LAYOUT);
  assert.equal(legacy.layout.bulkPile.y, 832, '3D layout preserves the approved legacy layout on main');
});

test('3D truck gaps leave space for crew events away from truck doors and keep the rear stairs reachable', () => {
  const rows = [...L.crewTruckRows, L.dockA.y, L.dockD.y];
  for (let index = 1; index < rows.length; index++) {
    const before = index - 1 < 4 ? L.truckDepth : L.playerTruckDepth;
    const after = index < 4 ? L.truckDepth : L.playerTruckDepth;
    assert.ok(rows[index] - rows[index - 1] - (before + after) / 2 >= 64, 'at least two metres of clear space between parked bodies');
  }
  for (const bay of Object.values(L.eventBays)) {
    assert.ok(rows.some((row, index) => index < rows.length - 1 && bay.y - 24 > row + L.truckDepth / 2 && bay.y + 24 < rows[index + 1] - L.truckDepth / 2));
    assert.ok(bay.x < L.platform.left || bay.x > L.platform.right, 'event areas stay out of the player loading lanes');
  }
  assert.ok(L.stairs.minY > L.dockD.y + L.playerTruckDepth / 2);
  const m = new ShiftModel3D({ autonomousCoworker: false });
  Object.assign(m.activeWorker, { x: 365, y: L.dockD.y });
  for (let step = 0; step < 150; step++) m.update(10, { x: 0, y: 1 });
  assert.ok(m.activeWorker.y > L.stairs.minY, 'the rear walkway remains open after spreading the rows');
});

test('each 3D worker selects only their own truck and floor routes, plus bulk for the controlled worker', () => {
  for (const activeIndex of [0, 1]) for (const state of ['belt', 'floor', 'missed']) {
    for (const route of ['A', 'B', 'C', 'D', 'E', 'T', 'S']) {
      const m = new ShiftModel3D({ autonomousCoworker: false });
      m.activeIndex = activeIndex; m.eventStopped = true;
      const worker = m.activeWorker;
      const parcel = m.packages[0];
      const own = route === 'C' || (activeIndex === 0 ? ['A', 'D', 'T'] : ['B', 'E', 'S']).includes(route);
      Object.assign(worker, { x: activeIndex === 0 ? 400 : 560, y: 500 });
      Object.assign(parcel, { route, state, x: worker.x, y: worker.y, workerId: null });
      assert.equal(m.nearestPackage()?.id ?? null, own ? parcel.id : null, `${worker.id} ${state} ${route}`);
      m.action();
      assert.equal(worker.heldId, own ? parcel.id : null, 'the same restriction applies to actual pickup');
    }
  }
});

test('only the currently played worker collects bulk from belt, loose floor and recovery', () => {
  for (const activeIndex of [0, 1]) for (const state of ['belt', 'floor', 'missed']) {
    const m = new ShiftModel3D();
    m.activeIndex = activeIndex; m.eventStopped = true;
    const p = m.packages[0], other = m.workers[1 - activeIndex];
    Object.assign(p, { route: 'C', state, x: state === 'floor' ? other.x : 480, y: other.y, beltOffset: other.y });
    advance(m, 1500);
    assert.equal(other.heldId, null);
    assert.equal(p.state, state);
    Object.assign(m.activeWorker, { x: activeIndex === 0 ? 400 : 560, y: other.y });
    if (state === 'floor') p.x = m.activeWorker.x;
    m.action();
    assert.equal(m.heldPackage?.id, p.id);
    m.switchWorker();
    advance(m, 1000);
    assert.equal(p.state, 'held', 'switching away does not let the coworker deliver bulk');
    m.switchWorker();
    Object.assign(m.activeWorker, activeIndex === 0 ? L.bulkLeft : L.bulkRight);
    m.action();
    assert.equal(p.state, 'delivered');
    assert.equal(m.bulkSorted, 1);
  }
});

test('3D coworker carries ordinary freight down either side flight and returns to the deck', () => {
  for (const activeIndex of [0, 1]) {
    const m = new ShiftModel3D();
    m.activeIndex = activeIndex; m.eventStopped = true;
    const other = m.workers[1 - activeIndex], p = m.packages[0];
    const playerAt = { x: m.activeWorker.x, y: m.activeWorker.y };
    Object.assign(p, { route: other.side === 'left' ? 'T' : 'S', kind: 'smallbox', size: 'normal', y: 470, beltOffset: 470 });
    for (let i = 0; i < 1600 && p.state !== 'delivered'; i++) {
      m.update(10);
      assert.ok(m.walkable(other.side, other.x, other.y));
    }
    assert.equal(p.state, 'delivered', JSON.stringify(other));
    assert.equal(onLowerFloor(other), true);
    Object.assign(p, { route: other.side === 'left' ? 'A' : 'B', state: 'belt', x: 480, y: 480, beltOffset: 480 });
    for (let i = 0; i < 1600 && p.state !== 'held'; i++) m.update(10);
    assert.equal(p.state, 'held', 'coworker climbs back via the side flight');
    assert.deepEqual({ x: m.activeWorker.x, y: m.activeWorker.y }, playerAt);
  }
});

test('the coworker enters and loads all four trucks without routing toward the stairs from inside', () => {
  for (const [route, activeIndex] of [['A', 1], ['D', 1], ['B', 0], ['E', 0]]) {
    const m = new ShiftModel3D();
    m.activeIndex = activeIndex; m.eventStopped = true;
    const worker = m.workers[1 - activeIndex], parcel = m.packages[0];
    Object.assign(parcel, { route, kind: 'smallbox', size: 'normal', state: 'held', workerId: worker.id });
    worker.heldId = parcel.id;
    for (let tick = 0; tick < 2000 && parcel.state !== 'delivered'; tick++) m.update(10);
    assert.equal(parcel.state, 'delivered', `${worker.id} completes ${route}: ${JSON.stringify(worker)}`);
    assert.equal(m.truckLoads.get(parcel.id).route, route);
    assert.equal(m.sorted, 1);
  }
});

test('the wider 3D depot completes a winning shift with route-restricted pickup and ordinary movement', () => {
  const m = new ShiftModel3D({ freightRandom: () => 0 });
  for (let tick = 0; tick < 10000 && !m.ended; tick++) {
    let target;
    const held = m.heldPackage;
    if (held) {
      target = held.route === 'C' ? m.activeIndex === 0 ? L.bulkLeft : L.bulkRight
        : L[{ A:'dockA', B:'dockB', D:'dockD', E:'dockE', T:'floorT', S:'floorS' }[held.route]];
      if (m.currentDock() === held.route) m.action();
    } else {
      const parcel = m.packages.filter(p => ['belt', 'floor', 'missed'].includes(p.state)).sort((a,b) => b.y-a.y)[0];
      if (parcel) {
        const intended = parcel.route === 'C' ? m.activeIndex : ['B', 'E', 'S'].includes(parcel.route) ? 1 : 0;
        if (m.activeIndex !== intended) m.switchWorker();
        if (m.nearestPackage()) m.action();
        target = { x: m.activeIndex === 0 ? 400 : 560, y: parcel.y };
      }
    }
    if (target) target = m.navigationTarget(target);
    const dx = target ? target.x-m.activeWorker.x : 0, dy = target ? target.y-m.activeWorker.y : 0;
    const length = Math.hypot(dx,dy);
    m.update(20, { x: length>3 ? dx/length : 0, y: length>3 ? dy/length : 0 });
  }
  assert.equal(m.ended, true);
  assert.equal(m.won, true);
  assert.ok(m.sorted >= m.goal);
  assert.equal(m.pileup, 0);
  for (const route of ['A', 'B', 'C', 'D', 'E', 'T', 'S']) assert.ok(m.routeSorted[route] > 0, `${route} is served during the complete shift`);
});

test('wrong 3D drops and intact wrong throws cost ten points per attempt, capped at the remaining score', () => {
  const m = new ShiftModel3D({ autonomousCoworker: false, random: () => 0.99 });
  m.eventStopped = true; m.score = 100;
  const p = hold(m, 'D', L.dockA);
  m.action();
  assert.equal(m.score, 100 - WRONG_DROP_PENALTY);
  assert.equal(p.state, 'held'); assert.equal(m.sorted, 0);
  Object.assign(m.activeWorker, { x: 330, y: L.stairs.centerY });
  m.throwHeld(); advance(m, 700);
  assert.equal(m.score, 80); assert.equal(p.state, 'floor');
  advance(m, 1000); assert.equal(m.score, 80, 'landing is penalized once');
  m.score = 3; hold(m, 'D', L.dockA); m.action(); assert.equal(m.score, 0);
  const legacy = new ShiftModel({ autonomousCoworker: false });
  legacy.score = 100; hold(legacy, 'D', SHIFT_LAYOUT.dockA); legacy.action();
  assert.equal(legacy.score, 100, 'legacy wrong-drop scoring is preserved');
});

test('3D grades recovered dispatches once: 56 of 57 freight with 17 belt-end incidents earns S', () => {
  const m = new ShiftModel3D({ autonomousCoworker: false });
  const template = m.packages[0];
  m.packages.splice(0, m.packages.length, ...Array.from({ length: 57 }, (_, i) => ({
    ...template, id: i + 1, state: i < 56 ? 'delivered' : 'missed', recovered: i < 16,
  })));
  Object.assign(m, { sorted: 56, missed: 17, score: 5950, bestCombo: 9, ended: true, won: true });
  assert.equal(m.errors, 1, 'only the one parcel left behind counts');
  assert.equal(m.recoveredDeliveries, 16);
  assert.equal(m.dispatchRate, 56 / 57 * 100);
  assert.equal(m.accuracy, m.dispatchRate);
  assert.equal(m.grade, 'S');
  assert.equal(m.gradeQuote, 'OUTSTANDING SHIFT');
  assert.equal(m.score, 5950, 'recovery still earns its reduced points');
});

test('3D rank boundaries use the actual percentage and unfinished freight, with no lifetime miss cutoff', () => {
  for (const [sorted, total, grade] of [[19,20,'S'],[18,19,'A'],[9,10,'A'],[8,10,'B'],[70,100,'C'],[69,100,'F']]) {
    const m = new ShiftModel3D({ autonomousCoworker: false });
    const template = m.packages[0];
    m.packages.splice(0, m.packages.length, ...Array.from({ length: total }, (_, i) => ({
      ...template, id: i + 1, state: i < sorted ? 'delivered' : ['held','floor','belt','missed'][i % 4],
    })));
    Object.assign(m, { sorted, missed: 500 });
    assert.equal(m.grade, grade, `${sorted}/${total}`);
  }
  const m = new ShiftModel3D({ autonomousCoworker: false });
  assert.equal(m.grade, 'F', 'no dispatches cannot earn a rank');
  m.packages[0].state = 'delivered'; m.sorted = 1;
  assert.equal(m.grade, 'S');
  m.ended = true; m.won = false;
  assert.equal(m.grade, 'F', 'a terminated shift stays failed');
});

test('wrong drops and excess breakages still reduce a recovered 3D shift grade', () => {
  const m = new ShiftModel3D({ autonomousCoworker: false });
  const template = m.packages[0];
  m.packages.splice(0, m.packages.length, ...Array.from({ length: 20 }, (_, i) => ({ ...template, id: i + 1, state: 'delivered', recovered: true })));
  m.sorted = 20; m.missed = 20;
  assert.equal(m.grade, 'S');
  for (let i = 0; i < 2; i++) { hold(m, 'D', L.dockA); m.action(); }
  assert.equal(m.wrongDrops, 2);
  assert.equal(m.grade, 'A');
  const before = m.errors;
  m.damaged = 2;
  m.packages.push({ ...template, id: 100, state: 'damaged' }, { ...template, id: 101, state: 'damaged' });
  assert.equal(m.errors, before + 1, 'the first break remains forgiven; later breaks count once');
});

test('stairs guide offset approaches down and up at ordinary speed while carrying on either side', () => {
  for (const side of [0, 1]) for (const offset of [-48, -20, 0, 10]) for (const kind of ['smallbox', 'longbox', 'atv']) {
    const m = new ShiftModel3D({ autonomousCoworker: false });
    m.activeIndex = side; m.eventStopped = true;
    const p = hold(m, side ? 'S' : 'T', { x: side ? 578 : 382, y: L.stairs.centerY - 10 + offset });
    p.kind = kind;
    const direction = side ? 1 : -1;
    for (let i = 0; i < 400 && !onLowerFloor(m.activeWorker); i++) {
      const previous = { ...m.activeWorker };
      m.update(10, { x: direction, y: 0 });
      assert.ok(Math.hypot(m.activeWorker.x - previous.x, m.activeWorker.y - previous.y) <= WORKER_SPEED_3D / 100 + 1e-8);
    }
    assert.ok(onLowerFloor(m.activeWorker), `${kind}: side ${side}, offset ${offset} reaches the floor`);
    for (let i = 0; i < 400 && (side ? m.activeWorker.x > 630 : m.activeWorker.x < 330); i++) m.update(10, { x: -direction, y: 0 });
    assert.ok(side ? m.activeWorker.x <= 630 : m.activeWorker.x >= 330, 'returns to the platform');
  }
});

test('walking down either platform edge guides carried freight around the rail end before the stair landing', () => {
  for (const side of [0,1]) for (const kind of ['smallbox','longbox','atv']) for (const diagonal of [false,true]) {
    const m=new ShiftModel3D({autonomousCoworker:false});m.activeIndex=side;m.eventStopped=true;
    const p=hold(m,side?'S':'T',{x:side?630:330,y:diagonal?1018:1000});p.kind=kind;
    for(let tick=0;tick<500 && m.activeWorker.y<1142;tick++)m.update(10,{x:diagonal?(side?1:-1):0,y:1});
    assert.ok(m.activeWorker.y>=1142,`${kind}, side ${side}, diagonal ${diagonal}: reach the landing from the outer edge`);
    for(let tick=0;tick<500 && !onLowerFloor(m.activeWorker);tick++)m.update(10,{x:side?1:-1,y:0});
    assert.ok(onLowerFloor(m.activeWorker),'continue down the side flight with the same parcel');
    assert.equal(m.activeWorker.heldId,p.id);
  }
});

test('truck freight requires entering the rear door and persists as individually placed cargo', () => {
  for (const [route, activeIndex] of [['A', 0], ['D', 0], ['B', 1], ['E', 1]]) {
    const m = new ShiftModel3D({ autonomousCoworker: false });
    m.activeIndex = activeIndex; m.eventStopped = true;
    const w = m.activeWorker, dock = L.dropAreas[route];
    const p = hold(m, route, { x: activeIndex === 0 ? 330 : 630, y: dock.y });
    m.action();
    assert.equal(p.state, 'held', 'standing on the platform no longer dispatches truck cargo');
    assert.equal(m.throwTarget().ok, false, 'throws cannot bypass entering the truck');
    const direction = activeIndex === 0 ? -1 : 1;
    for (let step = 0; step < 20; step++) m.update(10, { x: direction, y: 0 });
    assert.equal(truckInteriorAt(w), route);
    assert.equal(platformLevelAt(w.x, w.y), 1);
    m.action();
    assert.equal(p.state, 'delivered');
    assert.equal(m.truckLoads.get(p.id).route, route);
    const firstLoad = { ...m.truckLoads.get(p.id) };
    for (let id = 500; id < 525; id++) {
      const next = { ...p, id, kind: id % 3 ? 'smallbox' : 'longbox', state: 'held', workerId: w.id };
      m.packages.push(next); w.heldId = next.id; m.action();
    }
    assert.equal(m.truckLoads.size, 26, 'cargo is never replaced by a capped generic pile');
    assert.ok([...m.truckLoads.values()].some(load => load.overflow), 'full shelves produce visible rear overflow');
    assert.deepEqual(m.truckLoads.get(p.id), firstLoad);
    for (const load of m.truckLoads.values()) {
      assert.ok(Math.abs(load.y - dock.y) <= 28);
      assert.ok(load.x >= 228 && load.x <= 732);
      for (const other of m.truckLoads.values()) if (!load.overflow && !other.overflow && load !== other && load.layer === other.layer && load.row === other.row) {
        assert.ok(load.column >= other.column + other.cells || load.column + load.cells <= other.column);
      }
    }
    advance(m, 1000);
    assert.equal(m.truckLoads.size, 26);
    // The truck walls prevent crossing into the next truck row from inside.
    const previousY = w.y;
    advance(m, 10);
    for (let step = 0; step < 40; step++) m.update(10, { x: 0, y: 1 });
    assert.ok(w.y < previousY + 21);
  }
});

test('both side stair throws use the exact 30 percent threshold and never reveal a destination in guidance', () => {
  for (const activeIndex of [0, 1]) for (const roll of [0.299999, 0.3]) {
    const m = new ShiftModel3D({ autonomousCoworker: false, random: () => roll });
    m.activeIndex = activeIndex; m.eventStopped = true; m.score = 1000;
    const p = hold(m, activeIndex === 0 ? 'T' : 'S', { x: activeIndex === 0 ? 330 : 630, y: L.stairs.centerY });
    const target = m.throwTarget();
    assert.equal(target.breakChance, 0.3); assert.equal(target.ok, true);
    assert.doesNotMatch(target.reason, /WESTMOUNT|NORTHSIDE|ST\b/);
    m.throwHeld(); advance(m, 700);
    assert.equal(p.state, roll < 0.3 ? 'damaged' : 'delivered');
    assert.equal(m.damaged, roll < 0.3 ? 1 : 0);
  }
});

test('3D arrivals leave a little more breathing room while legacy intake retains its cadence', () => {
  const m = new ShiftModel3D({ autonomousCoworker: false });
  advance(m, 4700);
  assert.equal(m.packages.length, 1);
  advance(m, 100);
  assert.equal(m.packages.length, 2);
  advance(m, 2000);
  assert.equal(m.packages.length, 2);
  const legacy = new ShiftModel({ autonomousCoworker: false });
  advance(legacy, 4000);
  assert.equal(legacy.packages.length, 1);
  advance(legacy, 2000);
  assert.equal(legacy.packages.length, 2);
});

test('all four truck doors guide off-centre carrying approaches into the aisle at walking speed', () => {
  for (const [route, activeIndex] of [['A', 0], ['D', 0], ['B', 1], ['E', 1]]) for (const offset of [-48, -30, 30, 48]) for (const strength of [0.25, 1]) {
    const m = new ShiftModel3D({ autonomousCoworker: false });
    m.activeIndex = activeIndex; m.eventStopped = true;
    const worker = m.activeWorker, row = L.playerTrucks[route].y;
    const parcel = hold(m, route, { x: activeIndex === 0 ? 330 : 630, y: row + offset });
    const direction = activeIndex === 0 ? -1 : 1;
    for (let step = 0; step < 400 && m.currentDock() !== route; step++) {
      const before = { x: worker.x, y: worker.y };
      m.update(10, { x: direction * strength, y: strength === 1 ? Math.sign(offset) : 0 });
      assert.ok(Math.hypot(worker.x - before.x, worker.y - before.y) <= WORKER_SPEED_3D / 100 * strength + 1e-8, 'door assistance never teleports or increases keyboard or partial-stick speed');
      assert.ok(m.walkable(worker.side, worker.x, worker.y));
    }
    assert.equal(m.currentDock(), route, `${route} accepts an approach ${offset}px off centre`);
    assert.ok(Math.abs(worker.y - row) <= 3);
    m.action(); assert.equal(parcel.state, 'delivered');
    for (let step = 0; step < 130; step++) m.update(10, { x: -direction, y: Math.sign(offset) });
    assert.ok(activeIndex === 0 ? worker.x >= 330 : worker.x <= 630, 'a diagonal exit slides clear of the shelves and door frame');
  }
});

test('walks from the scrum reach both work lanes continuously without crossing the running belt', () => {
  for (const [from, to] of [[{ x:366,y:214 },{ x:382,y:500 }], [{ x:418,y:214 },{ x:578,y:500 }],
    [{ x:402,y:292 },{ x:610,y:708 }], [{ x:342,y:252 },{ x:350,y:228 }]]) {
    const path = platformWalkPath(from, to), length = pathLength(path);
    let previous = walkPath(path, 0);
    assert.deepEqual({ x:previous.x,y:previous.y }, from);
    for (let distance = 2; distance <= length + 2; distance += 2) {
      const point = walkPath(path, distance);
      assert.ok(Math.hypot(point.x - previous.x, point.y - previous.y) <= 2.000001);
      assert.ok(point.x < 448 || point.x > 512 || point.y < L.beltTop - 12, 'cross lanes around the belt head');
      assert.ok(point.x >= L.platform.left && point.x <= L.platform.right);
      previous = point;
    }
    assert.deepEqual({ x:previous.x,y:previous.y }, to);
    assert.equal(previous.done, true);
  }
});

test('shelf placement follows position and facing; eighteen ordinary shelf slots fill before rear overflow', () => {
  const m = new ShiftModel3D({ autonomousCoworker: false });
  m.eventStopped = true;
  const first = hold(m, 'A', { x: 236, y: L.dockA.y, facing: 'up' }); m.action();
  assert.deepEqual([m.truckLoads.get(first.id).column, m.truckLoads.get(first.id).row], [0, 0]);
  const next = { ...first, id: 777, state: 'held', workerId: 'termite' };
  m.packages.push(next);
  Object.assign(m.activeWorker, { x: 292, facing: 'down', heldId: next.id }); m.action();
  assert.deepEqual([m.truckLoads.get(next.id).column, m.truckLoads.get(next.id).row], [2, 1]);
  for (let id = 778; id < 795; id++) {
    m.packages.push({ ...first, id, state: 'held', workerId: 'termite' });
    m.activeWorker.heldId = id; m.action();
  }
  const loads = [...m.truckLoads.values()];
  assert.equal(loads.filter(load => !load.overflow).length, 18);
  assert.equal(loads.filter(load => load.overflow).length, 1);
  assert.equal(loads.at(-1).x, 320, 'the full load sticks through the rear opening onto the platform');
});

test('the coworker waits quietly for a clear handoff and returns wrong-side freight to the belt', () => {
  const model = new ShiftModel3D();
  model.eventStopped = true;
  const worker = model.workers[1];
  const parcel = model.packages[0];
  Object.assign(parcel, { state: 'held', workerId: 'skanky' });
  Object.assign(worker, { x: 560, y: 440, heldId: parcel.id });
  const blocker = { ...parcel, id: 99, state: 'belt', workerId: null, x: 480, y: 440, beltOffset: 440 };
  model.packages.push(blocker);
  advance(model, 500);
  assert.equal(worker.heldId, parcel.id);
  assert.equal(model.drainEvents().filter(event => event.type === 'wrong').length, 0);
  blocker.state = 'delivered';
  model.update(10);
  assert.equal(worker.heldId, null);
  assert.equal(parcel.state, 'belt');
  assert.equal(parcel.workerId, null);
  assert.equal(model.drainEvents().filter(event => event.type === 'drop').length, 1);
});

/** The same ordinary player as the winning-shift check: nearest freight on its own side, the right door, ordinary movement. */
function playShift(m) {
  let peakSpeed = 0;
  for (let tick = 0; tick < 10000 && !m.ended; tick++) {
    let target;
    const held = m.heldPackage;
    if (held) {
      target = held.route === 'C' ? m.activeIndex === 0 ? L.bulkLeft : L.bulkRight
        : L[{ A:'dockA', B:'dockB', D:'dockD', E:'dockE', T:'floorT', S:'floorS' }[held.route]];
      if (m.currentDock() === held.route) m.action();
    } else {
      const parcel = m.packages.filter(p => ['belt', 'floor', 'missed'].includes(p.state)).sort((a,b) => b.y-a.y)[0];
      if (parcel) {
        const intended = parcel.route === 'C' ? m.activeIndex : ['B', 'E', 'S'].includes(parcel.route) ? 1 : 0;
        if (m.activeIndex !== intended) m.switchWorker();
        if (m.nearestPackage()) m.action();
        target = { x: m.activeIndex === 0 ? 400 : 560, y: parcel.y };
      }
    }
    if (target) target = m.navigationTarget(target);
    const dx = target ? target.x-m.activeWorker.x : 0, dy = target ? target.y-m.activeWorker.y : 0;
    const length = Math.hypot(dx,dy);
    m.update(20, { x: length>3 ? dx/length : 0, y: length>3 ? dy/length : 0 });
    peakSpeed = Math.max(peakSpeed, m.beltSpeed);
  }
  return peakSpeed;
}

test('a peak night brings more freight on a faster belt with less room in recovery, and the same player can still finish it', () => {
  const normal = new ShiftModel3D({ freightRandom: () => 0 }), peak = new ShiftModel3D({ freightRandom: () => 0, peak: true });
  assert.equal(normal.peak, false);
  assert.equal(normal.capacity, 7, 'the normal night keeps seven in recovery');
  assert.equal(peak.capacity, PEAK_NIGHT.capacity);
  const normalSpeed = playShift(normal), peakSpeed = playShift(peak);
  assert.ok(peakSpeed > normalSpeed * 1.08, `the peak belt runs faster: ${peakSpeed.toFixed(1)} vs ${normalSpeed.toFixed(1)}`);
  assert.ok(peak.packages.length > normal.packages.length + 4, `more freight arrives: ${peak.packages.length} vs ${normal.packages.length}`);
  assert.equal(peak.ended, true);
  assert.equal(peak.won, true, `the ordinary player still finishes a peak night: sorted ${peak.sorted}/${peak.packages.length}, recovery ${peak.pileup}`);
  assert.ok(peak.sorted >= peak.goal);
});

// Priority freight: run the shift with the recovery limit lifted until the next parcel is marked.
// A seeded freight mix keeps the counts the same on every run (a random night marks two to five).
const seededFreight = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const untilPriority = (m, limitMs = 200_000) => {
  for (let t = 0; t < limitMs && !m.ended; t += 10) {
    m.update(10);
    const marked = m.drainEvents().find(event => event.type === 'priority' && event.score === undefined);
    if (marked) return m.packages.find(parcel => parcel.id === marked.packageId);
  }
  return null;
};
const carryToDrop = (m, parcel) => {
  const w = m.activeWorker, area = L.dropAreas[parcel.route];
  if (w.heldId !== null) Object.assign(m.packages.find(p => p.id === w.heldId), { state: 'belt', workerId: null });
  Object.assign(parcel, { state: 'held', workerId: w.id, flight: null });
  Object.assign(w, { x: area.x, y: area.y, heldId: parcel.id });
  m.action();
};

test('priority freight is marked through the flow and the rush, one at a time, on the player side', () => {
  const m = new ShiftModel3D({ freightRandom: seededFreight(7) });
  m.capacity = 999;
  const marked = [], late = [];
  let live = null;
  for (let t = 0; t < 230_000 && !m.ended; t += 10) {
    m.update(10);
    for (const event of m.drainEvents().filter(item => item.type === 'priority')) {
      const parcel = m.packages.find(item => item.id === event.packageId);
      if (event.score === undefined) {
        assert.equal(live, null, 'one priority parcel at a time');
        live = { id: parcel.id, at: m.elapsedMs };
        marked.push({ parcel, at: m.elapsedMs, phase: m.phase, side: m.activeWorker.side });
      } else {
        assert.equal(event.score, 0, 'nobody delivers on an idle shift, so every one runs late');
        assert.equal(live.id, parcel.id);
        assert.ok(m.elapsedMs - live.at > PRIORITY_3D.windowMs && m.elapsedMs - live.at <= PRIORITY_3D.windowMs + 10, 'late exactly when the window closes');
        late.push(parcel.id); live = null;
      }
    }
  }
  assert.ok(marked.length >= 2 && marked.length <= 8, `a handful a shift: ${marked.length}`);
  assert.equal(m.priorityCount, marked.length);
  assert.equal(m.priorityOnTime, 0);
  for (const { parcel, at, phase, side } of marked) {
    assert.ok(phase === 'flow' || phase === 'rush', `marked in the flow or the rush, not the lesson: ${phase} at ${at}`);
    assert.notEqual(parcel.route, 'C'); assert.equal(parcel.size, 'normal'); assert.notEqual(parcel.kind, 'mesa');
    assert.equal(ROUTE_INFO[parcel.route].side, side, 'only freight the player can take');
  }
  assert.ok(late.length >= marked.length - 1, 'each marked parcel either ran late or was still live at the end');
});

test('a priority parcel the player delivers in time earns its bonus; late or by the partner it earns nothing extra', () => {
  const onTime = new ShiftModel3D({ freightRandom: seededFreight(11) }); onTime.capacity = 999;
  const parcel = untilPriority(onTime);
  assert.ok(parcel, 'a priority parcel arrives');
  assert.ok(onTime.priorityRemainingMs(parcel.id) > PRIORITY_3D.windowMs - 50);
  advance(onTime, 4_000); onTime.drainEvents();
  const before = onTime.score;
  carryToDrop(onTime, parcel);
  const events = onTime.drainEvents();
  const sort = events.find(event => event.type === 'sort'), bonus = events.find(event => event.type === 'priority');
  assert.equal(parcel.state, 'delivered', 'loaded at its own drop');
  assert.equal(bonus?.score, PRIORITY_3D.bonus);
  assert.equal(onTime.score, before + sort.score + PRIORITY_3D.bonus);
  assert.equal(onTime.priorityOnTime, 1);
  assert.equal(onTime.priorityRemainingMs(parcel.id), null, 'no longer a priority parcel once loaded');

  const lateModel = new ShiftModel3D({ freightRandom: seededFreight(12) }); lateModel.capacity = 999;
  const latecomer = untilPriority(lateModel);
  advance(lateModel, PRIORITY_3D.windowMs + 20);
  assert.equal(lateModel.drainEvents().filter(event => event.type === 'priority').map(event => event.score).join(), '0', 'one late notice');
  assert.equal(lateModel.priorityRemainingMs(latecomer.id), null);
  const lateScore = lateModel.score;
  carryToDrop(lateModel, latecomer);
  const lateEvents = lateModel.drainEvents();
  assert.equal(latecomer.state, 'delivered');
  assert.equal(lateEvents.filter(event => event.type === 'priority').length, 0, 'no bonus once late');
  assert.equal(lateModel.score, lateScore + lateEvents.find(event => event.type === 'sort').score);
  assert.equal(lateModel.priorityOnTime, 0);

  const partner = new ShiftModel3D({ freightRandom: seededFreight(13) }); partner.capacity = 999;
  const handed = untilPriority(partner);
  const partnerScore = partner.score;
  partner.deliver(handed, true);
  assert.equal(partner.drainEvents().filter(event => event.type === 'priority').length, 0, 'the partner earns no bonus');
  assert.equal(partner.score, partnerScore);
  assert.equal(partner.priorityOnTime, 0);
});

test('two inspections a night watch for twenty seconds, one in the flow and one in the rush, and an idle night earns nothing from them', () => {
  const m = new ShiftModel3D({ freightRandom: seededFreight(21) }); m.capacity = 999;
  const starts = [], ends = [];
  for (let t = 0; t < 230_000 && !m.ended; t += 10) {
    m.update(10);
    for (const event of m.drainEvents().filter(item => item.type === 'inspection')) (event.score === undefined ? starts : ends).push({ at: m.elapsedMs, event, phase: m.phase });
  }
  assert.deepEqual(starts.map(({ at }) => at - at % 1000), [...INSPECTION_3D.at], 'they start on schedule');
  assert.deepEqual(starts.map(({ phase }) => phase), ['flow', 'rush']);
  assert.deepEqual(ends.map(({ at }, index) => at - starts[index].at), [INSPECTION_3D.durationMs, INSPECTION_3D.durationMs].map(ms => ms), 'each lasts twenty seconds');
  assert.deepEqual(ends.map(({ event }) => event.score), [0, 0]);
  assert.match(ends[0].event.message, /^INSPECTION OVER · 0 clean loads · [+]0$/);
  assert.equal(m.inspectionsHeld, 2);
  assert.equal(m.inspection, null);
});

test('a watched load pays the inspection bonus and a watched wrong drop costs extra, capped at the score; the partner earns nothing', () => {
  const m = new ShiftModel3D({ freightRandom: seededFreight(22) }); m.capacity = 999;
  advance(m, INSPECTION_3D.at[0] + 20); m.drainEvents();
  assert.ok(m.inspection && m.inspectionRemainingMs > 19_000, 'an inspection is under way');
  const parcel = m.packages.find(item => ['A', 'D'].includes(item.route) && item.state !== 'delivered');
  assert.ok(parcel, 'a parcel for the player side');
  const before = m.score;
  carryToDrop(m, parcel);
  const events = m.drainEvents(), sort = events.find(event => event.type === 'sort'), watched = events.find(event => event.type === 'inspection');
  assert.equal(watched?.score, INSPECTION_3D.bonus);
  assert.equal(m.score - before - sort.score - (events.find(event => event.type === 'priority')?.score ?? 0), INSPECTION_3D.bonus);
  assert.deepEqual([m.inspectionLoads, m.inspectionBonus, m.inspection.loads], [1, INSPECTION_3D.bonus, 1]);
  const other = m.packages.find(item => ['B', 'E'].includes(item.route) && item.state !== 'delivered');
  const partnerScore = m.score;
  m.deliver(other, true);
  assert.equal(m.drainEvents().filter(event => event.type === 'inspection').length, 0, 'the partner is not watched');
  assert.equal(m.score, partnerScore);
  m.score = 100;
  hold(m, 'D', L.dockA); m.action();
  const slip = m.drainEvents().filter(event => event.type === 'wrong' || event.type === 'inspection');
  assert.deepEqual(slip.map(event => event.score), [-WRONG_DROP_PENALTY, -INSPECTION_3D.penalty]);
  assert.equal(m.score, 100 - WRONG_DROP_PENALTY - INSPECTION_3D.penalty);
  m.score = 15; hold(m, 'D', L.dockA); m.action();
  assert.equal(m.score, 0, 'never below zero');
  advance(m, INSPECTION_3D.durationMs);
  const end = m.drainEvents().find(event => event.type === 'inspection' && event.packageId === undefined);
  assert.match(end.message, /^INSPECTION OVER · 1 clean load · 2 wrong · [+]50$/);
});

test('an endless shift never ends on the clock, levels up each minute from the rush, and ends only when recovery overflows', () => {
  const m = new ShiftModel3D({ endless: true, freightRandom: seededFreight(31) });
  assert.equal(m.endless, true);
  assert.equal(m.durationMs, Infinity);
  m.capacity = 999;
  const levels = [], arrivals = { early: 0, late: 0 };
  let seenIds = 0;
  for (let t = 0; t < 420_000; t += 10) {
    m.update(10);
    for (const event of m.drainEvents()) if (event.type === 'phase' && event.message.startsWith('LEVEL')) levels.push({ at: m.elapsedMs, message: event.message });
    if (m.packages.length > seenIds) {
      if (m.elapsedMs >= 140_000 && m.elapsedMs < 200_000) arrivals.early += m.packages.length - seenIds;
      if (m.elapsedMs >= 360_000 && m.elapsedMs < 420_000) arrivals.late += m.packages.length - seenIds;
      seenIds = m.packages.length;
    }
  }
  assert.equal(m.ended, false, 'seven minutes in, still sorting');
  assert.equal(m.phase, 'rush');
  assert.equal(m.endlessLevel, 6);
  assert.deepEqual(levels.map(({ at }) => at - at % 1000), [126_000, 186_000, 246_000, 306_000, 366_000]);
  assert.match(levels[0].message, /^LEVEL 2 · freight every 2[.]8 seconds/);
  assert.ok(arrivals.late > arrivals.early * 1.2, `more freight a minute later on: ${JSON.stringify(arrivals)}`);
  assert.ok(m.beltSpeed > 69.25 * 1.15 && m.beltSpeed <= 69.25 * ENDLESS_3D.fastest + 0.01, `the belt speeds up, within its cap: ${m.beltSpeed}`);
  m.capacity = 7;
  for (let t = 0; t < 300_000 && !m.ended; t += 10) m.update(10);
  assert.equal(m.ended, true, 'an untended endless shift overflows');
  assert.equal(m.won, false);
  const ordinary = new ShiftModel3D();
  assert.deepEqual([ordinary.endless, ordinary.durationMs, ordinary.endlessLevel], [false, 180_000, 1], 'an ordinary night is unchanged');
});

test('on fire: from ten clean loads in a row the controlled worker walks 8% faster, until the streak ends', () => {
  const walk = (combo) => {
    const model = new ShiftModel3D({ autonomousCoworker: false });
    model.combo = combo;
    const start = model.activeWorker.y;
    for (let i = 0; i < 50; i++) model.update(10, { x: 0, y: 1 });
    return { distance: model.activeWorker.y - start, onFire: model.onFire };
  };
  assert.deepEqual([FLOW_3D.combo, FLOW_3D.pace], [10, 1.08]);
  const cold = walk(FLOW_3D.combo - 1), hot = walk(FLOW_3D.combo);
  assert.deepEqual([cold.onFire, hot.onFire], [false, true]);
  assert.ok(hot.distance > cold.distance * 1.06 && hot.distance < cold.distance * 1.1, `8% further: ${hot.distance} vs ${cold.distance}`);
  const broken = new ShiftModel3D({ autonomousCoworker: false });
  broken.combo = 12;
  broken.combo = 0;
  assert.equal(broken.onFire, false, 'a broken streak walks at the ordinary pace again');
});

// Surprise freight: run the shift with the recovery limit lifted until the next parcel becomes a `kind`.
const untilSurprise = (m, kind, limitMs = 200_000) => {
  for (let t = 0; t < limitMs && !m.ended; t += 10) {
    m.update(10);
    const marked = m.drainEvents().find(event => event.type === 'surprise' && event.packageId !== undefined && event.score === undefined
      && m.surpriseOf(event.packageId) === kind);
    if (marked) return m.packages.find(parcel => parcel.id === marked.packageId);
  }
  return null;
};

test('twice a night a siren starts a rush wave: freight comes twice as fast for fifteen seconds, and a wave kept out of recovery pays', () => {
  const run = (collect) => {
    const m = new ShiftModel3D({ freightRandom: seededFreight(41) }); m.capacity = 999;
    const starts = [], ends = [], arrivals = [];
    let count = m.packages.length;
    for (let t = 0; t < 182_000 && !m.ended; t += 10) {
      // Synthetic collection takes every parcel off the belt before it reaches recovery.
      if (collect) for (const parcel of m.packages) if (parcel.state === 'belt' && parcel.y > 500) parcel.state = 'delivered';
      m.update(10);
      if (m.packages.length > count) { arrivals.push(m.elapsedMs); count = m.packages.length; }
      for (const event of m.drainEvents().filter(item => item.type === 'surprise' && item.packageId === undefined)) {
        (event.score === undefined ? starts : ends).push({ at: m.elapsedMs, event, phase: m.phase, remaining: m.waveRemainingMs });
      }
    }
    return { m, starts, ends, arrivals };
  };
  const clean = run(true);
  assert.deepEqual(clean.starts.map(({ at }) => at - at % 1000), [...SURPRISE_3D.waves], 'on schedule');
  assert.deepEqual(clean.starts.map(({ phase }) => phase), ['flow', 'rush']);
  assert.ok(clean.starts.every(({ remaining }) => remaining === SURPRISE_3D.waveMs));
  const gaps = (from, to) => {
    const times = clean.arrivals.filter(at => at > from && at <= to);
    return times.slice(1).map((at, index) => at - times[index]);
  };
  // Past each wave's first arrival (which keeps the gap already under way), freight comes at half its usual gap.
  for (const [index, usual] of [[0, ARRIVALS_3D.flowMs], [1, ARRIVALS_3D.rushMs]]) {
    const at = SURPRISE_3D.waves[index];
    const inside = gaps(at + usual, at + SURPRISE_3D.waveMs);
    assert.ok(inside.length >= 3 && inside.every(gap => Math.abs(gap - usual * SURPRISE_3D.waveGap) <= 20), `half gaps in wave ${index}: ${inside}`);
  }
  const [flowWave] = SURPRISE_3D.waves, usual = ARRIVALS_3D.flowMs;
  for (const gap of [...gaps(flowWave - 3 * usual, flowWave), ...gaps(flowWave + SURPRISE_3D.waveMs + 2 * usual, flowWave + SURPRISE_3D.waveMs + 6 * usual)]) {
    assert.ok(Math.abs(gap - usual) <= 20, `the usual gap before and after: ${gap}`);
  }
  assert.deepEqual(clean.ends.map(({ event }) => event.score), [SURPRISE_3D.waveBonus, SURPRISE_3D.waveBonus]);
  assert.ok(clean.ends.every(({ event }) => /^WAVE CLEARED · \d+ parcels, none in recovery · \+150$/.test(event.message)));
  assert.ok(clean.ends.every(({ at }, index) => at >= clean.starts[index].at + SURPRISE_3D.waveMs));
  assert.deepEqual([clean.m.wavesRun, clean.m.wavesCleared, clean.m.score], [2, 2, 2 * SURPRISE_3D.waveBonus], 'only the waves scored');
  assert.equal(clean.m.waveRemainingMs, 0);
  // Idle, the player's half of each wave reaches recovery: no bonus.
  const idle = run(false);
  assert.deepEqual(idle.ends.map(({ event }) => event.score), [0, 0]);
  assert.ok(idle.ends.every(({ event }) => /^WAVE OVER · [1-9]\d* reached recovery · no bonus$/.test(event.message)));
  assert.deepEqual([idle.m.wavesRun, idle.m.wavesCleared], [2, 0]);
});

test('three mystery boxes and two fragile crates a night, each the next parcel the player could take, never priority freight', () => {
  const m = new ShiftModel3D({ freightRandom: seededFreight(43) }); m.capacity = 999;
  const marked = [];
  for (let t = 0; t < 182_000 && !m.ended; t += 10) {
    m.update(10);
    for (const event of m.drainEvents().filter(item => item.type === 'surprise' && item.packageId !== undefined && item.score === undefined)) {
      const parcel = m.packages.find(item => item.id === event.packageId);
      marked.push({ parcel, kind: m.surpriseOf(parcel.id), state: parcel.state, at: m.elapsedMs, phase: m.phase,
        priority: m.priorityRemainingMs(parcel.id), side: m.activeWorker.side });
    }
  }
  for (const [kind, times] of [['mystery', SURPRISE_3D.mystery], ['fragile', SURPRISE_3D.fragile]]) {
    const ofKind = marked.filter(item => item.kind === kind);
    assert.equal(ofKind.length, times.length, `${kind}: ${ofKind.map(item => item.at)}`);
    ofKind.forEach((item, index) => assert.ok(item.at >= times[index] && item.at < (times[index + 1] ?? Infinity), `${kind} ${index} after ${times[index]}, before the next: ${item.at}`));
  }
  for (const { parcel, state, phase, priority, side } of marked) {
    assert.equal(state, 'belt', 'marked as it lands');
    assert.ok(phase === 'flow' || phase === 'rush');
    assert.notEqual(parcel.route, 'C'); assert.equal(parcel.size, 'normal'); assert.notEqual(parcel.kind, 'mesa');
    assert.equal(ROUTE_INFO[parcel.route].side, side, 'only freight the player can take');
    assert.equal(priority, null, 'never a priority parcel');
  }
});

test('a mystery box pays its prize when the player delivers it, and the partner opens nothing', () => {
  const open = (roll) => {
    const m = new ShiftModel3D({ freightRandom: seededFreight(47) }); m.capacity = 999;
    const box = untilSurprise(m, 'mystery');
    assert.ok(box && box.state === 'belt', 'a mystery box arrives');
    m.prizeRandom = () => roll;
    const before = { score: m.score, stops: m.beltStopsRemaining };
    carryToDrop(m, box);
    const events = m.drainEvents(), sort = events.find(event => event.type === 'sort'), prize = events.find(event => event.type === 'surprise');
    assert.equal(box.state, 'delivered');
    assert.equal(m.surpriseOf(box.id), null, 'no longer a mystery once open');
    assert.equal(m.mysteriesOpened, 1);
    return { m, prize, gained: m.score - before.score - sort.score, stops: m.beltStopsRemaining - before.stops };
  };
  const jackpot = open(0.1);
  assert.deepEqual([jackpot.prize.message, jackpot.prize.score, jackpot.gained, jackpot.m.lastPrize], ['MYSTERY · JACKPOT +200', 200, 200, 'jackpot']);
  const stop = open(0.4);
  assert.deepEqual([stop.prize.message, stop.gained, stop.stops], ['MYSTERY · A SPARE BELT STOP · 4 left', 0, 1]);
  const fire = open(0.6);
  assert.deepEqual([fire.prize.message, fire.gained, fire.m.onFire], ['MYSTERY · ON FIRE · streak 10', 0, true]);
  const socks = open(0.9);
  assert.deepEqual([socks.prize.message, socks.gained], ['MYSTERY · JUST SOCKS +25', 25]);
  const m = new ShiftModel3D({ freightRandom: seededFreight(47) }); m.capacity = 999;
  const box = untilSurprise(m, 'mystery');
  const score = m.score;
  m.deliver(box, true);
  assert.equal(m.drainEvents().filter(event => event.type === 'surprise').length, 0, 'the partner opens nothing');
  assert.deepEqual([m.score, m.mysteriesOpened, m.surpriseOf(box.id)], [score, 0, null]);
});

test('a fragile crate cannot be thrown, slows its carrier to a careful walk and pays its bonus carried in', () => {
  const m = new ShiftModel3D({ freightRandom: seededFreight(53) }); m.capacity = 999;
  const crate = untilSurprise(m, 'fragile');
  assert.ok(crate, 'a fragile crate arrives');
  const w = m.activeWorker;
  Object.assign(crate, { state: 'held', workerId: w.id, flight: null });
  w.heldId = crate.id;
  const target = m.throwTarget();
  assert.deepEqual([target.ok, target.reason], [false, 'FRAGILE · carry it in gently']);
  m.throwHeld();
  assert.equal(crate.state, 'held', 'still in hand');
  assert.equal(m.drainEvents().find(event => event.type === 'wrong')?.message, 'FRAGILE · carry it in gently');
  const walk = (fragile) => {
    const model = new ShiftModel3D({ autonomousCoworker: false });
    const parcel = hold(model, 'A', { x: model.activeWorker.x, y: model.activeWorker.y });
    if (fragile) model.surprises.set(parcel.id, 'fragile');
    const start = model.activeWorker.y;
    for (let i = 0; i < 50; i++) model.update(10, { x: 0, y: 1 });
    return model.activeWorker.y - start;
  };
  const ordinary = walk(false), careful = walk(true);
  assert.ok(ordinary > 0 && Math.abs(careful / ordinary - SURPRISE_3D.fragilePace) < 0.01, `a careful walk: ${careful} vs ${ordinary}`);
  const score = m.score;
  carryToDrop(m, crate);
  const events = m.drainEvents(), sort = events.find(event => event.type === 'sort'), care = events.find(event => event.type === 'surprise');
  assert.equal(crate.state, 'delivered');
  assert.deepEqual([care?.message, care?.score], ['HANDLED WITH CARE +75', SURPRISE_3D.fragileBonus]);
  assert.equal(m.score, score + sort.score + SURPRISE_3D.fragileBonus);
  assert.deepEqual([m.fragileDelivered, m.surpriseOf(crate.id)], [1, null]);
});

test('an endless shift repeats each surprise a minute after its last', () => {
  const m = new ShiftModel3D({ endless: true, freightRandom: seededFreight(59) }); m.capacity = 999;
  advance(m, SURPRISE_3D.waves.at(-1) + SURPRISE_3D.repeatMs + 1_000);
  assert.equal(m.wavesRun, SURPRISE_3D.waves.length + 1);
});
