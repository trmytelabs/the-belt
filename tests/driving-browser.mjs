import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { driveJourney, driveToBay, touchDriveToBay } from './driving-helpers.mjs';

const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const browser = await chromium.launch({ headless: true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const observeAppAndMusic = () => {
  window.addEventListener('belt3d:ready', e => { window.fixtureApp = e.detail; });
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
  assert.ok(await page.evaluate(() => {
    const view = window.fixtureApp.drivingView, pointer = view.navigation.pointer;
    pointer.geometry.computeBoundingBox();
    return pointer.geometry.type === 'ExtrudeGeometry' && pointer.geometry.boundingBox.max.z - pointer.geometry.boundingBox.min.z > 0.35
      && view.scene.children.filter(c => c.name === 'city-building').length >= 50;
  }), 'the larger city has a solid three-dimensional navigation arrow');
  assert.match(await page.locator('.b3d-drive-nav').innerText(), /SOUTHGATE MALL/);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.fixtureApp.state), 'driving', 'Enter cannot skip driving');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.fixtureApp.driving.speed > 10, null, { polling: 10 });
  await page.keyboard.down('KeyA'); await page.waitForTimeout(220); await page.keyboard.up('KeyA');
  assert.ok(await page.evaluate(() => window.fixtureApp.driving.heading > Math.PI / 2 + 0.1), 'A changes actual world heading to the left');
  await page.keyboard.down('KeyD'); await page.waitForTimeout(220); await page.keyboard.up('KeyD');
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'driving-road.png') });
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  await page.waitForFunction(() => window.fixtureApp.driving.speed === 0, null, { polling: 10 });
  await page.keyboard.up('KeyS');
  assert.equal(await page.evaluate(() => window.fixtureApp.driving.parked), false, 'mid-road braking never finishes');

  // Put a single synthetic cone in the real truck's path; keep every mall bundle pristine.
  await page.evaluate(() => {
    const d = window.fixtureApp.driving;
    Object.assign(d.obstacles[0], { x: d.x + d.pose.tx * 5, z: d.z + d.pose.tz * 5 });
  });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.fixtureApp.driving.collisions === 1, null, { polling: 10 });
  await page.keyboard.up('KeyW');
  assert.equal(await page.evaluate(() => window.fixtureApp.drivingPenalty), 5);
  assert.match(await page.locator('.b3d-chapterhud').innerText(), /995|SAFE/);
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
  assert.deepEqual(await page.evaluate(() => ({ bundles: window.fixtureApp.mall.truckBundles.length, delivered: window.fixtureApp.mall.delivered, signed: window.fixtureApp.mall.signatures, penalty: window.fixtureApp.drivingPenalty })),
    { bundles: 6, delivered: 0, signed: 0, penalty: 5 });
  console.log('PASS keyboard gas/steer/brake, explicit parking, collision/slowdown, five-point deduction, paused inputs and intact mall cargo');

  // The full story suite delivers and signs all six bundles; this isolates the return road.
  await page.evaluate(() => window.fixtureApp.beginDriving('ups'));
  await driveJourney(page, 'ups');
  assert.equal(await page.evaluate(() => window.fixtureApp.lot.done), false, 'the drive still requires returning the keys');
  const roadBefore = await page.evaluate(() => window.fixtureApp.drivingView.scene.children.length);
  const deductions = await page.evaluate(() => ({ bumps: window.fixtureApp.drivingCollisions, red: window.fixtureApp.drivingRedLights, penalty: window.fixtureApp.drivingPenalty }));
  assert.equal(deductions.penalty, (deductions.bumps + deductions.red) * 5, 'each traffic incident charges exactly once');
  await page.evaluate(() => window.fixtureApp.showResults());
  const results = await page.locator('.b3d-panel').innerText();
  assert.ok(results.includes(`DRIVING · ${deductions.bumps} bumps`));
  assert.ok(results.includes(`−${deductions.penalty} points · cargo safe`));
  assert.ok(results.includes(`NIGHT TOTAL ${String(1000 - deductions.penalty).padStart(5, '0')}`));
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
  const cdp = await touch.context().newCDPSession(touch);
  const box = await touch.getByRole('button', { name: 'Accelerate truck', exact: true }).boundingBox();
  const gasPoint = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gasPoint] });
  await touch.waitForFunction(() => window.fixtureApp.driving.speed > 8, null, { polling: 10 });
  const stick = await touch.getByLabel('Steer truck', { exact: true }).boundingBox();
  const steerPoint = { x: stick.x + 15, y: stick.y + stick.height / 2, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gasPoint, steerPoint] });
  await touch.waitForTimeout(250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [steerPoint] });
  assert.equal(await touch.evaluate(() => window.fixtureApp.touch.pedals.throttle), 1, 'releasing steering keeps the held gas pedal');
  assert.ok(await touch.evaluate(() => window.fixtureApp.driving.heading > Math.PI / 2 + 0.1));
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
  const via = [{ x: 2.6, z: 20 }, { x: -60, z: 20 }, { x: -60, z: -100 }, { x: 60, z: -100 }, { x: 60, z: -220 }, { x: 122.6, z: -220 }];
  const used = await driveToBay(practice, via);
  assert.ok(used.has('ArrowLeft') && used.has('ArrowRight'), 'a real alternative route turns both ways');
  assert.ok(await practice.evaluate(() => window.fixtureApp.driving.distance > 450 && window.fixtureApp.driving.elapsed > 30), 'exploration has no forced time limit or road rail');
  assert.ok(await practice.evaluate(() => {
    const { driving: m, drivingView: v } = window.fixtureApp;
    const target = v.navigation.root.userData.target, direction = v.camera.getWorldDirection(v.look.clone());
    const cameraHeading = Math.atan2(-direction.z, direction.x), targetHeading = Math.atan2(-(target.z - m.z), target.x - m.x);
    const expected = Math.atan2(Math.sin(cameraHeading - targetHeading), Math.cos(cameraHeading - targetHeading));
    return Math.abs(expected + v.navigation.pointer.rotation.z) < 0.02 && Math.hypot(target.x - m.goal.x, target.z - m.goal.z) < 0.01;
  }), 'the 3D arrow accounts for camera lag and points accurately at the final bay');
  await practice.keyboard.press('Space');
  await practice.getByRole('heading', { name: 'TRUCK PARKED. NICE.', exact: true }).waitFor();
  assert.deepEqual(await practice.evaluate(() => ({ time: window.fixtureApp.model.elapsedMs, mall: window.fixtureApp.mall, lot: window.fixtureApp.lot })), { time: 0, mall: null, lot: null });
  await practice.getByRole('button', { name: 'DRIVE BACK', exact: false }).click();
  assert.equal(await practice.evaluate(() => window.fixtureApp.driving.destination), 'ups');
  await driveToBay(practice);
  await practice.keyboard.press('Space');
  await practice.getByRole('heading', { name: 'TRUCK PARKED. NICE.', exact: true }).waitFor();
  await practice.keyboard.press('Enter');
  assert.deepEqual(await practice.evaluate(() => ({ destination: window.fixtureApp.driving.destination, bumps: window.fixtureApp.driving.collisions, penalty: window.fixtureApp.driving.penalty })), { destination: 'mall', bumps: 0, penalty: 0 });
  assert.deepEqual(errors, []);
  console.log('PASS real multitouch gas/steering/brake, portrait parking, both journeys, driving-only round trip, key-return gate, focus pause and clean replay');
} finally { await browser.close(); await server.httpServer.close(); }
