import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

// Isolated timing and camera-position fixtures inspect the actual receiving
// render and Scene.update handoff. Organic keyboard travel is in camera-browser.
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BELT_BROWSER_RENDERER === 'canvas' ? { args: ['--disable-webgl'] } : {}),
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
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
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'playing');
  await page.keyboard.press('KeyM');
  await page.evaluate(() => window.fixtureGame.loop.sleep());
  await page.evaluate(() => {
    // Reset just the moving intake clock after the real opening. This gives
    // exact 10 ms handoff steps independent of the browser's first frame time.
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    scene.model.elapsedMs = 0;
    scene.model.spawnElapsedMs = 0;
    scene.model.beltTravel = 0;
    scene.receiving.update();
    scene.syncWorld(0);
  });
  const advance = delta => page.evaluate(delta => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    scene.update(scene.time.now, delta);
  }, delta);
  const capture = async name => {
    if (!process.env.BELT_SCREENSHOT_DIR) return;
    const wasPaused = await page.evaluate(() => {
      const scene = window.fixtureGame.scene.getScene('DepotScene');
      const paused = scene.model.paused;
      scene.model.paused = true;
      scene.toastUntil = 0;
      scene.toast.setVisible(false);
      window.fixtureGame.loop.wake();
      return paused;
    });
    await page.waitForTimeout(100);
    await page.evaluate(paused => {
      window.fixtureGame.loop.sleep();
      window.fixtureGame.scene.getScene('DepotScene').model.paused = paused;
    }, wasPaused);
    await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, name) });
  };
  const focus = (workerIndex, y) => page.evaluate(({ workerIndex, y }) => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    scene.model.activeIndex = workerIndex;
    scene.model.activeWorker.y = y;
    scene.syncWorld(0);
    for (let frame = 0; frame < 30; frame++) scene.view.update(100, scene.model.activeWorker, 'follow');
  }, { workerIndex, y });

  console.log(`Receiving renderer: ${await page.evaluate(() => window.fixtureGame.renderer.type === 2 ? 'WebGL' : 'Canvas')}`);
  await focus(0, -20);
  const camera = await page.evaluate(() => {
    const view = window.fixtureGame.scene.getScene('DepotScene').view.world;
    return { zoom: view.zoom, centerX: view.midPoint.x };
  });
  assert.ok(Math.abs(camera.zoom - 1.08) < 0.001, 'receiving framing fits both incoming semis and the final handoff');
  assert.ok(Math.abs(camera.centerX - 480) < 0.1);

  const snapshot = () => page.evaluate(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    const r = scene.receiving;
    return {
      elapsed: scene.model.elapsedMs, travel: scene.model.beltTravel,
      preview: scene.model.intakePreview,
      previewId: r.previewId, visible: r.previewArt?.visible ?? false,
      art: r.previewArt ? { x: r.previewArt.x, y: r.previewArt.y } : null,
      phase: r.machineryPhase,
      hand: r.handContact,
      dockhand: { x: r.dockhand.x, y: r.dockhand.y, pushing: r.dockhand.getData('pushingParcelId') },
      workers: r.unloaders.map(worker => ({ x: worker.x, y: worker.y, rotation: worker.rotation })),
      staging: r.stagingCrates.map(crate => ({ x: crate.x, y: crate.y, visible: crate.visible })),
    };
  });
  assert.equal(await page.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').receiving.semiTrucks.length), 2);
  let before;
  for (let step = 0; step < 70; step++) {
    await advance(100);
    before = await snapshot();
    if (before.preview) break;
  }
  assert.ok(before.preview, 'the next real parcel appears in receiving before its scheduled arrival');
  assert.equal(before.previewId, before.preview.id);
  assert.equal(before.visible, true);
  assert.deepEqual(before.art, { x: before.preview.x, y: before.preview.y });
  assert.equal(before.preview.kind, 'goji');
  assert.deepEqual(before.hand, { x: before.preview.x - 17, y: before.preview.y });
  assert.deepEqual(before.dockhand, { x: 430, y: before.preview.y + 12, pushing: before.preview.id });
  for (const [index, crate] of before.staging.entries()) {
    if (crate.visible) assert.ok(crate.y >= before.workers[index].y,
      'unloaders carry cartons at hand/chest height so their faces remain visible');
  }
  assert.equal(await page.evaluate(id => window.fixtureGame.scene.getScene('DepotScene').parcels.has(id), before.preview.id), false,
    'the intake preview must not duplicate an existing belt parcel');

  // Production pause, brake and event stop must stop the whole feed mechanism,
  // including the dockhand's final contact and anonymous staging freight.
  await page.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').togglePause());
  await advance(100);
  assert.deepEqual(await snapshot(), before);
  await page.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').togglePause());
  await page.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').model.brake());
  const brake = await snapshot();
  await advance(100);
  const braked = await snapshot();
  assert.deepEqual({ ...braked, elapsed: 0 }, { ...brake, elapsed: 0 });
  for (let step = 0; step < 19; step++) await advance(100);
  await page.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').model.eventStopped = true);
  const stopped = await snapshot();
  await advance(100);
  assert.deepEqual({ ...await snapshot(), elapsed: 0 }, { ...stopped, elapsed: 0 });
  await page.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').model.eventStopped = false);

  // Approach the handoff in 10 ms presentation steps. This checks the actual
  // model-to-scene transition rather than assigning a new parcel to the belt.
  for (let step = 0; step < 100; step++) {
    const current = await snapshot();
    if (current.preview?.progress >= 0.8) break;
    await advance(10);
  }
  before = await snapshot();
  assert.equal(before.preview.id, braked.preview.id);
  await focus(0, 0);
  await capture('after-receiving-handoff.png');
  const identity = before.preview;
  let finalTransfer = before;
  for (let step = 0; step < 100; step++) {
    const current = await snapshot();
    if (!current.preview) break;
    finalTransfer = current;
    await advance(10);
  }
  const handedOff = await page.evaluate(id => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    const parcel = scene.model.packages.find(parcel => parcel.id === id);
    const view = scene.parcels.get(id);
    return { parcel, art: view && { x: view.container.x, y: view.container.y, visible: view.container.visible },
      count: scene.model.packages.filter(parcel => parcel.id === id).length,
      intakeVisible: scene.receiving.previewArt?.visible ?? false };
  }, identity.id);
  assert.equal(handedOff.count, 1);
  for (const key of ['id', 'route', 'kind', 'label', 'size']) assert.equal(handedOff.parcel[key], identity[key], key);
  assert.deepEqual([handedOff.parcel.x, handedOff.parcel.y, handedOff.parcel.state], [480, 172, 'belt']);
  assert.ok(handedOff.parcel.y - finalTransfer.art.y <= 0.501,
    'the rendered parcel moves at most one transfer step across the intake/belt seam');
  assert.deepEqual(handedOff.art, { x: 480, y: 172, visible: true });
  assert.equal(handedOff.intakeVisible, false, 'the receiving copy disappears on the same frame the belt copy appears');

  // The story uses a separate clock: freeze the receiving machinery through
  // Ben's complete event, then verify it resumes without a catch-up jump.
  await page.evaluate(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    scene.model.elapsedMs = 68_000;
  });
  const preBen = await snapshot();
  await advance(100);
  assert.equal(await page.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').state), 'interlude');
  for (let step = 0; step < 300; step++) {
    if (await page.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').state === 'playing')) break;
    await advance(100);
  }
  assert.deepEqual(await snapshot(), preBen);
  assert.equal(await page.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').state), 'playing');
  await advance(10);
  assert.ok((await snapshot()).travel > preBen.travel);

  await focus(1, 390);
  const brian = await page.evaluate(() => {
    const art = window.fixtureGame.scene.getScene('DepotScene').life.cast.get('brian').art;
    const fumes = art.list.find(child => child.getData('BrianSmell') === true);
    return { visible: art.visible, specification: art.getData('BrianSmell'),
      hasTallRenderedGeometry: fumes?.commandBuffer.some(value => value < -110),
      commandCount: fumes?.commandBuffer.length };
  });
  assert.equal(brian.visible, true);
  assert.deepEqual(brian.specification, { width: 76, height: 92, plumes: 5 });
  assert.equal(brian.hasTallRenderedGeometry, true, 'the actual drawn curves must extend far above his head');
  assert.ok(brian.commandCount > 300);
  await capture('after-brian-smell.png');

  // Restart destroys the previous scene's art and restores the opening parcel.
  await page.evaluate(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    window.oldReceiving = scene.receiving;
    scene.scene.restart();
    window.fixtureGame.loop.wake();
  });
  await page.waitForFunction(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    return scene.state === 'briefing' && scene.receiving !== window.oldReceiving;
  });
  assert.deepEqual(await page.evaluate(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    return [scene.model.packages.length, scene.model.packages[0].id, scene.model.elapsedMs, scene.receiving.previewId];
  }), [1, 1, 0, null]);
  assert.equal(await page.evaluate(() => window.oldReceiving.semiTrucks.every(semi => !semi.scene)), true,
    'restart must destroy both previous semis');

  assert.deepEqual(errors, []);
  console.log('Receiving handoff, machinery stops, Ben freeze, Brian fumes and restart: PASS');
  await context.close();
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
