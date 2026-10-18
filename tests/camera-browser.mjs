import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

import { holdBreak, skipOpening } from './night-helpers.mjs';

// Real keyboard/touch travel verifies framing and screen-space hit targets.
// The late joke alone uses an isolated clock fixture; it is not organic play.
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BELT_BROWSER_RENDERER === 'canvas' ? { args: ['--disable-webgl'] } : {}),
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  });
  const createPage = async options => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '' }));
    await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ body: '' }));
    await page.addInitScript(() => {
      let phaser;
      Object.defineProperty(window, 'Phaser', { configurable: true, get: () => phaser, set: value => {
        phaser = value;
        const boot = value.Game.prototype.boot;
        value.Game.prototype.boot = function (...args) { window.fixtureGame = this; return boot.apply(this, args); };
      } });
    });
    await page.goto(`${server.resolvedUrls.local[0]}?mode=2d`);
    await page.waitForFunction(() => window.fixtureGame?.scene.isActive('DepotScene'));
    return { context, page, errors };
  };
  const measure = page => page.evaluate(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    const world = s.view.world, hud = s.view.hud;
    const top = world.getWorldPoint(0, 126), bottom = world.getWorldPoint(960, 620);
    const textRasterErrors = [];
    const inspectText = object => {
      if (object.type === 'Text' && object.style.resolution !== object.frame.source.resolution) {
        textRasterErrors.push({ text: object.text, style: object.style.resolution, texture: object.frame.source.resolution });
      }
      if (object.list) object.list.forEach(inspectText);
    };
    s.children.list.forEach(inspectText);
    return {
      state: s.state, overview: s.view.overview,
      zoom: world.zoom, scrollX: world.scrollX, scrollY: world.scrollY,
      worldViewport: { x: world.x, y: world.y, width: world.width, height: world.height },
      worldEdges: { left: top.x, top: top.y, right: bottom.x, bottom: bottom.y },
      hud: { zoom: hud.zoom, scrollX: hud.scrollX, scrollY: hud.scrollY, x: hud.x, y: hud.y, width: hud.width, height: hud.height },
      labels: [s.scoreText, s.clockText, s.countText, s.operatorText, s.actionText, s.pauseText, s.soundText, s.viewText].map(item => ({
        x: item.x, y: item.y, worldHidden: Boolean(item.cameraFilter & world.id), hudHidden: Boolean(item.cameraFilter & hud.id),
      })),
      worker: { ...s.model.activeWorker },
      workerHudHidden: Boolean(s.workers[s.model.activeIndex].container.cameraFilter & hud.id),
      incident: s.life.benInterludeTime, travel: s.model.beltTravel, elapsed: s.model.elapsedMs,
      textRasterErrors,
    };
  });
  const assertHud = data => {
    assert.deepEqual(data.hud, { zoom: 1, scrollX: 0, scrollY: 0, x: 0, y: 0, width: 960, height: 720 });
    assert.ok(data.labels.every(item => item.worldHidden && !item.hudHidden), 'console labels must render only through the stationary HUD camera');
    assert.equal(data.workerHudHidden, true, 'the HUD must not draw a duplicate unzoomed worker');
    assert.deepEqual(data.textRasterErrors, [], 'text bitmap density must agree with the texture source so Canvas does not draw oversized overlapping text');
  };
  const waitForFit = page => page.waitForFunction(() => {
    const canvas = document.querySelector('#app canvas').getBoundingClientRect();
    const app = document.querySelector('#app').getBoundingClientRect();
    const measured = window.fixtureGame.scale.canvasBounds;
    return Math.abs(canvas.width - Math.min(app.width, app.height * 4 / 3)) < 1
      && Math.abs(canvas.x - measured.x) < 1 && Math.abs(canvas.y - measured.y) < 1
      && Math.abs(canvas.width - measured.width) < 1;
  });
  const canvasPoint = async (page, x, y) => {
    await waitForFit(page);
    const bounds = await page.locator('#app canvas').boundingBox();
    return { x: bounds.x + x * bounds.width / 960, y: bounds.y + y * bounds.height / 720 };
  };
  const controlPoint = async (page, name) => {
    const position = await page.evaluate(name => {
      const bounds = window.fixtureGame.scene.getScene('DepotScene')[name].getBounds();
      return { x: bounds.centerX, y: bounds.centerY };
    }, name);
    return canvasPoint(page, position.x, position.y);
  };
  const desktop = await createPage({ viewport: { width: 1200, height: 900 } });
  const { page } = desktop;
  const press = key => page.keyboard.press(key, { delay: 40 });
  await holdBreak(page);
  await press('Enter');
  await skipOpening(page);
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').view.world.zoom > 1.4);
  const start = await measure(page);
  assert.deepEqual(start.worldViewport, { x: 0, y: 126, width: 960, height: 494 });
  assertHud(start);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.y < -10);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(250);
  const up = await measure(page);
  assert.ok(up.worldEdges.top < -175, 'walking up must reveal the semi unloading floor');
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-receiving.png') });
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.y > 680);
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(250);
  const down = await measure(page);
  assert.ok(down.scrollY > up.scrollY + 70, 'the closer camera must follow vertical travel');
  assert.deepEqual(down.labels, start.labels, 'camera movement must leave console positions and filters unchanged');
  assertHud(down);
  assert.ok(down.worker.y > down.worldEdges.top && down.worker.y < down.worldEdges.bottom, 'the followed worker must remain visible');
  assert.ok(down.worldEdges.bottom >= 713, 'the camera must reveal the extended bulk floor and recovery tray');
  await press('Tab');
  await page.waitForFunction(x => window.fixtureGame.scene.getScene('DepotScene').view.world.scrollX > x + 100, down.scrollX);
  const switched = await measure(page);
  assert.equal(switched.worker.id, 'skanky');
  assertHud(switched);
  await press('KeyV');
  await page.waitForFunction(() => Math.abs(window.fixtureGame.scene.getScene('DepotScene').view.world.zoom - 494 / 954) < 0.02);
  assert.equal((await measure(page)).overview, true);
  await page.waitForFunction(() => {
    const camera = window.fixtureGame.scene.getScene('DepotScene').view.world;
    return camera.getWorldPoint(0, 126).y <= -239 && camera.getWorldPoint(960, 620).y >= 713;
  });
  const overview = await measure(page);
  assert.ok(overview.worldEdges.top <= -239 && overview.worldEdges.bottom >= 713, `overview must include receiving, every truck row, bulk and the extended recovery tray: ${JSON.stringify(overview.worldEdges)}`);
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-layout-overview.png') });
  await press('KeyV');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').view.world.zoom > 1.4);
  const pause = await controlPoint(page, 'pauseText');
  await page.mouse.click(pause.x, pause.y);
  assert.equal((await measure(page)).state, 'paused', 'the visible HUD pause button must remain clickable after panning and zooming');
  const resume = await canvasPoint(page, 480, 495);
  await page.mouse.click(resume.x, resume.y);
  assert.equal((await measure(page)).state, 'playing', 'the overlay must use stationary screen coordinates');
  const soundBefore = await page.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').muted);
  const sound = await controlPoint(page, 'soundText');
  await page.mouse.click(sound.x, sound.y);
  assert.notEqual(await page.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').muted), soundBefore);

  // Isolated late-event clock setup; production update must enter its real
  // interlude, pause the model, and frame the original joke automatically.
  await page.evaluate(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    for (const parcel of s.model.packages) parcel.state = 'delivered';
    for (const worker of s.model.workers) worker.heldId = null;
    s.model.elapsedMs = 67_900;
  });
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'interlude');
  await page.waitForFunction(() => {
    const camera = window.fixtureGame.scene.getScene('DepotScene').view.world;
    return camera.zoom > 2.44 && Math.abs(camera.getWorldPoint(480, 373).x - 248) < 2;
  });
  const eventView = await measure(page);
  assert.ok(eventView.worldEdges.left < 110 && eventView.worldEdges.right > 330,
    'event framing must include the gate, Ben and gunman together');
  assert.ok(eventView.worldEdges.top < 270 && eventView.worldEdges.bottom > 410,
    'the pointed gate and dragging body must both fit vertically');
  assertHud(eventView);
  await page.evaluate(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    window.fixtureGame.loop.sleep();
    while (s.life.benInterludeTime < 83_300) s.update(s.time.now, Math.min(100, 83_300 - s.life.benInterludeTime));
    window.fixtureGame.loop.wake();
  });
  await page.waitForTimeout(80);
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-camera-demon-fixture.png') });
  const exitCamera = await page.evaluate(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    window.fixtureGame.loop.sleep();
    while (s.state === 'interlude') s.update(s.time.now, 100);
    const before = { zoom: s.view.world.zoom, x: s.view.world.scrollX };
    s.update(s.time.now, 16);
    const after = { zoom: s.view.world.zoom, x: s.view.world.scrollX };
    window.fixtureGame.loop.wake();
    return { before, after };
  });
  assert.ok(exitCamera.after.zoom > 1.5 && Math.abs(exitCamera.after.zoom - exitCamera.before.zoom) < 0.2,
    'return to the worker must ease smoothly rather than snap to overview');
  await page.waitForFunction(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    return s.state === 'playing' && Math.abs(s.view.world.zoom - 1.45) < 0.02
      && s.view.world.getWorldPoint(480, 373).x > 580;
  });
  assertHud(await measure(page));
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const mobile = await createPage({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
  const touch = mobile.page;
  const startPoint = await canvasPoint(touch, 480, 495);
  await holdBreak(touch);
  await touch.touchscreen.tap(startPoint.x, startPoint.y);
  await skipOpening(touch, { touch: true });
  await touch.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').view.world.zoom > 1.4);
  const stick = await touch.locator('.depot-stick').boundingBox();
  const session = await mobile.context.newCDPSession(touch);
  const touchBefore = await measure(touch);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 - 28 }] });
  await touch.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.y < 350);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.waitForTimeout(200);
  assert.ok((await measure(touch)).scrollY < touchBefore.scrollY - 20, 'touch movement must drive the same camera follow');
  await touch.getByRole('button', { name: 'SWITCH', exact: true }).tap();
  await touch.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').view.world.getWorldPoint(480, 373).x > 580);
  assert.equal((await measure(touch)).worker.id, 'skanky');
  const overviewTouch = await controlPoint(touch, 'viewText');
  await touch.touchscreen.tap(overviewTouch.x, overviewTouch.y);
  await touch.waitForFunction(() => Math.abs(window.fixtureGame.scene.getScene('DepotScene').view.world.zoom - 494 / 954) < 0.02);
  assert.equal((await measure(touch)).overview, true, 'the overview control must also work without a keyboard');
  const closerTouch = await controlPoint(touch, 'viewText');
  await touch.touchscreen.tap(closerTouch.x, closerTouch.y);
  await touch.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').view.world.zoom > 1.4);
  const touchPause = await controlPoint(touch, 'pauseText');
  await touch.touchscreen.tap(touchPause.x, touchPause.y);
  assert.equal((await measure(touch)).state, 'paused');
  // Parent resize must repair input bounds even with the renderer asleep.
  await touch.evaluate(() => window.fixtureGame.loop.sleep());
  await touch.setViewportSize({ width: 932, height: 430 });
  await waitForFit(touch);
  await touch.evaluate(() => window.fixtureGame.loop.wake());
  const landscapeResume = await canvasPoint(touch, 480, 495);
  await touch.touchscreen.tap(landscapeResume.x, landscapeResume.y);
  assert.equal((await measure(touch)).state, 'playing', 'resized touch coordinates must reach the HUD overlay, independent of camera scroll');
  assertHud(await measure(touch));
  await touch.getByRole('button', { name: 'SWITCH', exact: true }).tap();
  assert.equal((await measure(touch)).worker.id, 'termite');
  await touch.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').view.world.getWorldPoint(480, 373).x < 360);
  if (process.env.BELT_SCREENSHOT_DIR) await touch.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-camera-mobile.png') });
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();
  console.log('PASS closer camera follows keyboard/touch movement and worker switching, HUD filters and clicks, overview, full demon framing, smooth return and resized touch mapping; no script errors');
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
