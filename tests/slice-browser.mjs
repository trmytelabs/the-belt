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
  await page.goto(server.resolvedUrls.local[0]);
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
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-title.png') });
  await press('Enter');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'playing');

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
    for (const [axis, target, lowKey, highKey] of [['x', x, 'ArrowLeft', 'ArrowRight'], ['y', y, 'ArrowUp', 'ArrowDown']]) {
      const current = await page.evaluate(axis => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker[axis], axis);
      if (Math.abs(current - target) < 4) continue;
      const direction = current < target ? 1 : -1;
      const key = direction > 0 ? highKey : lowKey;
      await page.keyboard.down(key);
      await page.waitForFunction(({ axis, target, direction }) => {
        const position = window.fixtureGame.scene.getScene('DepotScene').model.activeWorker[axis];
        return direction > 0 ? position >= target - 2 : position <= target + 2;
      }, { axis, target, direction });
      await page.keyboard.up(key);
    }
  };
  for (const [route, index, dockX, dockY, kind, name, stamp] of [
    ['A', 0, 280, 300, 'mallwood', 'MALLWOOD RD EAST', 'MALLWOOD'],
    ['B', 1, 680, 300, 'goji', 'GOJI BERRIES', 'GOJI'],
    ['C', 1, 680, 492, 'lobsters', 'LIVE LOBSTERS', 'LIVE'],
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
        stamps: scene.parcels.get(parcel.id).container.list.filter(child => child.type === 'Text').map(child => child.text) };
    });
    assert.equal(freight.kind, kind, 'opening freight must preserve the original named parcel identities');
    assert.equal(freight.label, name);
    assert.ok(freight.stamps.includes(route) && freight.stamps.includes(stamp),
      'the rendered special parcel must keep both its routing letter and identifying stamp');
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
    assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.sorted), beforeSort + 1);
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
    await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-massage.png') });
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
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.x < 300);
  await page.keyboard.up('ArrowLeft');
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
  await read(() => { window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.x = 280; });
  await press('Space');
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.heldId), wrong.id,
    'wrong dock must retain the parcel so the player can correct the route');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.score), wrong.score);

  // Move back to the belt, set down, and let the other worker take the parcel.
  await read(() => { window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.x = 400; });
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
  await read(() => { window.fixtureGame.scene.getScene('DepotScene').model.activeWorker.x = 690; });
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.sorted), wrong.sorted + 1);

  const recovery = await arrange('C');
  await read(() => {
    const model = window.fixtureGame.scene.getScene('DepotScene').model;
    const parcel = model.packages[0];
    parcel.y = 609; parcel.beltOffset = 609 - model.beltTravel;
    model.activeWorker.y = 580;
  });
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').model.pileup === 1);
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.pileup), 0);
  await read(() => {
    const worker = window.fixtureGame.scene.getScene('DepotScene').model.activeWorker;
    worker.x = 280; worker.y = 492;
  });
  await press('Space');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.score), recovery.score + 60,
    'a recovered bulk parcel awards the documented half score');

  // Full cast mechanics and reference variants are checked independently in
  // reference-browser.mjs. Preserve this suite's organic controls/restart scope.
  await read(() => {
    const model = window.fixtureGame.scene.getScene('DepotScene').model;
    for (const parcel of model.packages) parcel.state = 'delivered';
    model.sorted = model.goal;
    model.elapsedMs = model.durationMs - 1;
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
  assert.deepEqual(errors, []);
  console.log('PASS slice named freight and resident cast, opening banter, keyboard A/B/C loop, belt synchronization, pause/brake, sorting, handoff, recovery and results/restart; no script errors');
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
  await touchPage.goto(server.resolvedUrls.local[0]);
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
    const model = window.fixtureGame.scene.getScene('DepotScene').model;
    for (const worker of model.workers) worker.heldId = null;
    for (const parcel of model.packages) parcel.state = 'delivered';
    model.sorted = model.goal;
    model.elapsedMs = model.durationMs - 1;
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
