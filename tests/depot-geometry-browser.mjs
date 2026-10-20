import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { DEPOT_3D_LAYOUT as SHIFT_LAYOUT, platformLevelAt } from '../src/three/layout.ts';
import { OPENERS, BREAK_SCENES, SCRUM, MALL_ASSIGNMENT, DRIVE_TO_MALL, DRIVE_TO_UPS, GO_HOME } from '../src/game/slice/StoryScript.ts';
import { receivingBlocked } from '../src/three/receivingCollision.ts';

// Controlled geometry fixtures complement real-input gameplay in the other suites.
const server = process.env.BELT_TEST_BASE_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
    args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => window.addEventListener('belt3d:ready', event => { window.fixtureApp = event.detail; event.detail.playPrologue = false; }));
  await page.goto(process.env.BELT_TEST_BASE_URL ?? server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 90_000 });
  const snapshot = await page.evaluate(() => window.fixtureApp.world.geometrySnapshot());
  assert.ok(Math.abs(snapshot.platform.max.y - 1.1) < 1e-5, 'deck stands 1.1m above lower floor');
  assert.ok(Math.abs(snapshot.belt.max.y - 1.88) < 1e-5, 'belt contact is 0.78m above deck');
  assert.equal(snapshot.trucks.length, 12);
  assert.deepEqual(snapshot.trucks.filter(truck => truck.route).map(truck => truck.route).sort(), ['A', 'B', 'D', 'E'],
    'all four player trucks remain present');
  const secondRow = snapshot.trucks.filter(truck => truck.route === 'D' || truck.route === 'E');
  for (const truck of secondRow) {
    assert.ok(truck.bounds.max.z < snapshot.bulk.min.z, `${truck.route}: second truck row stands before the bulk pile`);
  }
  assert.ok(snapshot.recovery.max.z < snapshot.bulk.min.z, 'recovery tray precedes the bulk area');
  assert.ok(snapshot.bulk.max.z < snapshot.rearWall.min.z, 'bulk pallet stops before its rear wall');
  assert.ok(Math.abs(snapshot.rearWall.min.y) < 1e-5 && snapshot.rearWall.max.y > 7, 'the final wall closes the full warehouse height');
  assert.ok(snapshot.rearWall.max.z <= snapshot.platform.max.z + 1e-5, 'rear wall ends at the platform edge');
  assert.ok(snapshot.rearWall.min.x <= -15 && snapshot.rearWall.max.x >= 15, 'terminal wall spans the whole depot');
  assert.ok(snapshot.ground.max.z <= snapshot.rearWall.min.z + 1e-5, 'lower floor stops at the final wall');
  assert.equal(snapshot.stairs.length, 12, 'both outward flights have six raised treads and a ground-level final interval');
  for (const { side, index, bounds } of snapshot.stairs) {
    const x = (bounds.min.x + bounds.max.x) / 2 * 32 + 480;
    assert.ok(Math.abs(bounds.max.y - platformLevelAt(x, SHIFT_LAYOUT.stairs.centerY) * 1.1) < 1e-5, `${side} tread ${index}: rendered and walking heights match`);
    assert.ok(side === 'left' ? bounds.max.x <= snapshot.platform.min.x + 1e-5 : bounds.min.x >= snapshot.platform.max.x - 1e-5,
      `${side} tread ${index}: descends outwards from the side of the platform`);
    assert.ok(bounds.max.z < snapshot.rearWall.min.z, `${side} tread ${index}: entirely before the final wall`);
    assert.ok(Math.abs(bounds.min.z * 32 + 340 - SHIFT_LAYOUT.stairs.minY) < 1e-5
      && Math.abs(bounds.max.z * 32 + 340 - SHIFT_LAYOUT.stairs.maxY) < 1e-5,
    `${side} tread ${index}: matches both physical flight edges`);
  }
  const warehouseBounds = await page.evaluate(() => window.fixtureApp.world.physicalBounds(window.fixtureApp.world.scene));
  assert.ok(warehouseBounds.max.z <= snapshot.rearWall.max.z + 1e-5, 'no depot scenery, props or floor extend behind the final wall');
  for (const truck of snapshot.trucks) {
    assert.ok(Math.abs(truck.cargoFloorY - snapshot.platform.max.y) < 1e-5, `${truck.name}: cargo floor meets deck`);
    assert.ok(Math.abs(Math.abs(truck.rearX) - 162 / 32) < 1e-5, `${truck.name}: rear meets platform edge`);
  }
  for (const side of [-1, 1]) {
    const rows = snapshot.trucks.filter(truck => Math.sign(truck.rearX) === side).sort((a, b) => a.bounds.min.z - b.bounds.min.z);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i].bounds.min.z - rows[i - 1].bounds.max.z >= 0.7,
      `${rows[i].name}: truck bodies leave a walkable aisle`);
  }

  // Real assisted deliveries establish the event threshold. Only the clock and
  // held freight are fixtures; switching and resetting use the actual controls.
  const scanner = await page.evaluate(layout => {
    const app = window.fixtureApp;
    app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true;
    app.state = 'playing'; app.overlay.clearCenter();
    const m = app.model;
    m.eventStopped = true; m.elapsedMs = 36_000; m.score = 420; m.combo = 3;
    for (const p of m.packages) p.state = 'delivered';
    const helper = m.workers[1];
    for (let index = 0; index < 4; index++) {
      Object.assign(helper, { x: layout.dropAreas.B.x, y: layout.dropAreas.B.y });
      const parcel = { id: 7000 + index, route: 'B', kind: 'smallbox', label: 'SYNTHETIC ASSIST', size: 'normal',
        x: helper.x, y: helper.y, state: 'held', workerId: helper.id, beltOffset: 0,
        recovered: false, missCounted: false, broken: false, breakY: null };
      m.packages.push(parcel); helper.heldId = parcel.id;
      m.update(20);
    }
    const assisted = { count: m.assistedSorted, dispatched: m.sorted, score: m.score, combo: m.combo };
    m.elapsedMs = 69_990; m.update(20);
    const carried = { ...m.packages.find(p => p.id === 7000), id: 7100, state: 'held', workerId: helper.id };
    m.packages.push(carried); helper.heldId = carried.id;
    app.updateHud();
    return { assisted, pending: m.pendingScannerWorker, heldId: carried.id, routeBefore: m.routeSorted.B };
  }, SHIFT_LAYOUT);
  assert.deepEqual(scanner.assisted, { count: 4, dispatched: 4, score: 420, combo: 3 }, 'partner dispatches add no points or combo');
  // The 3D shift has no scanner faults (the 2D depot keeps them).
  assert.equal(scanner.pending, null, 'no worker asks for a scanner reset in 3D');
  assert.equal(await page.locator('.b3d-scanner').isVisible(), false, 'no scanner prompt is shown');
  // With no fault to wait on, the partner carries on and delivers the freight it holds.
  await page.waitForFunction(id => window.fixtureApp.model.packages.find(p => p.id === id)?.state === 'delivered', scanner.heldId);
  assert.equal(await page.evaluate(() => window.fixtureApp.model.workers[1].heldId), null, 'the partner has delivered its carried freight');
  assert.equal(await page.evaluate(() => window.fixtureApp.model.score), 420, 'the partner delivery adds no points');
  console.log('PASS partner dispatches without score; no 3D scanner fault, so the partner delivers its carried freight without a prompt');

  // Every destination uses the same rendered surface as the shared rules.
  const destinations = ['A', 'D', 'T', 'B', 'E', 'S', 'C'];
  for (const route of destinations) {
    const result = await page.evaluate(({ route, layout }) => {
      const app = window.fixtureApp;
      app.restart();
      app.state = 'playing'; app.model.eventStopped = true; app.model.crewAssist = false;
      const m = app.model;
      if (['B', 'E', 'S'].includes(route)) m.switchWorker();
      const target = route === 'C' ? layout.bulkLeft : layout.dropAreas[route];
      const worker = m.activeWorker;
      const parcel = { id: 9000, route, kind: 'smallbox', label: route, size: 'normal', x: worker.x, y: worker.y,
        state: 'held', workerId: worker.id, beltOffset: 0, recovered: false, missCounted: false, broken: false, breakY: null };
      m.packages.push(parcel); worker.heldId = parcel.id;
      for (let i = 0; i < 400 && Math.hypot(worker.x - target.x, worker.y - target.y) > 3; i++) {
        const waypoint = m.navigationTarget(target);
        m.update(50, { x: waypoint.x - worker.x, y: waypoint.y - worker.y });
      }
      app.syncWorkers(0); app.syncParcels(0);
      const position = app.workers[worker.id].root.position.clone();
      return { dock: m.currentDock(), position, distance: Math.hypot(worker.x - target.x, worker.y - target.y) };
    }, { route, layout: SHIFT_LAYOUT });
    assert.equal(result.dock, route, `${route}: reachable using public movement: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.position.y - (['T', 'S'].includes(route) ? 0 : 1.1)) < 1e-5, `${route}: worker feet use correct floor`);
    await page.keyboard.press('Space');
    await page.waitForFunction(route => window.fixtureApp.model.routeSorted[route] === 1, route, { polling: 20 });
  }
  console.log('PASS geometry: raised deck, matching truck floors/rears, body-width aisles, all seven drops reached and delivered');

  // Inspect every parcel form on the belt and in hand. Long cartons must not
  // extend backward through the worker; grounded forms must rest on the tread.
  const parcelIssues = await page.evaluate(() => {
    const app = window.fixtureApp; app.restart(); app.model.eventStopped = true;
    const issues = [];
    for (const kind of ['envelope', 'smallbox', 'standard', 'bigbox', 'longbox', 'mallwood', 'goji', 'lobsters', 'duck', 'makeup', 'mesa', 'panchetters', 'atv', 'snakes']) {
      const p = { id: 8000, route: 'A', kind, label: kind, size: 'normal', x: 480, y: 400, state: 'belt', workerId: null,
        beltOffset: 0, recovered: false, missCounted: false, broken: false, breakY: null };
      app.model.packages.push(p); app.syncParcels(0);
      const view = app.parcels.get(p.id);
      if (Math.abs(app.world.physicalBounds(view.body).min.y - 1.89) > 1e-4) issues.push(`${kind}: belt contact`);
      p.state = 'held'; p.workerId = 'termite'; app.model.workers[0].heldId = p.id;
      app.workers.termite.root.rotation.y = 0; app.syncParcels(0);
      const bounds = app.world.physicalBounds(view.body);
      if (bounds.min.z < app.workers.termite.root.position.z + 0.18) issues.push(`${kind}: torso intersection`);
      app.restart();
    }
    return issues;
  });
  assert.deepEqual(parcelIssues, []);

  const crewCargoDistance = await page.evaluate(() => {
    const app = window.fixtureApp; app.restart(); app.model.eventStopped = true;
    const actor = app.crew.clearanceActors.find(([id]) => id === 'john')[1];
    actor.root.visible = true; actor.pose = 'none'; actor.character.body.rotation.set(0, 0, 0);
    actor.root.position.set((365 - 480) / 32, 1.1, (396 - 340) / 32);
    Object.assign(app.model.packages[0], { state: 'floor', x: 365, y: 396 });
    app.clearCrewFootprints();
    return Math.hypot(actor.root.position.x * 32 + 480 - 365, actor.root.position.z * 32 + 340 - 396);
  });
  assert.ok(crewCargoDistance >= 36 - 1e-5, 'standing coworkers yield around loose floor freight');

  const receivingCrew = await page.evaluate(() => {
    const app = window.fixtureApp; app.restart(); app.state = 'paused'; app.model.eventStopped = true;
    Object.assign(app.model.workers[0], { x: 430, y: 84 }); Object.assign(app.model.workers[1], { x: 530, y: 84 });
    const points = [], overlaps = [];
    for (let step = 0; step < 400; step++) {
      app.model.elapsedMs = 10_000 + step * 50; app.model.beltTravel = step * 8;
      app.crew.update(0.05, app.model, step / 20); app.clearCrewFootprints();
      const occupied = app.model.workers.map(w => ({ id: w.id, x: w.x, y: w.y }));
      for (const [id, actor] of app.crew.clearanceActors) {
        if (!actor.root.visible || actor.pose === 'massage' || actor.pose === 'sit' || Math.abs(actor.character.body.rotation.z) > 0.8) continue;
        const point = { id, x: actor.root.position.x * 32 + 480, y: actor.root.position.z * 32 + 340 };
        if (point.y < 210) {
          points.push(point);
          for (const other of occupied) if (Math.hypot(point.x - other.x, point.y - other.y) < 24 - 0.001) overlaps.push(`${id}/${other.id}`);
        }
        occupied.push(point);
      }
    }
    return { points, overlaps };
  });
  assert.ok(receivingCrew.points.length > 800, 'sample ordinary moving receiving crew');
  assert.deepEqual(receivingCrew.overlaps, [], 'workers never occupy the same standing space');
  assert.deepEqual(receivingCrew.points.filter(point => receivingBlocked(point, 12)), [], 'workers clear the visible feeder guards and head motor');

  // Mixed recovery freight must fit on the actual tray, stack without overlap,
  // and stay clear of a worker approaching from either lane.
  const recovery = await page.evaluate(layout => {
    const app = window.fixtureApp; app.restart(); app.model.eventStopped = true;
    app.model.packages.length = 0;
    const issues = [];
    const kinds = ['longbox', 'mesa', 'atv', 'mallwood', 'duck'];
    for (const [index, kind] of kinds.entries()) app.model.packages.push({ id: 7000 + index, route: 'C', kind, label: kind,
      size: 'heavy', ...layout.recoveryPile, state: 'missed', workerId: null, beltOffset: 0,
      recovered: false, missCounted: true, broken: false, breakY: null });
    app.syncParcels(0);
    const tray = app.world.physicalBounds(app.world.recoverySurface);
    const cargo = app.model.packages.map(p => ({ kind: p.kind, bounds: app.world.physicalBounds(app.parcels.get(p.id).body) }));
    const overlaps = (a, b) => ['x', 'y', 'z'].every(axis => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > 0.001);
    for (let i = 0; i < cargo.length; i++) {
      const { kind, bounds } = cargo[i];
      if (bounds.min.x < tray.min.x - 0.001 || bounds.max.x > tray.max.x + 0.001
        || bounds.min.z < tray.min.z - 0.001 || bounds.max.z > tray.max.z + 0.001) issues.push(`${kind}: overhangs tray`);
      if (bounds.min.y < tray.max.y - 0.001) issues.push(`${kind}: penetrates tray`);
      for (let j = i + 1; j < cargo.length; j++) if (overlaps(bounds, cargo[j].bounds)) issues.push(`${kind}: overlaps ${cargo[j].kind}`);
    }
    for (const [index, worker] of app.model.workers.entries()) {
      Object.assign(worker, { x: index ? 560 : 400, y: layout.recoveryPile.y });
      app.syncWorkers(0);
      const body = app.world.physicalBounds(app.workers[worker.id].body);
      for (const item of cargo) if (overlaps(body, item.bounds)) issues.push(`${worker.id}: intersects ${item.kind}`);
    }
    return { issues, count: cargo.length, trayEmpty: tray.isEmpty() };
  }, SHIFT_LAYOUT);
  assert.equal(recovery.trayEmpty, false, 'recovery containment inspects the rendered tray');
  assert.equal(recovery.count, 5);
  assert.deepEqual(recovery.issues, []);

  const floorStorage = await page.evaluate(layout => {
    const app = window.fixtureApp; app.restart(); app.model.eventStopped = true; app.model.crewAssist = false;
    app.model.packages[0].state = 'delivered';
    const issues = [];
    let instances = 0;
    let approachSamples = 0;
    let carriedSamples = 0;
    const overlaps = (a, b) => ['x', 'y', 'z'].every(axis => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > 0.001);
    for (const [side, route] of ['T', 'S'].entries()) {
      const growing = app.world.floorPiles[route];
      app.world.setFloorPile(route, 0); growing.computeBoundingSphere();
      app.world.setFloorPile(route, 1);
      if (!growing.boundingSphere || growing.boundingSphere.radius <= 0 || growing.boundingBox.isEmpty()) issues.push(`${route}: first carton still has empty culling bounds`);
      const firstRadius = growing.boundingSphere.radius;
      app.world.setFloorPile(route, 36);
      if (growing.boundingSphere.radius <= firstRadius) issues.push(`${route}: growing stack does not refresh culling bounds`);
      const pile = app.world.floorPiles[route]; pile.updateWorldMatrix(true, false);
      pile.geometry.computeBoundingBox();
      const boxes = [];
      const matrix = pile.matrixWorld.clone();
      const storage = layout.floorStorage[route];
      for (let i = 0; i < pile.count; i++) {
        pile.getMatrixAt(i, matrix); matrix.premultiply(pile.matrixWorld);
        const box = pile.geometry.boundingBox.clone().applyMatrix4(matrix);
        boxes.push(box); instances++;
        if (box.min.y < -0.001) issues.push(`${route}/${i}: below floor`);
        if (box.min.x * 32 + 480 < storage.x - storage.width / 2 - 0.001
          || box.max.x * 32 + 480 > storage.x + storage.width / 2 + 0.001
          || box.min.z * 32 + 340 < storage.y - storage.height / 2 - 0.001
          || box.max.z * 32 + 340 > storage.y + storage.height / 2 + 0.001) issues.push(`${route}/${i}: outside reserved storage`);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        if (overlaps(boxes[i], boxes[j])) issues.push(`${route}/${i}: intersects stack slot ${j}`);
      }
      app.model.activeIndex = side;
      const worker = app.model.activeWorker;
      const target = layout.dropAreas[route];
      for (let i = 0; i < 300 && Math.hypot(worker.x - target.x, worker.y - target.y) > 3; i++) {
        const waypoint = app.model.navigationTarget(target);
        app.model.update(20, { x: waypoint.x - worker.x, y: waypoint.y - worker.y });
        app.syncWorkers(0); approachSamples++;
        const body = app.world.physicalBounds(app.workers[worker.id].body);
        if (boxes.some(box => overlaps(body, box))) issues.push(`${route}: worker crosses stored freight`);
      }
      if (app.model.currentDock() !== route) issues.push(`${route}: stored freight blocks delivery approach`);
      // The player can turn while carrying any form at the drop, before Space
      // replaces it with the stored pile slot. Inspect the actual held geometry.
      Object.assign(worker, target);
      app.syncWorkers(0);
      for (const kind of ['envelope', 'smallbox', 'standard', 'bigbox', 'longbox', 'mallwood', 'goji', 'lobsters', 'duck', 'makeup', 'mesa', 'panchetters', 'atv', 'snakes']) {
        const parcel = { id: 7500 + carriedSamples, route, kind, label: kind, size: 'normal', ...target, state: 'held',
          workerId: worker.id, beltOffset: 0, recovered: false, missCounted: false, broken: false, breakY: null };
        app.model.packages.push(parcel); worker.heldId = parcel.id;
        for (let angle = 0; angle < 360; angle += 15) {
          app.workers[worker.id].root.rotation.y = angle * Math.PI / 180;
          app.syncParcels(0); carriedSamples++;
          const cargo = app.world.physicalBounds(app.parcels.get(parcel.id).body);
          if (boxes.some(box => overlaps(cargo, box))) issues.push(`${route}/${kind}/${angle}: carried freight crosses stored pile`);
          if (cargo.max.z >= app.world.physicalBounds(app.world.bulkRearWall).min.z) issues.push(`${route}/${kind}/${angle}: held freight crosses rear wall`);
        }
        parcel.state = 'delivered'; worker.heldId = null;
      }
    }
    return { issues, instances, approachSamples, carriedSamples };
  }, SHIFT_LAYOUT);
  assert.equal(floorStorage.instances, 72, 'both full floor piles are inspected instance by instance');
  assert.ok(floorStorage.approachSamples > 100, 'workers actually traverse both approach routes');
  assert.equal(floorStorage.carriedSamples, 672, 'all fourteen held forms turn through 24 headings at both floor drops');
  assert.deepEqual(floorStorage.issues, []);
  console.log('PASS geometry: mixed recovery cargo fits tray without overlap; both full floor stacks preserve clear worker approaches');

  const stairCarry = await page.evaluate(layout => {
    const app = window.fixtureApp; app.restart(); app.model.eventStopped = true; app.model.crewAssist = false;
    const issues = [];
    const rails = app.world.stairRails.map(mesh => app.world.physicalBounds(mesh));
    const wall = app.world.physicalBounds(app.world.bulkRearWall);
    const overlaps = (a, b) => ['x', 'y', 'z'].every(axis => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > 0.001);
    let samples = 0;
    for (const [side, worker] of app.model.workers.entries()) {
      const flight = layout.stairs[side ? 'right' : 'left'];
      for (const kind of ['envelope', 'smallbox', 'standard', 'bigbox', 'longbox', 'mallwood', 'goji', 'lobsters', 'duck', 'makeup', 'mesa', 'panchetters', 'atv', 'snakes']) {
        const parcel = { id: 9000 + samples, route: side ? 'S' : 'T', kind, label: kind, size: 'normal', x: worker.x, y: worker.y,
          state: 'held', workerId: worker.id, beltOffset: 0, recovered: false, missCounted: false, broken: false, breakY: null };
        app.model.packages.push(parcel); worker.heldId = parcel.id;
        for (const y of [layout.stairs.minY + layout.carriedClearance, layout.stairs.maxY - layout.carriedClearance]) for (let step = 0; step < layout.stairs.steps; step++) {
          Object.assign(worker, { x: flight.topX + (flight.bottomX - flight.topX) * (step + 0.5) / layout.stairs.steps, y });
          app.syncWorkers(0);
          for (let angle = 0; angle < 360; angle += 15) {
            app.workers[worker.id].root.rotation.y = angle * Math.PI / 180;
            app.syncParcels(0); samples++;
            const cargo = app.world.physicalBounds(app.parcels.get(parcel.id).body);
            if (rails.some(rail => overlaps(cargo, rail))) issues.push(`${side}/${kind}/${step}/${y}/${angle}: carried freight crosses stair rail`);
            if (overlaps(cargo, wall)) issues.push(`${side}/${kind}/${step}/${y}/${angle}: carried freight crosses final wall`);
          }
        }
        parcel.state = 'delivered'; worker.heldId = null;
      }
    }
    return { issues, samples, rails: rails.length };
  }, SHIFT_LAYOUT);
  assert.equal(stairCarry.rails, 16, 'both handrails and every supporting post are measured');
  assert.equal(stairCarry.samples, 9408, 'all freight forms and headings clear both side flights at both permitted carry edges');
  assert.deepEqual(stairCarry.issues, []);

  // Sample authored camera positions through every arrival, scrum and break.
  // The near plane stays outside truck bodies; intended seating is not treated
  // as a collision between an actor and their own seat/vehicle.
  for (const scene of [...OPENERS, SCRUM, ...Object.values(BREAK_SCENES).flat(), MALL_ASSIGNMENT, DRIVE_TO_MALL, DRIVE_TO_UPS, GO_HOME]) {
    const issues = await page.evaluate(scene => {
      const app = window.fixtureApp; app.playScene(scene);
      const failures = [];
      let samples = 0;
      for (let index = 0; index < scene.beats.length; index++) for (const fraction of [0, 0.25, 0.5, 0.75, 0.99]) {
        const c = app.cutscene; c.index = index; c.elapsedMs = c.beat.ms * fraction;
        if (scene.location === 'depot') continue; // Covered by the warehouse camera samples below.
        app.stage.direct(c, 1, index * 2 + fraction);
        const camera = app.stage.camera;
        camera.updateMatrixWorld();
        const halfHeight = camera.near * Math.tan(camera.fov * Math.PI / 360);
        const halfWidth = halfHeight * camera.aspect;
        const nearBounds = app.world.physicalBounds(app.world.platformDeck).makeEmpty().expandByPoint(camera.position);
        for (const x of [-halfWidth, halfWidth]) for (const y of [-halfHeight, halfHeight]) {
          nearBounds.expandByPoint(camera.position.clone().set(x, y, -camera.near).applyMatrix4(camera.matrixWorld));
        }
        for (const [name, prop] of Object.entries(app.stage.stages[app.stage.active].props)) {
          if (!prop.visible || (scene.location !== 'store' && !/^(car(?:-|$)|truck$|fiveTon$|park-|passing$)/i.test(name))) continue;
          const bounds = app.world.physicalBounds(prop);
          if (bounds.isEmpty()) continue;
          samples++;
          if (bounds.intersectsBox(nearBounds)) failures.push(`${scene.id}:${index}/${fraction}: camera near plane intersects ${name}`);
        }
      }
      return { failures, samples };
    }, scene);
    assert.deepEqual(issues.failures, []);
    if (scene.location !== 'depot') assert.ok(issues.samples > 0, `${scene.id}: camera samples inspect actual vehicles or store props`);
  }

  const depotCameras = await page.evaluate(({ layout, scrum }) => {
    const app = window.fixtureApp; app.restart();
    const failures = [];
    let samples = 0;
    const check = label => {
      const camera = app.camera; camera.updateMatrixWorld();
      const visible = (point, item) => {
        const fog = app.world.scene.fog;
        if (app.state === 'playing' && app.overview && point.distanceTo(camera.position) > fog.near + (fog.far - fog.near) * 0.35) failures.push(`${label}: ${item} lost in overview fog`);
        const screen = point.project(camera);
        if (Math.abs(screen.x) > 0.9 || screen.y < -0.88 || screen.y > 0.84 || screen.z < -1 || screen.z > 1) failures.push(`${label}: ${item} outside usable frame`);
      };
      if (app.state === 'playing' && !app.overview) {
        const worker = app.workers[app.model.activeWorker.id];
        const body = app.world.physicalBounds(worker.body);
        for (const x of [body.min.x, body.max.x]) for (const y of [body.min.y, body.max.y]) for (const z of [body.min.z, body.max.z]) {
          visible(camera.position.clone().set(x, y, z), 'active worker');
        }
      } else if (app.state === 'playing' && app.overview) {
        for (const [name, area] of Object.entries(layout.dropAreas)) {
          for (const dx of [-area.width / 2, area.width / 2]) for (const dy of [-area.height / 2, area.height / 2]) {
            visible(camera.position.clone().set((area.x + dx - 480) / 32, name === 'T' || name === 'S' ? 0 : 1.1, (area.y + dy - 340) / 32), `drop ${name}`);
          }
        }
      }
      const halfHeight = camera.near * Math.tan(camera.fov * Math.PI / 360);
      const halfWidth = halfHeight * camera.aspect;
      const near = app.world.physicalBounds(app.world.platformDeck).makeEmpty().expandByPoint(camera.position);
      for (const x of [-halfWidth, halfWidth]) for (const y of [-halfHeight, halfHeight]) near.expandByPoint(camera.position.clone().set(x, y, -camera.near).applyMatrix4(camera.matrixWorld));
      if (near.max.z >= app.world.physicalBounds(app.world.bulkRearWall).min.z) failures.push(`${label}: camera crosses terminal wall`);
      for (const solid of [app.world.platformDeck, app.world.beltSurface, app.world.bulkSurface, app.world.recoverySurface, app.world.bulkRearWall, ...app.world.stairTreads.map(step => step.mesh), ...app.world.stairRails, ...app.world.trucks.map(truck => truck.group)]) {
        samples++;
        if (near.intersectsBox(app.world.physicalBounds(solid))) failures.push(label);
      }
    };
    for (const aspect of [1.6, 390 / 844]) {
      app.camera.aspect = aspect; app.camera.updateProjectionMatrix();
      app.state = 'playing';
      for (const side of [0, 1]) {
        const stair = layout.stairs[side ? 'right' : 'left'];
        const points = [-20, layout.beltTop, layout.dockA.y, layout.dockD.y, layout.bulkLeft.y, layout.workerMaxY]
          .map(y => ({ x: side ? 580 : 380, y }));
        points.push({ x: stair.topX, y: layout.stairs.centerY }, { x: (stair.topX + stair.bottomX) / 2, y: layout.stairs.centerY },
          { x: stair.bottomX, y: layout.stairs.centerY }, side ? layout.floorS : layout.floorT);
        for (const point of points) for (const overview of [false, true]) {
        app.model.activeIndex = side; app.overview = overview;
        Object.assign(app.model.activeWorker, point);
        app.syncWorkers(0); app.updateCamera(1, true);
        check(`worker ${side} at ${point.x}/${point.y}, overview ${overview}, aspect ${aspect}`);
        }
      }
      app.playScene(scrum);
      for (let beat = 0; beat < scrum.beats.length; beat++) {
        app.cutscene.index = beat; app.cutscene.elapsedMs = 0;
        app.lastFrame = performance.now(); app.tick(); app.updateCamera(1, true);
        check(`scrum beat ${beat}, aspect ${aspect}`);
      }
    }
    return { failures, samples };
  }, { layout: SHIFT_LAYOUT, scrum: SCRUM });
  assert.ok(depotCameras.samples > 1_000, 'warehouse checks cover actual geometry, both workers, all drop heights, both views and two aspect ratios');
  assert.deepEqual(depotCameras.failures, []);

  const clockout = await page.evaluate(({ scene, layout }) => {
    const app = window.fixtureApp; app.restart(); app.playScene(scene);
    const failures = [];
    let stairSamples = 0;
    for (let beat = 0; beat < scene.beats.length; beat++) for (let i = 0; i <= 20; i++) {
      app.cutscene.index = beat; app.cutscene.elapsedMs = scene.beats[beat].ms * i / 21;
      app.lastFrame = performance.now(); app.tick();
      const worker = app.workers.termite;
      const bounds = app.world.physicalBounds(worker.body);
      const wall = app.world.physicalBounds(app.world.bulkRearWall);
      if (bounds.max.z >= wall.min.z) failures.push(`${beat}/${i}: Termite crosses final wall`);
      const x = worker.root.position.x * 32 + 480;
      const y = worker.root.position.z * 32 + 340;
      if (x < layout.stairs.left.topX && x > layout.stairs.left.bottomX) {
        stairSamples++;
        if (Math.abs(y - layout.stairs.centerY) > 0.001) failures.push(`${beat}/${i}: exits across unprotected deck edge`);
        const level = 1 - (Math.floor((layout.stairs.left.topX - x) / (layout.stairs.left.topX - layout.stairs.left.bottomX) * layout.stairs.steps) + 1) / layout.stairs.steps;
        if (Math.abs(worker.root.position.y - level * 1.1) > 1e-5) failures.push(`${beat}/${i}: feet miss side tread`);
      }
    }
    return { failures, stairSamples };
  }, { scene: MALL_ASSIGNMENT, layout: SHIFT_LAYOUT });
  assert.ok(clockout.stairSamples > 0, 'clock-out actually samples Termite descending the west side flight');
  assert.deepEqual(clockout.failures, []);

  const lifecycle = await page.evaluate(() => {
    const app = window.fixtureApp; app.restart();
    const counts = [];
    for (let cycle = 0; cycle < 4; cycle++) {
      for (let i = 0; i < 24; i++) app.model.packages.push({ id: 5000 + i, route: 'A', kind: 'smallbox', label: 'SYNTHETIC', size: 'normal',
        x: 480, y: 400, state: 'belt', workerId: null, beltOffset: 0, recovered: false, missCounted: false, broken: false, breakY: null });
      app.syncParcels(0); app.renderer.render(app.world.scene, app.camera);
      app.restart(); app.renderer.render(app.world.scene, app.camera);
      counts.push({ ...app.renderer.info.memory });
    }
    const before = app.time;
    app.dispose(); app.dispose();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
    return { counts, state: app.state, before, roots: document.querySelectorAll('.b3d').length };
  });
  assert.deepEqual(lifecycle.counts.at(-1), lifecycle.counts[0], 'GPU geometry/texture counts stay stable over four replays');
  assert.equal(lifecycle.state, 'briefing', 'disposed key handlers do not restart the game');
  assert.equal(lifecycle.roots, 0);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.fixtureApp.time), lifecycle.before, 'disposed timer stops ticking');
  assert.deepEqual(errors, []);
  console.log('PASS parcel contact/carry bounds, authored camera samples, stable GPU resources over replay, complete app teardown');
} finally {
  await browser?.close();
  await server?.close();
}
