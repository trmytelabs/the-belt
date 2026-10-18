import assert from 'node:assert/strict';
import test from 'node:test';
import { ShiftModel, SHIFT_LAYOUT } from '../src/game/slice/ShiftModel.ts';
import { ShiftModel3D, WRONG_DROP_PENALTY } from '../src/three/ShiftModel3D.ts';
import { DEPOT_3D_LAYOUT as L, platformLevelAt, onLowerFloor, truckInteriorAt } from '../src/three/layout.ts';
import { platformWalkPath, pathLength, walkPath } from '../src/three/walking.ts';

const advance = (m, ms) => { for (let t = 0; t < ms; t += 10) m.update(10); };
const hold = (m, route, at) => {
  const p = m.packages[0], w = m.activeWorker;
  Object.assign(p, { route, kind: 'smallbox', size: 'normal', state: 'held', workerId: w.id, flight: null });
  Object.assign(w, at, { heldId: p.id });
  return p;
};

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
  assert.equal(legacy.layout.bulkPile.y, 610, '3D layout restoration does not move the legacy depot');
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
      assert.ok(Math.hypot(m.activeWorker.x - previous.x, m.activeWorker.y - previous.y) <= 2.350001);
    }
    assert.ok(onLowerFloor(m.activeWorker), `${kind}: side ${side}, offset ${offset} reaches the floor`);
    for (let i = 0; i < 400 && (side ? m.activeWorker.x > 630 : m.activeWorker.x < 330); i++) m.update(10, { x: -direction, y: 0 });
    assert.ok(side ? m.activeWorker.x <= 630 : m.activeWorker.x >= 330, 'returns to the platform');
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
  assert.equal(legacy.packages.length, 3);
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
      assert.ok(Math.hypot(worker.x - before.x, worker.y - before.y) <= 2.35 * strength + 1e-8, 'door assistance never teleports or increases keyboard or partial-stick speed');
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
