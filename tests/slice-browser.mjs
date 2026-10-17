import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

// The Phaser observer exists only inside isolated browser contexts. Synthetic
// parcel arrangements exercise rules through the real keyboard bindings.
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BELT_BROWSER_RENDERER === 'canvas' ? { args: ['--disable-webgl'] } : {}),
    ...(process.env.BELT_BROWSER_EXECUTABLE
      ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE }
      : { channel: 'chromium' }),
  });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  if (process.env.BELT_BROWSER_CPU_RATE) {
    const diagnosticsSession = await context.newCDPSession(page);
    await diagnosticsSession.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.BELT_BROWSER_CPU_RATE) });
  }
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '' }));
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ body: '' }));
  await page.addInitScript(() => {
    let phaser;
    Object.defineProperty(window, 'Phaser', {
      configurable: true,
      get: () => phaser,
      set: value => {
        phaser = value;
        const boot = value.Game.prototype.boot;
        value.Game.prototype.boot = function (...args) {
          window.fixtureGame = this;
          return boot.apply(this, args);
        };
      },
    });
  });
  await page.goto(`${server.resolvedUrls.local[0]}?mode=2d`);
  await page.waitForFunction(() => window.fixtureGame?.scene.isActive('DepotScene'));
  const read = fn => page.evaluate(fn);
  const press = key => page.keyboard.press(key, { delay: 40 });
  console.log(`Slice renderer: ${await read(() => window.fixtureGame.renderer.type === 2 ? 'WebGL' : 'Canvas')}`);
  if (process.env.BELT_BROWSER_RENDERER === 'canvas') {
    assert.equal(await read(() => window.fixtureGame.renderer.type), 1);
  }
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').state), 'briefing');
  const residents = await read(() => [...window.fixtureGame.scene.getScene('DepotScene').life.cast.values()]
    .filter(colleague => colleague.art.visible)
    .map(colleague => ({ name: colleague.name, x: colleague.art.x })));
  assert.deepEqual(residents.map(colleague => colleague.name).sort(),
    ['HUSSAN', 'AJ', 'BEN', 'BANNERMAN', 'FRUIT LOOP', 'DORIS', 'BRIAN', 'DONNA'].sort(),
    'the original resident crew must be visible in the playable scene');
  assert.ok(residents.every(colleague => colleague.x < 240 || colleague.x > 720),
    'the crew must leave the two workers sorting lanes clear');
  assert.deepEqual(await read(() => window.fixtureGame.scene.getScene('DepotScene').life.history), [],
    'timed banter must wait for the shift to begin');
  const paintedZones = await read(() => window.fixtureGame.scene.getScene('DepotScene').children.list
    .map(object => object.getData('dropArea')).filter(Boolean));
  assert.deepEqual(paintedZones.sort((a, b) => a.route.localeCompare(b.route) || a.x - b.x), [
    { route: 'A', side: 'left', x: 381, y: 532, width: 78, height: 88 },
    { route: 'B', side: 'right', x: 579, y: 532, width: 78, height: 88 },
    { route: 'C', side: 'left', x: 400, y: 624, width: 80, height: 96 },
    { route: 'C', side: 'right', x: 560, y: 624, width: 80, height: 96 },
  ], 'the visible floor zones must represent the enlarged accepting areas');
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-title.png') });
  await press('Enter');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'playing');
  await read(() => {
    window.fixtureInputs = [];
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    scene.input.keyboard.on('keydown', event => {
      window.fixtureInputs.push({ code: event.code, repeat: event.repeat, elapsed: scene.model.elapsedMs,
        worker: { ...scene.model.activeWorker }, held: scene.model.heldPackage?.state, sorted: scene.model.sorted });
      if (window.fixtureInputs.length > 30) window.fixtureInputs.shift();
    });
  });

  const initialWorker = await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeIndex);
  await press('Tab');
  assert.notEqual(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeIndex), initialWorker);
  await press('Tab');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeIndex), initialWorker,
    'each physical action must switch exactly once');
  const initialY = await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.y);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(y => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.y < y - 15, initialY);
  await page.keyboard.up('ArrowUp');

  const beltStart = await read(() => {
    const model = window.fixtureGame.scene.getScene('DepotScene').model;
    const parcel = model.packages.find(item => item.state === 'belt');
    return { id: parcel.id, y: parcel.y, travel: model.beltTravel };
  });
  await page.waitForFunction(travel => window.fixtureGame.scene.getScene('DepotScene').model.beltTravel > travel + 15, beltStart.travel);
  const beltEnd = await page.evaluate(id => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    const model = scene.model;
    return { y: model.packages.find(item => item.id === id).y, travel: model.beltTravel,
      surfaceOffset: scene.depot.belt.tilePositionY, renderedY: scene.parcels.get(id).container.y };
  }, beltStart.id);
  assert.ok(Math.abs((beltEnd.y - beltStart.y) - (beltEnd.travel - beltStart.travel)) < 1e-8,
    'parcel displacement must equal belt surface displacement');
  assert.equal(beltEnd.renderedY, beltEnd.y, 'drawn parcel must stay on its simulated contact point');
  assert.equal(beltEnd.surfaceOffset, -beltEnd.travel, 'drawn tread phase must follow the same belt travel');

  await press('Escape');
  const paused = await read(() => {
    const model = window.fixtureGame.scene.getScene('DepotScene').model;
    return { travel: model.beltTravel, elapsed: model.elapsedMs };
  });
  await page.waitForTimeout(180);
  assert.deepEqual(await read(() => {
    const model = window.fixtureGame.scene.getScene('DepotScene').model;
    return { travel: model.beltTravel, elapsed: model.elapsedMs };
  }), paused, 'pause must freeze both clock and belt');
  await press('Escape');
  await page.waitForFunction(travel => window.fixtureGame.scene.getScene('DepotScene').model.beltTravel > travel, paused.travel);

  // Complete the opening A/B/C dispatches using only controls and naturally
  // spawned parcels. The model is observed, never moved or accelerated here.
  const walkTo = async (x, y) => {
    // Follow the clear belt aisle vertically, then approach the loading door.
    // Cutting across first would walk into the restored truck's corner.
    for (const [axis, target, lowKey, highKey] of [['y', y, 'ArrowUp', 'ArrowDown'], ['x', x, 'ArrowLeft', 'ArrowRight']]) {
      // A hosted browser can deliver a release late even with a steady game
      // frame rate. Use bounded real presses and observe their result, including
      // correcting overshoot, rather than depending on one exact release frame.
      for (let attempt = 0; attempt < 30; attempt++) {
        const current = await page.evaluate(axis => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker[axis], axis);
        const distance = target - current;
        if (Math.abs(distance) <= 10) break;
        const key = distance > 0 ? highKey : lowKey;
        await page.keyboard.press(key, { delay: Math.min(180, Math.max(35, Math.abs(distance) * 3)) });
        if (attempt === 29) assert.fail(`keyboard travel did not settle near ${axis}=${target}`);
      }
    }
  };
  for (const [route, index, dockX, dockY, kind, name] of [
    ['A', 0, 400, 532, 'mallwood', 'MALLWOOD RD EAST'],
    ['B', 1, 560, 532, 'goji', 'GOJI BERRIES'],
    ['C', 1, 580, 640, 'lobsters', 'LIVE LOBSTERS'],
  ]) {
    if (await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeIndex) !== index) await press('Tab');
    await walkTo(index === 0 ? 400 : 560, 300);
    await page.waitForFunction(route => window.fixtureGame.scene.getScene('DepotScene').model.nearestPackage()?.route === route, route);
    await press('Space');
    assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.heldPackage?.route), route);
    const freight = await read(() => {
      const scene = window.fixtureGame.scene.getScene('DepotScene');
      const parcel = scene.model.heldPackage;
      return { kind: parcel.kind, label: parcel.label,
        stamps: scene.parcels.get(parcel.id).container.list.filter(child => child.type === 'Text').map(child => child.text.replace(/\s+/g, ' ').trim()) };
    });
    assert.equal(freight.kind, kind, 'opening freight must preserve the original named parcel identities');
    assert.equal(freight.label, name);
    assert.ok(freight.stamps.includes(route) && freight.stamps.includes(name),
      'the rendered special parcel must keep both its routing letter and complete reference name');
    if (route === 'A' && process.env.BELT_SCREENSHOT_DIR) {
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-mallwood.png') });
    }
    if (route === 'C') {
      await press('Escape');
      const readCast = () => read(() => {
        const scene = window.fixtureGame.scene.getScene('DepotScene');
        return {
          elapsed: scene.model.elapsedMs,
          history: [...scene.life.history],
          cast: [...scene.life.cast.values()].map(({ name, art }) => ({
            name, x: art.x, y: art.y, angle: art.rotation, scaleX: art.scaleX, scaleY: art.scaleY, visible: art.visible,
          })),
          speech: [...scene.life.speech.entries()].map(([side, bubble]) => ({ side, expires: bubble.expires, active: bubble.panel.active })),
        };
      });
      const frozenCast = await readCast();
      await page.waitForTimeout(180);
      assert.deepEqual(await readCast(), frozenCast, 'pause must freeze cast gestures, speech expiry and timed banter');
      await press('Escape');
      if (process.env.BELT_SCREENSHOT_DIR) {
        // This is real opening play: Kylie searches for coffee while the worker
        // carries the naturally spawned lobsters. No scene state is fabricated.
        await page.waitForTimeout(150);
        await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-personality.png') });
      }
    }
    if (route === 'C' && process.env.BELT_SCREENSHOT_DIR) {
      // The comparison capture is an organically reached playable scene.
      await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').model.elapsedMs >= 19_000);
      await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-game.png') });
    }
    const beforeSort = await read(() => window.fixtureGame.scene.getScene('DepotScene').model.sorted);
    await walkTo(dockX, dockY);
    await press('Space');
    const afterSort = await read(() => {
      const s = window.fixtureGame.scene.getScene('DepotScene');
      return { sorted: s.model.sorted, state: s.state, worker: { ...s.model.activeWorker }, held: s.model.heldPackage,
        parcels: s.model.packages, toast: s.toast.text, fps: s.game.loop.actualFps, inputs: window.fixtureInputs,
        queue: s.input.keyboard.manager.queue.map(event => ({ code: event.code, type: event.type, time: event.timeStamp })) };
    });
    assert.equal(afterSort.sorted, beforeSort + 1, `Opening ${route} delivery diagnostics: ${JSON.stringify(afterSort)}`);
    if (route === 'C') {
      await page.waitForTimeout(400);
      const bulk = await read(() => {
        const scene = window.fixtureGame.scene.getScene('DepotScene');
        const delivered = scene.model.packages.find(parcel => parcel.route === 'C' && parcel.state === 'delivered');
        return { x: delivered.x, y: delivered.y, stock: scene.depot.bulkStockCount, action: scene.actionText.text };
      });
      assert.deepEqual([bulk.x, bulk.y, bulk.stock], [480, 610, 1], 'C delivered from the extended lower area must reach the actual shared pile');
      if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-layout-bulk.png') });
    }
  }
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.missed), 0,
    'the opening lesson must allow all three routes without a miss');
  const openingBanter = await read(() => window.fixtureGame.scene.getScene('DepotScene').life.history);
  assert.ok(openingBanter.includes('KYLIE: WHERE IS MY TIMMY HORTANS'), 'Kylie must enter and complain during normal opening play');
  assert.ok(openingBanter.includes("JOHN RUSHTON: DON'T STACK BOXES ON BOXES!"), 'the timed John interruption must occur during normal opening play');

  await press('KeyE');
  const brakedTravel = await read(() => window.fixtureGame.scene.getScene('DepotScene').model.beltTravel);
  await page.waitForTimeout(180);
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.beltTravel), brakedTravel,
    'the brake control must stop the surface and parcels together');
  await page.waitForFunction(travel => window.fixtureGame.scene.getScene('DepotScene').model.beltTravel > travel, brakedTravel);
  assert.ok((await read(() => window.fixtureGame.scene.getScene('DepotScene').life.history))
    .includes('SHAN O MACK: WHO STOPPED THE #@%! BELT?!'), 'using the actual brake must provoke Shan');
  if (process.env.BELT_SCREENSHOT_DIR) {
    await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').model.elapsedMs >= 25_100);
    // Follow Termite to put the massage in frame; Skanky's close view faces the
    // other bay. This is a normal worker switch, not a fabricated camera pose.
    const switchForMassage = await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeIndex === 1);
    if (switchForMassage) await press('Tab');
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-massage.png') });
    if (switchForMassage) await press('Tab');
  }

  // Use existing parcels, so fixtures do not depend on a second constructor or
  // install any hooks in the shipped game. Return the observed starting score.
  const arrange = async route => page.evaluate(destination => {
    const model = window.fixtureGame.scene.getScene('DepotScene').model;
    for (const parcel of model.packages) parcel.state = 'delivered';
    for (const worker of model.workers) worker.heldId = null;
    model.activeIndex = 0;
    model.combo = 0;
    model.activeWorker.x = 400;
    model.activeWorker.y = 300;
    const parcel = model.packages[0];
    Object.assign(parcel, { route: destination, state: 'belt', x: 480, y: 300,
      beltOffset: 300 - model.beltTravel, workerId: null, recovered: false });
    return { score: model.score, sorted: model.sorted, id: parcel.id };
  }, route);
  const first = await arrange('A');
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.heldId), first.id);
  await walkTo(360, 532);
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.sorted), first.sorted,
    'entering a dock must not silently deliver before the action');
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.sorted), first.sorted + 1);
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.score), first.score + 100);
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.sorted), first.sorted + 1,
    'an already delivered parcel cannot score twice');

  const wrong = await arrange('B');
  await press('Space');
  await read(() => { Object.assign(window.fixtureGame.scene.getScene('DepotScene').model.activeWorker, { x: 360, y: 532 }); });
  await press('Space');
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.heldId), wrong.id,
    'wrong dock must retain the parcel so the player can correct the route');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.score), wrong.score);

  // Move back to the belt, set down, and let the other worker take the parcel.
  await read(() => { Object.assign(window.fixtureGame.scene.getScene('DepotScene').model.activeWorker, { x: 400, y: 300 }); });
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.heldId), null);
  await press('Tab');
  await read(() => {
    const worker = window.fixtureGame.scene.getScene('DepotScene').model.activeWorker;
    worker.x = 560; worker.y = 300;
  });
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.heldId), wrong.id,
    'a replaced parcel must be available to the opposite worker');
  await read(() => { Object.assign(window.fixtureGame.scene.getScene('DepotScene').model.activeWorker, { x: 600, y: 532 }); });
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.sorted), wrong.sorted + 1);

  const recovery = await arrange('C');
  await read(() => {
    const model = window.fixtureGame.scene.getScene('DepotScene').model;
    const parcel = model.packages[0];
    parcel.y = 549; parcel.beltOffset = 549 - model.beltTravel;
    model.activeWorker.y = 690;
  });
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').model.pileup === 1);
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.pileup), 0);
  await read(() => {
    const worker = window.fixtureGame.scene.getScene('DepotScene').model.activeWorker;
    worker.x = 370; worker.y = 664;
  });
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.score), recovery.score + 60,
    'a recovered bulk parcel awards the documented half score');

  // Full cast mechanics and reference variants are checked independently in
  // reference-browser.mjs. Preserve this suite's organic controls/restart scope.
  await read(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    const model = scene.model;
    for (const parcel of model.packages) parcel.state = 'delivered';
    model.sorted = model.goal;
    model.elapsedMs = model.durationMs - 1;
    // This fixture jumps past Ben's trigger. Resolve the real paused sequence
    // in small steps so the results test does not wait through it a second time.
    scene.update(scene.time.now, 0);
    while (scene.state === 'interlude') scene.update(scene.time.now, 100);
  });
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'celebrating');
  await press('Enter');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'results');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.won), true);
  await press('Enter');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'briefing');
  await press('Enter');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'playing');
  await press('Tab');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeIndex), 1,
    'restart must install exactly one input listener');
  assert.deepEqual(await read(() => window.fixtureGame.scene.getScene('DepotScene').life.history), [],
    'restart must reset cast cue history along with the shift');

  // Real keyboard events can arrive between two game frames on a slow device.
  // Phaser revisits its whole event queue until POST_STEP. Suspend only the
  // frame loop, not DOM input, and require each physical press to act once.
  const queuedParcel = await arrange('A');
  await page.waitForFunction(() => window.fixtureGame.input.keyboard.queue.length === 0);
  await read(() => window.fixtureGame.loop.sleep());
  try {
    const queuedState = () => read(() => {
      const scene = window.fixtureGame.scene.getScene('DepotScene');
      return { active: scene.model.activeIndex, held: scene.model.workers.map(worker => worker.heldId),
        muted: scene.muted, queued: scene.input.keyboard.manager.queue.map(event => event.code + ':' + event.type) };
    });
    await page.keyboard.press('Space');
    assert.equal((await queuedState()).held[0], queuedParcel.id, 'one Space must grab once before the next frame');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Tab');
    const switched = await queuedState();
    assert.equal(switched.active, 1, `one Tab must switch once despite earlier queued events: ${JSON.stringify(switched)}`);
    assert.deepEqual(switched.held, [queuedParcel.id, null], 'later input must not replay the earlier grab as a drop');
    await page.keyboard.press('KeyM');
    const muted = await queuedState();
    assert.notEqual(muted.muted, switched.muted, 'one M must toggle sound once');
    await page.keyboard.press('ArrowUp');
    const unrelated = await queuedState();
    assert.equal(unrelated.muted, muted.muted, 'later input must not replay the sound toggle');
    assert.equal(unrelated.active, 1, 'later input must not replay the worker switch');
    assert.deepEqual(unrelated.held, [queuedParcel.id, null], 'later input must preserve the held parcel');
    await page.keyboard.down('Tab');
    assert.equal((await queuedState()).active, 0, 'a new physical Tab press must still work within the same frame');
    await page.keyboard.down('Tab');
    await page.keyboard.up('Tab');
    assert.equal((await queuedState()).active, 0, 'native key repeat must not trigger another switch');
  } finally {
    await read(() => window.fixtureGame.loop.wake());
  }
  assert.deepEqual(errors, []);
  console.log('PASS slice named freight and resident cast, opening banter, keyboard A/B/C loop, belt synchronization, pause/brake, sorting, handoff, recovery, results/restart and exactly-once keyboard input between frames; no script errors');
  await context.close();

  const touchContext = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
  const touchPage = await touchContext.newPage();
  const touchErrors = [];
  touchPage.on('pageerror', error => touchErrors.push(error.message));
  await touchPage.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '' }));
  await touchPage.route('https://fonts.gstatic.com/**', route => route.fulfill({ body: '' }));
  await touchPage.addInitScript(() => {
    let phaser;
    Object.defineProperty(window, 'Phaser', {
      configurable: true,
      get: () => phaser,
      set: value => {
        phaser = value;
        const boot = value.Game.prototype.boot;
        value.Game.prototype.boot = function (...args) {
          window.fixtureGame = this;
          return boot.apply(this, args);
        };
      },
    });
  });
  await touchPage.goto(`${server.resolvedUrls.local[0]}?mode=2d`);
  await touchPage.waitForFunction(() => window.fixtureGame?.scene.isActive('DepotScene'));
  const waitForCanvasFit = async () => {
    try {
      await touchPage.waitForFunction(() => {
        const actual = document.querySelector('#app canvas').getBoundingClientRect();
        const available = document.querySelector('#app').getBoundingClientRect();
        const expectedWidth = Math.min(available.width, available.height * 4 / 3);
        return Math.abs(actual.width - expectedWidth) < 1;
      });
    } catch (error) {
      console.error('Canvas fit diagnostics:', await touchPage.evaluate(() => {
        const canvas = document.querySelector('#app canvas');
        const app = document.querySelector('#app');
        const game = window.fixtureGame;
        const scale = game.scale;
        const available = app.getBoundingClientRect();
        return {
          viewport: { width: innerWidth, height: innerHeight },
          visibility: document.visibilityState, focused: document.hasFocus(),
          coarse: matchMedia('(pointer: coarse)').matches,
          portrait: matchMedia('(orientation: portrait)').matches,
          scene: game.scene.getScene('DepotScene').state,
          loop: { running: game.loop.running, fps: game.loop.actualFps },
          canvas: canvas.getBoundingClientRect().toJSON(),
          app: available.toJSON(),
          expectedWidth: Math.min(available.width, available.height * 4 / 3),
          canvasStyle: canvas.getAttribute('style'),
          appStyle: { width: getComputedStyle(app).width, height: getComputedStyle(app).height },
          phaser: {
            canvasBounds: scale.canvasBounds,
            parentSize: { width: scale.parentSize.width, height: scale.parentSize.height },
            displaySize: { width: scale.displaySize.width, height: scale.displaySize.height },
            displayScale: { x: scale.displayScale.x, y: scale.displayScale.y },
          },
        };
      }));
      throw error;
    }
  };
  const tapCanvas = async (x, y) => {
    await waitForCanvasFit();
    await touchPage.waitForFunction(() => {
      const actual = document.querySelector('#app canvas').getBoundingClientRect();
      const measured = window.fixtureGame.scale.canvasBounds;
      return Math.abs(actual.x - measured.x) < 1 && Math.abs(actual.y - measured.y) < 1 &&
        Math.abs(actual.width - measured.width) < 1 && Math.abs(actual.height - measured.height) < 1;
    });
    const box = await touchPage.locator('#app canvas').boundingBox();
    await touchPage.touchscreen.tap(box.x + x / 960 * box.width, box.y + y / 720 * box.height);
  };
  await tapCanvas(480, 495);
  await touchPage.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'playing');
  assert.equal(await touchPage.locator('.depot-touch').count(), 1);
  await touchPage.getByRole('button', { name: 'SWITCH', exact: true }).tap();
  assert.equal(await touchPage.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').model.activeIndex), 1);
  await touchPage.getByRole('button', { name: 'SWITCH', exact: true }).tap();
  assert.equal(await touchPage.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').model.activeIndex), 0);
  const stick = await touchPage.locator('.depot-stick').boundingBox();
  const touchSession = await touchContext.newCDPSession(touchPage);
  const touchY = await touchPage.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.y);
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }] });
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 - 28 }] });
  await touchPage.waitForFunction(y => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.y < y - 15, touchY);
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchPage.evaluate(() => {
    const model = window.fixtureGame.scene.getScene('DepotScene').model;
    model.activeWorker.x = 400; model.activeWorker.y = 300;
    const parcel = model.packages[0];
    parcel.y = 300; parcel.beltOffset = 300 - model.beltTravel;
  });
  await touchPage.getByRole('button', { name: 'GRAB / DELIVER', exact: true }).tap();
  assert.equal(await touchPage.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').model.heldPackage?.route), 'A');
  await touchPage.getByRole('button', { name: 'BRAKE', exact: true }).tap();
  assert.ok(await touchPage.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').model.brakeRemainingMs > 0));
  const assertControlsOutsideCanvas = async () => {
    const canvas = await touchPage.locator('#app canvas').boundingBox();
    for (const selector of ['.depot-stick', '.depot-actions']) {
      const control = await touchPage.locator(selector).boundingBox();
      const overlaps = control.x < canvas.x + canvas.width && control.x + control.width > canvas.x &&
        control.y < canvas.y + canvas.height && control.y + control.height > canvas.y;
      assert.equal(overlaps, false, `${selector} must not obscure the game canvas`);
    }
  };
  await assertControlsOutsideCanvas();
  if (process.env.BELT_SCREENSHOT_DIR) await touchPage.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-mobile.png') });
  // A browser can resize while game frames are suspended. Require the actual
  // parent-layout adapter to fit the canvas without relying on a later STEP.
  // Wake the public game loop afterward; the real taps below verify input too.
  await touchPage.evaluate(() => window.fixtureGame.loop.sleep());
  try {
    await touchPage.setViewportSize({ width: 932, height: 430 });
    await touchPage.waitForFunction(() => window.innerWidth > window.innerHeight);
    await waitForCanvasFit();
    await assertControlsOutsideCanvas();
    if (process.env.BELT_SCREENSHOT_DIR) await touchPage.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-mobile-landscape.png') });
  } finally {
    await touchPage.evaluate(() => window.fixtureGame.loop.wake());
  }
  await touchPage.evaluate(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    const model = scene.model;
    for (const worker of model.workers) worker.heldId = null;
    for (const parcel of model.packages) parcel.state = 'delivered';
    model.sorted = model.goal;
    model.elapsedMs = model.durationMs - 1;
    scene.update(scene.time.now, 0);
    while (scene.state === 'interlude') scene.update(scene.time.now, 100);
  });
  await touchPage.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'results');
  await touchPage.locator('.depot-touch').waitFor({ state: 'hidden' });
  await tapCanvas(480, 495);
  await touchPage.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'briefing');
  await tapCanvas(480, 495);
  await touchPage.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'playing');
  assert.equal(await touchPage.locator('.depot-touch').count(), 1);
  await touchPage.getByRole('button', { name: 'SWITCH', exact: true }).tap();
  assert.equal(await touchPage.evaluate(() => window.fixtureGame.scene.getScene('DepotScene').model.activeIndex), 1);
  assert.deepEqual(touchErrors, []);
  console.log('PASS slice touch start, joystick movement, switch, grab, brake, rotation without game frames and results/restart; no script errors');
  await touchContext.close();
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
