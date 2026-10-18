import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { SHIFT_LAYOUT } from '../src/game/slice/ShiftModel.ts';
import { OPENERS, BREAK_SCENES, SCRUM, MALL_ASSIGNMENT, DRIVE_TO_MALL, DRIVE_TO_UPS, GO_HOME } from '../src/game/slice/StoryScript.ts';

// Controlled geometry fixtures complement real-input gameplay in the other suites.
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
    args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => window.addEventListener('belt3d:ready', event => { window.fixtureApp = event.detail; }));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 90_000 });
  const snapshot = await page.evaluate(() => window.fixtureApp.world.geometrySnapshot());
  assert.ok(Math.abs(snapshot.platform.max.y - 1.1) < 1e-5, 'deck stands 1.1m above lower floor');
  assert.ok(Math.abs(snapshot.belt.max.y - 1.88) < 1e-5, 'belt contact is 0.78m above deck');
  assert.equal(snapshot.trucks.length, 12);
  for (const truck of snapshot.trucks) {
    assert.ok(Math.abs(truck.cargoFloorY - snapshot.platform.max.y) < 1e-5, `${truck.name}: cargo floor meets deck`);
    assert.ok(Math.abs(Math.abs(truck.rearX) - 162 / 32) < 1e-5, `${truck.name}: rear meets platform edge`);
  }
  for (const side of [-1, 1]) {
    const rows = snapshot.trucks.filter(truck => Math.sign(truck.rearX) === side).sort((a, b) => a.bounds.min.z - b.bounds.min.z);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i].bounds.min.z - rows[i - 1].bounds.max.z >= 0.7,
      `${rows[i].name}: truck bodies leave a walkable aisle`);
  }

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
      for (let i = 0; i < 400 && Math.hypot(worker.x - target.x, worker.y - target.y) > 3; i++) {
        m.update(50, { x: target.x - worker.x, y: target.y - worker.y });
      }
      const parcel = { id: 9000, route, kind: 'smallbox', label: route, size: 'normal', x: worker.x, y: worker.y,
        state: 'held', workerId: worker.id, beltOffset: 0, recovered: false, missCounted: false, broken: false, breakY: null };
      m.packages.push(parcel); worker.heldId = parcel.id;
      app.syncWorkers(0); app.syncParcels(0);
      const position = app.workers[worker.id].root.position.clone();
      return { dock: m.currentDock(), position, distance: Math.hypot(worker.x - target.x, worker.y - target.y) };
    }, { route, layout: SHIFT_LAYOUT });
    assert.equal(result.dock, route, `${route}: reachable using public movement`);
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
    const overlaps = (a, b) => ['x', 'y', 'z'].every(axis => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > 0.001);
    for (const [side, route] of ['T', 'S'].entries()) {
      app.world.setFloorPile(route, 36);
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
        app.model.update(20, { x: target.x - worker.x, y: target.y - worker.y });
        app.syncWorkers(0); approachSamples++;
        const body = app.world.physicalBounds(app.workers[worker.id].body);
        if (boxes.some(box => overlaps(body, box))) issues.push(`${route}: worker crosses stored freight`);
      }
      if (app.model.currentDock() !== route) issues.push(`${route}: stored freight blocks delivery approach`);
    }
    return { issues, instances, approachSamples };
  }, SHIFT_LAYOUT);
  assert.equal(floorStorage.instances, 72, 'both full floor piles are inspected instance by instance');
  assert.ok(floorStorage.approachSamples > 100, 'workers actually traverse both approach routes');
  assert.deepEqual(floorStorage.issues, []);
  console.log('PASS geometry: mixed recovery cargo fits tray without overlap; both full floor stacks preserve clear worker approaches');

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
      const halfHeight = camera.near * Math.tan(camera.fov * Math.PI / 360);
      const halfWidth = halfHeight * camera.aspect;
      const near = app.world.physicalBounds(app.world.platformDeck).makeEmpty().expandByPoint(camera.position);
      for (const x of [-halfWidth, halfWidth]) for (const y of [-halfHeight, halfHeight]) near.expandByPoint(camera.position.clone().set(x, y, -camera.near).applyMatrix4(camera.matrixWorld));
      for (const solid of [app.world.platformDeck, app.world.beltSurface, ...app.world.trucks.map(truck => truck.group)]) {
        samples++;
        if (near.intersectsBox(app.world.physicalBounds(solid))) failures.push(label);
      }
    };
    for (const aspect of [1.6, 390 / 844]) {
      app.camera.aspect = aspect; app.camera.updateProjectionMatrix();
      app.state = 'playing';
      for (const side of [0, 1]) for (const y of [-20, 146, 532, 740, 830, 940, 992]) for (const overview of [false, true]) {
        app.model.activeIndex = side; app.overview = overview;
        Object.assign(app.model.activeWorker, { x: side ? 580 : 380, y });
        app.syncWorkers(0); app.updateCamera(1, true);
        check(`worker ${side} at ${y}, overview ${overview}, aspect ${aspect}`);
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
  assert.ok(depotCameras.samples > 1_000, 'warehouse checks cover actual geometry, both workers, seven heights, both views and two aspect ratios');
  assert.deepEqual(depotCameras.failures, []);

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
  await server.close();
}
