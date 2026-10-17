import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

// The 3D preview needs WebGL. CI's GPU-free runners provide it through
// SwiftShader, so this suite requests that explicitly rather than inheriting
// the Canvas-fallback flag the Phaser suites use. A second browser with WebGL
// disabled checks the explanatory fallback.
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const url = `${server.resolvedUrls.local[0]}?mode=3d`;
const executable = process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' };
const browsers = [];
try {
  const blocked = await chromium.launch({ headless: true, args: ['--disable-webgl', '--disable-webgl2'], ...executable });
  browsers.push(blocked);
  const fallbackPage = await blocked.newPage();
  await fallbackPage.goto(url);
  await fallbackPage.getByText('This preview needs WebGL').waitFor();
  assert.equal(await fallbackPage.getByRole('link', { name: 'Play the full 2D night shift instead' }).count(), 1);
  console.log('PASS 3D preview explains a missing WebGL renderer and links to the 2D shift');

  const browser = await chromium.launch({
    headless: true, ...executable,
    args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  if (process.env.BELT_BROWSER_CPU_RATE) {
    const diagnostics = await page.context().newCDPSession(page);
    await diagnostics.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.BELT_BROWSER_CPU_RATE) });
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  await page.addInitScript(() => {
    window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; });
    // Each countdown step is recorded as it is drawn; SORT! is on screen for only 350 ms.
    window.fixtureCountdown = [];
    new MutationObserver(() => {
      const copy = document.querySelector('.b3d-count')?.textContent;
      if (copy && window.fixtureCountdown.at(-1) !== copy) window.fixtureCountdown.push(copy);
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.goto(url);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing');
  const read = (fn, arg) => page.evaluate(fn, arg);
  console.log(`3D quality: ${await read(() => window.fixtureApp.quality)}`);
  assert.equal(await read(() => typeof window.Phaser), 'undefined', '3D mode must not load the Phaser engine');
  assert.deepEqual(await read(() => [...window.fixtureApp.world.residents.keys()].sort()),
    ['aj', 'bannerman', 'ben', 'brian', 'donna', 'doris', 'fruitloop', 'hussan'], 'the eight resident coworkers must be present');
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-briefing.png') });

  await page.keyboard.press('Enter');
  await page.locator('.b3d-count', { hasText: '3' }).waitFor();
  assert.equal(await read(() => window.fixtureApp.model.elapsedMs), 0, 'the shift clock waits for 3, 2, 1, SORT!');
  await page.waitForFunction(() => window.fixtureApp.state === 'playing', null, { timeout: 90_000 });
  assert.deepEqual(await read(() => window.fixtureCountdown), ['3', '2', '1', 'SORT!'], 'the original countdown is shown in order');

  // Real keys: Termite waits at dock A for the first parcel, grabs and delivers it.
  await page.waitForFunction(() => window.fixtureApp.model.nearestPackage(), null, { timeout: 90_000 });
  await page.keyboard.press('Space');
  const held = await read(() => window.fixtureApp.model.heldPackage && { label: window.fixtureApp.model.heldPackage.label, route: window.fixtureApp.model.heldPackage.route });
  assert.deepEqual(held, { label: 'MALLWOOD RD EAST', route: 'A' });
  await page.keyboard.press('Space');
  assert.deepEqual(await read(() => ({ sorted: window.fixtureApp.model.sorted, score: window.fixtureApp.model.score })), { sorted: 1, score: 100 });

  // Kylie's three original coffee lines arrive in order with her name.
  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => window.fixtureApp.overlay.history.filter((line) => line.startsWith('KYLIE: ')).length === 3, null, { timeout: 120_000 });
  assert.deepEqual(await read(() => window.fixtureApp.overlay.history.filter((line) => line.startsWith('KYLIE: '))),
    ['KYLIE: WHERE IS MY TIMMY HORTANS', 'KYLIE: MY TIMMY HORTANS?!', 'KYLIE: WHO TOOK MY TIMMY HORTANS']);
  // In the overview her bubble is anchored above her head, not pinned to a corner.
  await page.waitForTimeout(400);
  const anchoring = await read(() => {
    const app = window.fixtureApp;
    const bubble = app.overlay.activeSpeech().find((item) => item.speaker === 'KYLIE');
    const kylie = app.visitors.kylie.root;
    const head = kylie.position.clone();
    head.y += app.visitors.kylie.headHeight + 0.35;
    head.project(app.camera);
    const width = app.renderer.domElement.clientWidth;
    const height = app.renderer.domElement.clientHeight;
    return bubble && { edge: bubble.edge, dx: Math.abs(bubble.x - (head.x + 1) / 2 * width), dy: Math.abs(bubble.y - (1 - head.y) / 2 * height) };
  });
  assert.ok(anchoring, "Kylie's bubble must still be visible");
  assert.equal(anchoring.edge, false, "Kylie's bubble must sit at her position in the overview");
  assert.ok(anchoring.dx < 4 && anchoring.dy < 60, `bubble must follow Kylie (dx ${anchoring.dx}, dy ${anchoring.dy})`);
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-overview.png') });
  await page.keyboard.press('KeyV');

  // A brake brings Shan out for his first original rant.
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.fixtureApp.overlay.activeSpeech().some((item) => item.speaker === 'SHAN O MACK'));
  assert.equal(await read(() => window.fixtureApp.overlay.activeSpeech().find((item) => item.speaker === 'SHAN O MACK').text), '!@#%!');
  assert.equal(await read(() => window.fixtureApp.visitors.shan.root.visible), true);
  assert.equal(await read(() => window.fixtureApp.model.beltSpeed), 0, 'the brake must stop the belt');

  // Pause freezes the shift; Enter resumes. Tab hands off to Skanky.
  await page.keyboard.press('Escape');
  assert.equal(await read(() => window.fixtureApp.state), 'paused');
  const pausedAt = await read(() => window.fixtureApp.model.elapsedMs);
  await page.waitForTimeout(500);
  assert.equal(await read(() => window.fixtureApp.model.elapsedMs), pausedAt);
  await page.keyboard.press('Enter');
  assert.equal(await read(() => window.fixtureApp.state), 'playing');
  await page.keyboard.press('Tab');
  assert.equal(await read(() => window.fixtureApp.model.activeWorker.id), 'skanky');
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-follow.png') });
  assert.deepEqual(errors, []);
  console.log('PASS 3D preview countdown, real-key grab/deliver, anchored Kylie lines, Shan brake rant, pause/resume and handoff; no script errors');
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
  await server.close();
}
