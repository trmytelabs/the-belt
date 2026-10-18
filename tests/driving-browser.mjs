import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { driveJourney } from './driving-helpers.mjs';

const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const browser = await chromium.launch({ headless: true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => window.addEventListener('belt3d:ready', e => { window.fixtureApp = e.detail; }));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 90_000 });
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
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.fixtureApp.state), 'driving', 'Enter cannot skip driving');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.fixtureApp.driving.speed > 10, null, { polling: 10 });
  await page.keyboard.down('KeyA'); await page.waitForTimeout(220); await page.keyboard.up('KeyA');
  assert.ok(await page.evaluate(() => window.fixtureApp.driving.offset < 2.4), 'A steers left');
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
    Object.assign(d.obstacles[0], { distance: d.distance + 5, offset: d.offset });
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
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.fixtureApp.driving.canPark, null, { polling: 10, timeout: 90_000 });
  await page.keyboard.up('KeyW');
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
  await page.evaluate(() => window.fixtureApp.showResults());
  const results = await page.locator('.b3d-panel').innerText();
  assert.match(results, /DRIVING · 1 bumps · −5 points · cargo safe/);
  assert.match(results, /NIGHT TOTAL 00995/);
  assert.equal(await page.evaluate(() => window.fixtureApp.model.score), 1000, 'driving leaves warehouse scoring and grade inputs intact');
  await page.evaluate(() => window.fixtureApp.restart());
  assert.deepEqual(await page.evaluate(() => ({ state: window.fixtureApp.state, drive: window.fixtureApp.driving, penalty: window.fixtureApp.drivingPenalty, bumps: window.fixtureApp.drivingCollisions, gas: window.fixtureApp.touch.pedals.throttle })),
    { state: 'briefing', drive: null, penalty: 0, bumps: 0, gas: 0 });
  await page.evaluate(() => window.fixtureApp.beginDriving('mall'));
  assert.equal(await page.evaluate(() => window.fixtureApp.drivingView.scene.children.length), roadBefore, 'replay reuses traffic without leaking road props');
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
  assert.equal(await page.evaluate(() => window.fixtureApp.state), 'paused', 'focus loss pauses the road');

  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  touch.on('pageerror', e => errors.push(e.message));
  await touch.addInitScript(() => window.addEventListener('belt3d:ready', e => { window.fixtureApp = e.detail; }));
  await touch.goto(server.resolvedUrls.local[0]);
  await touch.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 90_000 });
  await touch.evaluate(() => window.fixtureApp.beginDriving('mall'));
  await touch.getByRole('button', { name: 'Accelerate truck', exact: true }).waitFor();
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
  assert.ok(await touch.evaluate(() => window.fixtureApp.driving.offset < 2.4));
  const brake = await touch.getByRole('button', { name: 'Brake truck', exact: true }).boundingBox();
  const brakePoint = { x: brake.x + brake.width / 2, y: brake.y + brake.height / 2, id: 3 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gasPoint, brakePoint] });
  await touch.waitForFunction(() => window.fixtureApp.driving.speed < 1, null, { polling: 10 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [brakePoint] });
  assert.equal(await touch.evaluate(() => window.fixtureApp.touch.pedals.throttle), 1, 'the brake can release while gas stays held');
  await touch.waitForFunction(() => window.fixtureApp.driving.canPark, null, { polling: 10, timeout: 90_000 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  if (process.env.BELT_SCREENSHOT_DIR) await touch.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'driving-touch-portrait.png') });
  await touch.getByRole('button', { name: 'Park truck', exact: true }).tap();
  await touch.waitForFunction(() => window.fixtureApp.cutscene?.scene.id === 'mall-intro', null, { polling: 10 });
  assert.deepEqual(errors, []);
  console.log('PASS real multitouch held gas plus steering, release, portrait parking, both 20–30 second journeys, key-return gate, focus pause and clean replay');
} finally { await browser.close(); await server.httpServer.close(); }
