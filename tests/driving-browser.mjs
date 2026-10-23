import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { driveJourney, driveToBay, touchDriveToBay } from './driving-helpers.mjs';
import { SPAWNS, DESTINATIONS } from '../src/three/drivingCity.ts';

const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const browser = await chromium.launch({ headless: true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const observeAppAndMusic = () => {
  window.addEventListener('belt3d:ready', e => { window.fixtureApp = e.detail; e.detail.playPrologue = false; });
  window.fixtureMusicStarts = 0;
  const create = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function (...args) {
    const source = create.apply(this, args), start = source.start.bind(source);
    source.start = (...values) => { if (source.buffer?.duration > 60) window.fixtureMusicStarts++; return start(...values); };
    return source;
  };
};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(observeAppAndMusic);
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 90_000 });
  assert.equal(await page.evaluate(() => window.fixtureMusicStarts), 0, 'briefing waits for the start gesture');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureMusicStarts > 0 && window.fixtureApp.story.chapter === 'arrival', null, { polling: 10 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.fixtureApp.state === 'paused', null, { polling: 10 });
  const musicStarts = await page.evaluate(() => window.fixtureMusicStarts);
  await page.keyboard.press('Enter');
  await page.waitForFunction(n => window.fixtureMusicStarts > n && window.fixtureApp.story.chapter === 'arrival', musicStarts, { polling: 10 });
  // Synthetic warehouse completion; use the real assignment and road transitions.
  await page.evaluate(() => {
    const app = window.fixtureApp;
    app.model.score = 1000; app.model.won = true; app.model.ended = true;
    app.story.go('assignment');
    app.playScene({ id: 'mall-assignment', title: 'MALL RUN', location: 'depot', beats: [{ ms: 1000, cue: 'shan-catches' }] });
  });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureApp.cutscene?.scene.id === 'drive-to-mall', null, { polling: 10 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureApp.state === 'driving', null, { polling: 10 });
  await page.evaluate(() => window.fixtureApp.drivingView.ready);
  assert.ok(await page.evaluate(() => {
    const view = window.fixtureApp.drivingView;
    return view.buildingCount >= 30 && view.truck.userData.modelReady && view.scene.children.filter(c => c.name === 'city-building').every(c => c.userData.modelReady);
  }), 'local building and five-ton models load successfully');
  assert.equal(await page.evaluate(() => [...window.fixtureApp.drivingView.cones.values()].filter(cone => cone.children.length === 3).length), 6,
    'asynchronous city merging retains movable cones for both journeys');
  // The city's lit windows are one instanced draw on every block; the traffic draws as three batches
  // once the sedans are in (forced here, since a software renderer keeps the procedural cars).
  const city = await page.evaluate(async () => {
    const app = window.fixtureApp, view = app.drivingView;
    const windows = view.scene.getObjectByName('city-windows');
    const batched = await view.enableTrafficBatch();
    view.update(app.driving, 1 / 60);
    const report = view.trafficReport();
    const standIns = [...view.traffic.values()].filter(car => car.visible).length;
    const batches = view.scene.getObjectByName('traffic-batch')?.children.map(mesh => ({ name: mesh.name, batched: mesh.isBatchedMesh === true })) ?? [];
    // Each composer pass resets the renderer's counters; count one whole frame by hand.
    const info = app.renderer.info;
    info.autoReset = false;
    await new Promise(resolve => requestAnimationFrame(() => { info.reset(); requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
    const calls = Math.round(info.render.calls / 2), triangles = Math.round(info.render.triangles / 2);
    info.autoReset = true;
    return { windows: windows ? windows.count : 0, instanced: windows?.isInstancedMesh === true, batched, cars: report.length, variants: new Set(report.map(r => r.variant)).size,
      near: report.filter(r => !r.far).length, far: report.filter(r => r.far).length, standIns, batches, calls, triangles };
  });
  assert.ok(city.instanced && city.windows > 2000, `lit windows as one instanced mesh: ${JSON.stringify(city)}`);
  assert.ok(city.batched && city.cars === 28 && city.variants === 2 && city.standIns === 0, `28 batched sedans of both shapes replace the stand-ins: ${JSON.stringify(city)}`);
  assert.ok(city.near >= 1 && city.far >= 1, `near cars at full detail and far cars as shells: ${JSON.stringify(city)}`);
  assert.deepEqual(city.batches.map(b => b.name).sort(), ['traffic-batch-lights', 'traffic-batch-paint', 'traffic-batch-tails', 'traffic-batch-trim']);
  assert.ok(city.batches.every(b => b.batched));
  assert.ok(city.calls < 200 && city.triangles < 600_000, `the road stays within its draw budget: ${JSON.stringify(city)}`);
  assert.ok(await page.evaluate(() => {
    const view = window.fixtureApp.drivingView, pointer = view.navigation.pointer;
    pointer.geometry.computeBoundingBox();
    return pointer.geometry.type === 'ExtrudeGeometry' && pointer.geometry.boundingBox.max.y - pointer.geometry.boundingBox.min.y > 0.35
      && view.scene.children.filter(c => c.name === 'city-building').length >= 120;
  }), 'the larger city has a solid three-dimensional navigation arrow');
  // Snow caught in the headlights: a brighter, denser fall a few metres ahead of the truck, blown by the same wind as the rest.
  const beam = await page.evaluate(() => {
    const view = window.fixtureApp.drivingView, d = window.fixtureApp.driving;
    const points = view.scene.getObjectByName('snowfall-beam'), rest = view.scene.getObjectByName('snowfall');
    points.geometry.computeBoundingBox();
    const centre = points.geometry.boundingBox.getCenter(points.position.clone());
    const ahead = (centre.x - d.x) * d.pose.tx + (centre.z - d.z) * d.pose.tz;
    const beamMaterial = points.material, restMaterial = rest.material;
    return { count: points.geometry.getAttribute('position').count, ahead, brighter: beamMaterial.opacity > restMaterial.opacity && beamMaterial.color.getHex() !== restMaterial.color.getHex() };
  });
  assert.ok(beam.count >= 180 && beam.ahead > 3 && beam.ahead < 11 && beam.brighter, `the headlight snow falls ahead of the truck: ${JSON.stringify(beam)}`);
  assert.match(await page.locator('.b3d-drive-nav').innerText(), /SOUTHGATE MALL/);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.fixtureApp.state), 'driving', 'Enter cannot skip driving');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.fixtureApp.driving.speed > 10, null, { polling: 10 });
  // A is held for the usual tap, and on until the truck has turned: a software renderer under load can run only a tick
  // or two in 220 ms (CI once saw too little turn), but a few seconds without turning still fails.
  await page.keyboard.down('KeyA'); await page.waitForTimeout(220);
  await page.waitForFunction(() => window.fixtureApp.driving.heading > Math.PI / 2 + 0.1, null, { polling: 10, timeout: 3000 }).catch(() => {});
  await page.keyboard.up('KeyA');
  assert.ok(await page.evaluate(() => window.fixtureApp.driving.heading > Math.PI / 2 + 0.1), 'A changes actual world heading to the left');
  // The camera and cab checks below steer the truck about; it goes back where it was after them, so the checks that follow
  // (the synthetic cone five metres ahead) start from the same place as before, not beside a building.
  const beforeTurns = await page.evaluate(() => { const d = window.fixtureApp.driving; return { x: d.x, z: d.z, heading: d.heading, speed: d.speed, steer: d.steer }; });
  // A hard turn at speed: the chase camera lags through the corner, and must never end a frame inside a building or a lamp post
  // (that showed as the screen flashing black), nor present a frame with nothing in it.
  await page.evaluate(() => {
    const app = window.fixtureApp, view = app.drivingView, gl = app.renderer.getContext(), draw = app.draw.bind(app), px = new Uint8Array(4);
    // The camera's place is checked on every game tick (a software renderer spaces its draws out); the picture on every draw.
    window.cameraFrames = { ticks: 0, inside: 0, draws: 0, black: 0 };
    // Restored straight after the turns: reading pixels back on every draw stalls a software renderer, and left in place
    // it slowed the rest of the drive on CI until the driver ran out of time.
    window.restoreCameraCheck = () => { view.update = update; app.draw = draw; };
    const update = view.update.bind(view);
    view.update = (model, dt) => {
      update(model, dt);
      window.cameraFrames.ticks += 1;
      if (view.blockers.some(box => box.containsPoint(view.camera.position))) window.cameraFrames.inside += 1;
    };
    app.draw = () => {
      // A software renderer spaces its draws out: most calls return without drawing, and reading back then finds the
      // frame already shown and cleared, which counted as black (the check failed on CI with 54 such calls of 80).
      const before = app.lastRender;
      draw();
      if (app.lastRender === before) return;
      window.cameraFrames.draws += 1;
      const { width, height } = app.renderer.domElement; let lit = 0;
      for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) { gl.readPixels(Math.floor(width * i / 6), Math.floor(height * j / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (px[0] + px[1] + px[2] > 12) lit += 1; }
      if (lit === 0) window.cameraFrames.black += 1;
    };
  });
  for (const key of ['KeyA', 'KeyD', 'KeyA']) { await page.keyboard.down(key); await page.waitForTimeout(900); await page.keyboard.up(key); await page.waitForTimeout(500); }
  const cameraFrames = await page.evaluate(() => { window.restoreCameraCheck(); return window.cameraFrames; });
  // A software renderer runs only a handful of ticks in those seconds; a real GPU runs dozens.
  const minimumTicks = await page.evaluate(() => window.fixtureApp.quality === 'high' ? 21 : 1);
  assert.ok(cameraFrames.ticks >= minimumTicks && cameraFrames.draws >= 1 && cameraFrames.inside === 0 && cameraFrames.black === 0, `the chase camera stays out of the scenery through hard turns: ${JSON.stringify(cameraFrames)}`);
  // One not-a-number pixel through the bloom: a stock bloom pass spreads it over the frame (the black flashes), the game's guarded one
  // leaves the rest of the frame intact. Only the high-quality renderer has the bloom; the software renderer draws without it.
  const bloomCheck = await page.evaluate(() => {
    const app = window.fixtureApp;
    if (!app.composer) return null;
    const guarded = app.composer.passes.find(p => p.strength !== undefined && p.radius !== undefined);
    const size = 64, Target = app.composer.renderTarget1.constructor, Material = guarded.materialHighPassFilter.constructor;
    const seed = new Material({ uniforms: { zero: { value: 0 } }, vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: 'uniform float zero; void main() { bool hole = abs( gl_FragCoord.x - 20.5 ) < 0.6 && abs( gl_FragCoord.y - 20.5 ) < 0.6; float bad = uintBitsToFloat( 0x7fc00000u + uint( zero ) ); gl_FragColor = hole ? vec4( bad ) : vec4( 0.4, 0.4, 0.4, 1.0 ); }' });
    const spread = (bloom) => {
      const target = new Target(size, size, { type: app.composer.renderTarget1.texture.type });
      bloom.setSize(size, size);
      const quad = guarded._fsQuad ?? guarded.fsQuad, previous = quad.material;
      quad.material = seed; app.renderer.setRenderTarget(target); quad.render(app.renderer); quad.material = previous;
      bloom.render(app.renderer, null, target, 0, false);
      const raw = new Uint16Array(size * size * 4); app.renderer.readRenderTargetPixels(target, 0, 0, size, size, raw);
      let bad = 0; for (let i = 0; i < raw.length; i += 4) if ((raw[i] & 0x7c00) === 0x7c00) bad += 1;
      target.dispose(); app.renderer.setRenderTarget(null);
      return bad;
    };
    const stock = new guarded.constructor(guarded.resolution.clone(), guarded.strength, guarded.radius, guarded.threshold);
    const result = { stock: spread(stock), guarded: spread(guarded) };
    stock.dispose(); seed.dispose();
    // Back to the game's own sizes for every pass.
    app.resize();
    return result;
  });
  if (bloomCheck) assert.ok(bloomCheck.stock > 100 && bloomCheck.guarded <= 1, `a stock bloom spreads one invalid pixel, the game's guarded bloom does not: ${JSON.stringify(bloomCheck)}`);
  // The cab view: V puts the camera at the driver's eyes in the five-ton's cab, on its left (left-hand drive), with the truck's
  // body hidden and the cab's wheel turning with the steering; V again goes back behind the truck.
  const cabView = async () => page.evaluate(async () => {
    const app = window.fixtureApp, view = app.drivingView, truck = view.truck;
    await new Promise(resolve => setTimeout(resolve, 250));
    const local = truck.worldToLocal(view.camera.position.clone()), facing = view.camera.getWorldDirection(view.camera.position.clone());
    return { view: view.view, local: local.toArray().map(v => +v.toFixed(2)), along: facing.x * app.driving.pose.tx + facing.z * app.driving.pose.tz,
      cab: truck.getObjectByName('truck-cab').visible, body: truck.getObjectByName('driving-model-truck')?.visible ?? null,
      wheel: truck.getObjectByName('cab-steering-wheel').rotation.z };
  });
  await page.keyboard.press('KeyV');
  const inCab = await cabView();
  assert.ok(inCab.view === 'cab' && inCab.cab && inCab.body === false, `V shows the cab and hides the truck's body: ${JSON.stringify(inCab)}`);
  assert.ok(inCab.local[0] > 1.4 && inCab.local[0] < 2.1 && inCab.local[1] > 1.3 && inCab.local[1] < 1.8 && inCab.local[2] < -0.2 && inCab.local[2] > -0.7, `the camera is at the driver's eyes, on the left: ${JSON.stringify(inCab)}`);
  assert.ok(inCab.along > 0.9, `looking down the road ahead: ${JSON.stringify(inCab)}`);
  await page.keyboard.down('KeyA');
  const turning = await cabView();
  await page.keyboard.up('KeyA');
  assert.ok(turning.wheel > 0.5, `the cab's wheel turns left with the steering: ${JSON.stringify(turning)}`);
  await page.keyboard.press('KeyV');
  const behind = await cabView();
  assert.ok(behind.view === 'chase' && !behind.cab && behind.body !== false, `V again goes back behind the truck: ${JSON.stringify(behind)}`);
  await page.evaluate(pose => Object.assign(window.fixtureApp.driving, pose), beforeTurns);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(220); await page.keyboard.up('KeyD');
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'driving-road.png') });
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  await page.waitForFunction(() => window.fixtureApp.driving.speed === 0, null, { polling: 10 });
  await page.keyboard.up('KeyS');
  assert.equal(await page.evaluate(() => window.fixtureApp.driving.parked), false, 'mid-road braking never finishes');

  // Put a single synthetic cone in the real truck's path; keep every mall bundle pristine. The drive so far
  // may already have clipped a kerb or a car on a slow runner, so count the cone's bump from where the tally stands.
  const bumpsBefore = await page.evaluate(() => {
    const d = window.fixtureApp.driving;
    Object.assign(d.obstacles[0], { x: d.x + d.pose.tx * 5, z: d.z + d.pose.tz * 5, hit: false });
    return d.collisions;
  });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(n => window.fixtureApp.driving.collisions > n, bumpsBefore, { polling: 10 });
  await page.keyboard.up('KeyW');
  // Every bump and every red light costs 100 points; the earlier checks' turns can cross a red light as well as clip a kerb.
  const bumped = await page.evaluate(() => { const app = window.fixtureApp; return { collisions: app.driving.collisions, bumps: app.drivingCollisions, redLights: app.drivingRedLights, penalty: app.drivingPenalty }; });
  assert.ok(bumped.collisions >= 1 && bumped.bumps === bumped.collisions && bumped.penalty === (bumped.bumps + bumped.redLights) * 100, `every bump and red light costs 100 points: ${JSON.stringify(bumped)}`);
  assert.match(await page.locator('.b3d-chapterhud').innerText(), /900|SAFE/);
  assert.match(await page.locator('.b3d-chapterhud').innerText(), /TIME[^]*PAR 1:00/, 'a delivery drive shows its clock against par');
  const beforePause = await page.evaluate(() => ({ elapsed: window.fixtureApp.driving.elapsed, distance: window.fixtureApp.driving.distance }));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.fixtureApp.state === 'paused', null, { polling: 10 });
  const frozen = await page.evaluate(() => JSON.stringify(window.fixtureApp.driving));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(300); await page.keyboard.up('KeyW');
  assert.equal(await page.evaluate(() => JSON.stringify(window.fixtureApp.driving)), frozen);
  await page.keyboard.press('Enter');
  assert.ok(await page.evaluate(t => window.fixtureApp.driving.elapsed - t < 0.2, beforePause.elapsed));
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyM');
  await driveToBay(page);
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'driving-mall-bay.png') });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.fixtureApp.cutscene?.scene.id === 'mall-intro', null, { polling: 10 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureApp.state === 'mall', null, { polling: 10 });
  assert.deepEqual(await page.evaluate(() => ({ bundles: window.fixtureApp.mall.truckBundles.length, delivered: window.fixtureApp.mall.delivered, signed: window.fixtureApp.mall.signatures })),
    { bundles: 8, delivered: 0, signed: 0 });
  assert.ok(await page.evaluate(() => window.fixtureApp.drivingPenalty >= 100 && window.fixtureApp.drivingPenalty === window.fixtureApp.driving.penalty));
  assert.ok(await page.evaluate(() => window.fixtureApp.driving.z < -291), 'the mall truck parks in the loading yard beyond the public road');
  console.log('PASS keyboard gas/steer/brake, loading-yard parking, collision/slowdown, 100-point deductions, paused inputs and intact mall cargo');

  // The full story suite delivers and signs all six bundles; this isolates the return road.
  await page.evaluate(() => window.fixtureApp.beginDriving('ups'));
  await driveJourney(page, 'ups');
  assert.equal(await page.evaluate(() => window.fixtureApp.lot.done), false, 'the drive still requires returning the keys');
  const roadBefore = await page.evaluate(() => window.fixtureApp.drivingView.scene.children.length);
  const deductions = await page.evaluate(() => ({ bumps: window.fixtureApp.drivingCollisions, red: window.fixtureApp.drivingRedLights, penalty: window.fixtureApp.drivingPenalty }));
  assert.equal(deductions.penalty, (deductions.bumps + deductions.red) * 100, 'each traffic incident charges exactly once');
  assert.ok(await page.evaluate(() => window.fixtureApp.driving.z > 91), 'UPS parking is inside its own loading yard');
  await page.evaluate(() => window.fixtureApp.showResults());
  const results = await page.locator('.b3d-panel').innerText();
  assert.ok(results.includes(`DRIVING · ${deductions.bumps} bumps`));
  assert.ok(results.includes(`−${deductions.penalty} points · cargo safe`));
  // Whatever tonight's goals paid is part of the night total too.
  // Whatever the drives earned against par is part of the night total too, and the results give their times.
  const { goalBonus, driveBonus, driveTimes } = await page.evaluate(() => ({ goalBonus: window.fixtureApp.goalBonus, driveBonus: window.fixtureApp.driveBonus, driveTimes: window.fixtureApp.driveTimes }));
  assert.ok(driveTimes.length >= 1 && [0, 100, 200, 300, 400].includes(driveBonus), `the delivery drives are timed against par: ${JSON.stringify({ driveTimes, driveBonus })}`);
  assert.ok(results.includes(`NIGHT TOTAL ${String(Math.max(0, 1000 - deductions.penalty + goalBonus + driveBonus)).padStart(5, '0')}`), results);
  assert.equal(await page.evaluate(() => window.fixtureApp.model.score), 1000, 'driving leaves warehouse scoring and grade inputs intact');
  await page.evaluate(() => window.fixtureApp.restart());
  assert.deepEqual(await page.evaluate(() => ({ state: window.fixtureApp.state, drive: window.fixtureApp.driving, penalty: window.fixtureApp.drivingPenalty, bumps: window.fixtureApp.drivingCollisions, gas: window.fixtureApp.touch.pedals.throttle })),
    { state: 'briefing', drive: null, penalty: 0, bumps: 0, gas: 0 });
  await page.evaluate(() => window.fixtureApp.beginDriving('mall'));
  assert.equal(await page.evaluate(() => window.fixtureApp.drivingView.scene.children.length), roadBefore, 'replay reuses traffic without leaking road props');
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
  assert.equal(await page.evaluate(() => window.fixtureApp.state), 'paused', 'focus loss pauses the road');
  await page.close();

  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  touch.on('pageerror', e => errors.push(e.message));
  await touch.addInitScript(observeAppAndMusic);
  await touch.goto(server.resolvedUrls.local[0]);
  await touch.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 90_000 });
  await touch.getByRole('button', { name: 'START THE NIGHT', exact: false }).tap();
  await touch.waitForFunction(() => window.fixtureMusicStarts > 0 && window.fixtureApp.story.chapter === 'arrival', null, { polling: 10 });
  await touch.evaluate(() => window.fixtureApp.beginDriving('mall'));
  await touch.getByRole('button', { name: 'Accelerate truck', exact: true }).waitFor();
  const navBox = await touch.locator('.b3d-drive-nav').boundingBox(), toastBox = await touch.locator('.b3d-toast').boundingBox();
  assert.ok(toastBox.y >= navBox.y + navBox.height + 6, 'the portrait opening hint stays below the navigation arrow and label');
  // On a touch screen VIEW switches to the cab and back while driving.
  const viewButton = touch.locator('[data-touch="view"]');
  assert.ok(await viewButton.isVisible(), 'the VIEW button shows while driving');
  await viewButton.tap();
  assert.equal(await touch.evaluate(() => window.fixtureApp.drivingView.view), 'cab', 'VIEW puts the camera in the cab');
  await viewButton.tap();
  assert.equal(await touch.evaluate(() => window.fixtureApp.drivingView.view), 'chase', 'and VIEW again goes back behind the truck');
  const cdp = await touch.context().newCDPSession(touch);
  const box = await touch.getByRole('button', { name: 'Accelerate truck', exact: true }).boundingBox();
  const gasPoint = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gasPoint] });
  await touch.waitForFunction(() => window.fixtureApp.driving.speed > 8, null, { polling: 10 });
  const stick = await touch.getByLabel('Steer truck', { exact: true }).boundingBox();
  const steerPoint = { x: stick.x + 15, y: stick.y + stick.height / 2, id: 2 };
  const startHeading = await touch.evaluate(() => window.fixtureApp.driving.heading);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gasPoint, steerPoint] });
  // Steer until the truck has turned left by a tenth of a radian: a quarter second of wall time was enough on
  // a GPU but not on CI's software renderer, where the same time covers fewer simulated frames. The turn is
  // measured from where it started, wrapped, so a truck that swings past due west still counts.
  await touch.waitForFunction((h0) => {
    const d = window.fixtureApp.driving.heading - h0;
    return Math.atan2(Math.sin(d), Math.cos(d)) > 0.1;
  }, startHeading, { polling: 10, timeout: 30_000 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [steerPoint] });
  assert.equal(await touch.evaluate(() => window.fixtureApp.touch.pedals.throttle), 1, 'releasing steering keeps the held gas pedal');
  const brake = await touch.getByRole('button', { name: 'Brake truck', exact: true }).boundingBox();
  const brakePoint = { x: brake.x + brake.width / 2, y: brake.y + brake.height / 2, id: 3 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gasPoint, brakePoint] });
  await touch.waitForFunction(() => window.fixtureApp.driving.speed < 1, null, { polling: 10 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [brakePoint] });
  assert.equal(await touch.evaluate(() => window.fixtureApp.touch.pedals.throttle), 1, 'the brake can release while gas stays held');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchDriveToBay(touch, cdp);
  if (process.env.BELT_SCREENSHOT_DIR) await touch.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'driving-touch-portrait.png') });
  await touch.getByRole('button', { name: 'Park truck', exact: true }).tap();
  await touch.waitForFunction(() => window.fixtureApp.cutscene?.scene.id === 'mall-intro', null, { polling: 10 });
  await touch.setViewportSize({ width: 844, height: 390 });
  await touch.evaluate(() => window.fixtureApp.beginDriving('ups'));
  await touch.locator('.b3d-drive-nav').waitFor({ state: 'visible' });
  const landscapeNav = await touch.locator('.b3d-drive-nav').boundingBox(), landscapeHud = await touch.locator('.b3d-chapterhud').boundingBox();
  assert.ok(landscapeNav.y + landscapeNav.height <= landscapeHud.y, 'landscape guidance stays above the driving stats');
  if (process.env.BELT_SCREENSHOT_DIR) await touch.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'driving-touch-landscape.png') });
  await touch.close();

  // Open the real public practice link: no sorting, mall cargo or key-return fixture.
  const practice = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  practice.on('pageerror', e => errors.push(e.message));
  await practice.addInitScript(observeAppAndMusic);
  await practice.goto(`${server.resolvedUrls.local[0]}?mode=3d&drive=mall`);
  await practice.getByRole('button', { name: 'START DRIVE', exact: false }).click();
  await practice.waitForFunction(() => window.fixtureApp?.state === 'driving', null, { timeout: 90_000 });
  const via = [SPAWNS.mall, { x: -60, z: 80 }, { x: -120, z: 80 }, { x: -120, z: -100 }, { x: 0, z: -100 }, { x: 0, z: -280 }, { x: 180, z: -280 }, DESTINATIONS.mall];
  const used = await driveToBay(practice, via);
  assert.ok(used.has('ArrowLeft') && used.has('ArrowRight'), 'a real alternative route turns both ways');
  const explored = await practice.evaluate(() => ({ distance: window.fixtureApp.driving.distance, elapsed: window.fixtureApp.driving.elapsed }));
  assert.ok(explored.distance > 700 && explored.elapsed > 45, `exploration has no forced time limit or road rail: ${JSON.stringify(explored)}`);
  assert.ok(await practice.evaluate(() => {
    const { driving: m, drivingView: v } = window.fixtureApp;
    const target = v.navigation.root.userData.target, direction = v.camera.getWorldDirection(v.look.clone());
    const cameraHeading = Math.atan2(-direction.z, direction.x), targetHeading = Math.atan2(-(target.z - m.z), target.x - m.x);
    const expected = Math.atan2(Math.sin(cameraHeading - targetHeading), Math.cos(cameraHeading - targetHeading));
    return Math.abs(expected + v.navigation.pointer.rotation.y) < 0.02 && Math.hypot(target.x - m.goal.x, target.z - m.goal.z) < 0.01;
  }), 'the 3D arrow accounts for camera lag and points accurately at the final bay');
  await practice.keyboard.press('Space');
  await practice.getByRole('heading', { name: 'TRUCK PARKED. NICE.', exact: true }).waitFor();
  assert.deepEqual(await practice.evaluate(() => ({ time: window.fixtureApp.model.elapsedMs, mall: window.fixtureApp.mall, lot: window.fixtureApp.lot })), { time: 0, mall: null, lot: null });
  // The first drive to each yard is kept as its ghost.
  assert.match(await practice.locator('.b3d-panel').innerText(), /GHOST SAVED/);
  await practice.getByRole('button', { name: 'DRIVE BACK', exact: false }).click();
  assert.equal(await practice.evaluate(() => window.fixtureApp.driving.destination), 'ups');
  await driveToBay(practice);
  await practice.keyboard.press('Space');
  await practice.getByRole('heading', { name: 'TRUCK PARKED. NICE.', exact: true }).waitFor();
  await practice.keyboard.press('Enter');
  assert.deepEqual(await practice.evaluate(() => ({ destination: window.fixtureApp.driving.destination, bumps: window.fixtureApp.driving.collisions, penalty: window.fixtureApp.driving.penalty })), { destination: 'mall', bumps: 0, penalty: 0 });
  // The replay races the first drive to the mall: its see-through five-ton starts beside the truck and its time is on the HUD.
  await practice.waitForFunction(() => window.fixtureApp.drivingView.scene.getObjectByName('ghost-truck')?.visible === true, null, { polling: 10 });
  assert.ok(await practice.evaluate(() => window.fixtureApp.ghost?.seconds > 45));
  assert.match(await practice.locator('.b3d-chapterhud').innerText(), /GHOST \d+:\d\d/);
  assert.deepEqual(errors, []);
  console.log('PASS real multitouch gas/steering/brake, portrait parking, both journeys, driving-only round trip, key-return gate, focus pause and clean replay');
} finally { await browser.close(); await server.httpServer.close(); }
