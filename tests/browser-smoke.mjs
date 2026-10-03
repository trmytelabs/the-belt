import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';

// Test the production bundle on loopback. The instance observer lives only in
// the isolated browser profile; no test hooks are shipped in the game.
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    // GPU-free CI runners exercise the real Canvas fallback. Local checks
    // retain the browser's default renderer selection unless requested.
    ...(process.env.BELT_BROWSER_RENDERER === 'canvas' ? { args: ['--disable-webgl'] } : {}),
    ...(process.env.BELT_BROWSER_EXECUTABLE
      ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE }
      : { channel: 'chromium' })
  });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 430, height: 932 } : { width: 1200, height: 900 },
      isMobile: mobile, hasTouch: mobile
    });
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => {
      errors.push(error.message);
      console.error('Browser script error:', error.message);
    });
    // Prevent optional fonts from making this check depend on a third party.
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
        }
      });
    });
    await page.goto(server.resolvedUrls.local[0]);
    const active = scene => page.waitForFunction(key => window.fixtureGame?.scene.isActive(key), scene);
    await active('TitleScene');
    if (process.env.BELT_BROWSER_RENDERER === 'canvas') {
      assert.equal(await page.evaluate(() => window.fixtureGame.renderer.type), 1, 'Canvas fallback must be exercised');
    }
    assert.equal(await page.locator('#app canvas').count(), 1);
    const start = async () => {
      if (mobile) await page.locator('#app canvas').tap();
      else await page.keyboard.press('Enter');
      await active('GameScene');
      try {
        await page.waitForFunction(() => window.fixtureGame.scene.getScene('GameScene').shiftSystem.isGameplayActive());
      } catch (error) {
        console.error('Start diagnostics:', await page.evaluate(() => {
          const game = window.fixtureGame;
          const scene = game.scene.getScene('GameScene');
          return {
            visibility: document.visibilityState, focused: document.hasFocus(),
            fps: game.loop.actualFps, running: game.loop.running,
            active: game.scene.isActive('GameScene'), transitioning: scene.isSceneTransitioning,
            phase: scene.shiftSystem.phase, countdown: scene.shiftSystem.countdownIndex,
            countdownTimer: scene.shiftSystem.countdownTimerMs
          };
        }));
        throw error;
      }
    };
    const playerId = () => page.evaluate(() => window.fixtureGame.scene.getScene('GameScene').inputSystem.getActivePlayer().id);
    await start();
    const first = await playerId();
    if (mobile) {
      assert.equal(await page.locator('.mobile-control-layer').count(), 1);
      await page.getByText('SWITCH', { exact: true }).tap();
    } else await page.keyboard.press('Tab', { delay: 50 });
    assert.notEqual(await playerId(), first);
    if (mobile) await page.getByText('SWITCH', { exact: true }).tap();
    else await page.keyboard.press('Tab', { delay: 50 });
    assert.equal(await playerId(), first, 'a single action must switch exactly once');
    if (!mobile) {
      const before = await page.evaluate(() => window.fixtureGame.scene.getScene('GameScene').inputSystem.getActivePlayer().y);
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(y => window.fixtureGame.scene.getScene('GameScene').inputSystem.getActivePlayer().y < y - 10, before);
      await page.keyboard.up('ArrowUp');
    }
    await page.waitForFunction(() => window.fixtureGame.scene.getScene('GameScene').spawnSystem.getPackages().length > 0);
    await page.evaluate(() => {
      const scene = window.fixtureGame.scene.getScene('GameScene');
      const player = scene.inputSystem.getActivePlayer();
      // Keep the fixture away from automatic dock sorting while checking carry.
      player.setPosition(350, 300);
      const parcel = scene.spawnSystem.getPackages()[0];
      parcel.setPosition(player.x, player.y);
      parcel.speed = 0;
    });
    const grab = async () => {
      if (mobile) await page.getByText('GRAB', { exact: true }).tap();
      else await page.keyboard.press('Space', { delay: 50 });
    };
    await grab();
    await page.waitForFunction(() => Boolean(window.fixtureGame.scene.getScene('GameScene').inputSystem.getActivePlayer().heldPackage));
    await grab();
    await page.waitForFunction(() => window.fixtureGame.scene.getScene('GameScene').inputSystem.getActivePlayer().heldPackage === null);
    // Enter the real result scene with deterministic results, then use its real
    // user input to restart. This checks listener and touch-layer cleanup.
    await page.evaluate(() => window.fixtureGame.scene.getScene('GameScene').scene.start('ResultsScene', {
      score: 120, accuracy: 100, packagesSorted: 4, bulkSorted: 0,
      missed: 0, errors: 0, grade: 'A', gradeQuote: 'Synthetic shift'
    }));
    await active('ResultsScene');
    assert.equal(await page.locator('.mobile-control-layer').count(), 0);
    if (mobile) await page.locator('#app canvas').tap();
    else await page.keyboard.press('Enter');
    await active('TitleScene');
    await start();
    const restarted = await playerId();
    if (mobile) {
      assert.equal(await page.locator('.mobile-control-layer').count(), 1);
      await page.getByText('SWITCH', { exact: true }).tap();
    } else await page.keyboard.press('Tab', { delay: 50 });
    assert.notEqual(await playerId(), restarted, 'restart must retain one input listener');
    assert.deepEqual(errors, []);
    console.log(`PASS ${mobile ? 'touch' : 'keyboard'} start, switch, grab/drop, results and restart; no script errors`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
