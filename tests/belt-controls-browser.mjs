import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';

// Exercise the live development preview or a fresh production build.
const server = process.env.BELT_TEST_BASE_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const url = process.env.BELT_TEST_BASE_URL ?? server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const shots = process.env.BELT_CONTROLS_REVIEW_DIR;
const widths = new Set(process.argv.slice(2).map(Number));
if (shots) await mkdir(shots, { recursive: true });
try {
  const viewports = [{ width: 1280, height: 800 }, { width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
  for (const viewport of viewports.filter(view => !widths.size || widths.has(view.width))) {
    const touch = viewport.width !== 1280;
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => window.addEventListener('belt3d:ready', event => { window.fixtureApp = event.detail; event.detail.playPrologue = false; }));
    const wait = (fn, arg) => page.waitForFunction(fn, arg, { polling: 20, timeout: 90000 });
    await page.goto(url);
    await wait(() => window.fixtureApp?.state === 'briefing');
    await page.locator('.b3d-more summary').click();
    assert.match(await page.locator('.b3d-panel').innerText(), /3 stops per run, with a 15-second cooldown/);
    await page.getByRole('button', { name: /START THE NIGHT/ }).click();
    await wait(() => window.fixtureApp.state === 'story');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.b3d canvas')), true);
    // A window switch during the opening pauses it. Resuming must not leave
    // the sorting model frozen after the story and countdown have finished.
    await page.keyboard.press('Escape');
    await wait(() => window.fixtureApp.state === 'paused');
    await page.keyboard.press('Enter');
    await wait(() => window.fixtureApp.state === 'story');
    const countdownY = await page.evaluate(() => window.fixtureApp.model.activeWorker.y);
    for (const scene of ['arrival', 'scrum']) {
      await wait(id => window.fixtureApp.state === 'story' && (id === 'arrival' || window.fixtureApp.cutscene?.scene.id === id), scene);
      if (scene === 'scrum') await page.keyboard.down('KeyW');
      if (touch) await page.locator('[data-story="skip"]').tap();
      else await page.keyboard.press('Enter');
    }
    await wait(() => window.fixtureApp.state === 'playing');
    assert.equal(await page.evaluate(() => window.fixtureApp.model.paused), false,
      'resuming the opening must release the sorting model when the countdown finishes');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.b3d canvas')), true,
      'live play receives keyboard focus after the opening');
    await wait(start => window.fixtureApp.model.activeWorker.y < start - 8, countdownY);
    await page.keyboard.up('KeyW');
    // No clock or position fixtures: ordinary startup must accept movement.
    const x = await page.evaluate(() => window.fixtureApp.model.activeWorker.x);
    await page.keyboard.down('KeyD');
    await wait(start => window.fixtureApp.model.activeWorker.x > start + 8, x);
    await page.keyboard.up('KeyD');
    const y = await page.evaluate(() => window.fixtureApp.model.activeWorker.y);
    await page.keyboard.down('ArrowDown');
    await wait(start => window.fixtureApp.model.activeWorker.y > start + 8, y);
    await page.keyboard.up('ArrowDown');
    if (!touch) {
      await wait(() => window.fixtureApp.model.nearestPackage() !== null);
      await page.keyboard.press('Space');
      await wait(() => window.fixtureApp.model.heldPackage !== null);
    }
    await page.keyboard.press('Tab');
    await wait(() => window.fixtureApp.model.activeWorker.id === 'skanky');
    await page.keyboard.press('Tab');
    await wait(() => window.fixtureApp.model.activeWorker.id === 'termite');
    const stop = touch ? page.getByRole('button', { name: /Stop the belt,/ }) : page.locator('[data-touch="brake"]');
    const useStop = async () => {
      if (touch) await stop.tap(); else await page.keyboard.press('KeyE');
    };
    await useStop();
    await wait(() => window.fixtureApp.model.beltStopsRemaining === 2);
    await wait(() => document.querySelector('[data-f="brake"]').textContent.includes('2 LEFT'));
    assert.equal(await stop.isEnabled(), false);
    if (touch) {
      if (shots) await page.screenshot({ path: join(shots, `belt-controls-${viewport.width}.png`) });
      const fits = await stop.evaluate(button => [...button.children].every(child => {
        const box = child.getBoundingClientRect(), outer = button.getBoundingClientRect();
        return child.scrollWidth <= child.clientWidth && box.bottom <= outer.bottom && box.top >= outer.top;
      }));
      assert.equal(fits, true, `the action name and uses fit the phone button: ${await stop.innerText()}`);
    }
    await page.keyboard.press('KeyE');
    assert.equal(await page.evaluate(() => window.fixtureApp.model.beltStopsRemaining), 2);
    await page.keyboard.press('Escape');
    await wait(() => window.fixtureApp.state === 'paused');
    assert.match(await page.locator('.b3d-panel').innerText(), /Click RESUME or press ENTER/);
    const paused = await page.evaluate(() => [window.fixtureApp.model.elapsedMs, window.fixtureApp.model.brakeCooldownMs]);
    await page.waitForTimeout(250);
    assert.deepEqual(await page.evaluate(() => [window.fixtureApp.model.elapsedMs, window.fixtureApp.model.brakeCooldownMs]), paused);
    await page.getByRole('button', { name: /RESUME/ }).click();
    await wait(() => window.fixtureApp.state === 'playing');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.b3d canvas')), true);
    if (!touch) {
      // Wait for the actual cooldown twice to verify a real run becomes ready.
      for (const left of [1, 0]) {
        await wait(() => window.fixtureApp.model.canStopBelt);
        await useStop();
        await wait(remaining => window.fixtureApp.model.beltStopsRemaining === remaining, left);
      }
      await wait(() => window.fixtureApp.model.brakeRemainingMs === 0);
      assert.equal(await stop.isEnabled(), false);
      await page.keyboard.press('KeyE');
      assert.equal(await page.evaluate(() => window.fixtureApp.model.beltStopsRemaining), 0);
      assert.match(await page.locator('[data-f="brake"]').innerText(), /STOP THE BELT · 0 LEFT/);
    }
    if (shots) await page.screenshot({ path: join(shots, `belt-controls-${viewport.width}.png`) });
    // A synthetic result reaches the real replay button without playing the
    // whole night; replay must replace the model and restore all three uses.
    await page.evaluate(() => { window.fixtureApp.model.ended = true; window.fixtureApp.model.won = false; });
    await wait(() => window.fixtureApp.state === 'ended');
    await page.getByRole('button', { name: /ANOTHER NIGHT/ }).click();
    await wait(() => window.fixtureApp.state === 'briefing');
    assert.deepEqual(await page.evaluate(() => [window.fixtureApp.model.beltStopsRemaining, window.fixtureApp.model.brakeCooldownMs]), [3, 0]);
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}px ${await page.evaluate(() => window.fixtureApp.quality)}: paused opening into live play, held WASD through countdown, arrows, focus, switching, stop control and replay${touch ? '' : ', real Space pickup and all three stop uses with real cooldowns'}`);
    await context.close();
  }
} finally {
  await browser.close();
  await server?.close();
}
