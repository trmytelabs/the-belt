import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';

// The Timmies run, the lunch mini-game, on its own (?minigame=coffee): the riders and props in the roofless car,
// the trays tilted by real keys, the HUD and gauge, pause, the card at the end and AGAIN. The night's own Timmies
// run, after a Tim Hortons lunch, is played by the story suite's break check.
const server = process.env.BELT_TEST_BASE_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; event.detail.playPrologue = false; });
  });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  const base = process.env.BELT_TEST_BASE_URL ?? server.resolvedUrls.local[0];
  const read = (fn, arg) => page.evaluate(fn, arg);
  const wait = (fn, arg, options = {}) => page.waitForFunction(fn, arg, { polling: 10, timeout: 90_000, ...options });

  // The night's briefing offers it.
  await page.goto(new URL('?mode=3d', base).href);
  await wait(() => window.fixtureApp?.state === 'briefing');
  assert.equal(await page.locator('a', { hasText: 'TRY THE TIMMIES RUN' }).getAttribute('href'), '/?mode=3d&minigame=coffee');

  await page.goto(new URL('?mode=3d&minigame=coffee', base).href);
  await wait(() => window.fixtureApp?.state === 'briefing');
  assert.match(await page.locator('.b3d-panel').innerText(), /THE TIMMIES RUN\.[\s\S]*two trays of coffees[\s\S]*START/);
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'coffee');
  // In the car: Termite drives, Skanky holds the trays (his wrists on their edges), Brian and Doris in the back,
  // eight donut boxes and eight coffees, the roof cut away.
  await wait(() => window.fixtureApp.coffeeScene.report().handGap < 0.05);
  const report = await read(() => window.fixtureApp.coffeeScene.report());
  assert.deepEqual(report.seats, { TERMITE: 'driver', SKANKY: 'passenger', BRIAN: 'rearL', DORIS: 'rearR' });
  assert.deepEqual([report.boxes, report.cups], [8, 8]);
  assert.equal(await read(() => window.fixtureApp.renderer.localClippingEnabled), true);
  // A software renderer can take a moment to draw the HUD the first time.
  await wait(() => /COFFEES/.test(document.querySelector('.b3d-chapterhud')?.textContent ?? ''));
  assert.match(await page.locator('.b3d-chapterhud').innerText(), /COFFEES\s*8 \/ 8[\s\S]*TIME[\s\S]*POINTS\s*\+300/);
  assert.equal(await page.locator('.b3d-coffee').isVisible(), true);
  // A real key tilts the trays at a hand's pace: A lowers the left, toward the console. (With the coffee out to the left,
  // that is away from the middle: toward it, the trays tilt only as far as brings the coffee back.)
  await read(() => { window.fixtureApp.coffee.slosh.right = -0.5; });
  await page.keyboard.down('KeyA');
  await wait(() => window.fixtureApp.coffee.tilt.right < -0.6);
  await page.keyboard.up('KeyA');
  await read(() => { window.fixtureApp.coffee.slosh.forward = 0.5; });
  await page.keyboard.down('KeyW');
  await wait(() => window.fixtureApp.coffee.tilt.forward > 0.6);
  await page.keyboard.up('KeyW');
  // ESC pauses the ride where it is.
  await page.keyboard.press('Escape');
  await wait(() => window.fixtureApp.state === 'paused');
  const paused = await read(() => window.fixtureApp.coffee.elapsedMs);
  await page.waitForTimeout(500);
  assert.equal(await read(() => window.fixtureApp.coffee.elapsedMs), paused, 'paused, the ride stands still');
  assert.equal(await page.locator('.b3d-coffee').isVisible(), true, 'the gauge stays under the pause card');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'coffee');
  // The warnings reach the HUD: the run is taken (by steady hands) to just before the red light.
  await read(() => {
    const run = window.fixtureApp.coffee;
    const steady = () => ({ x: Math.max(-1, Math.min(1, run.acceleration.right / 5)), y: -Math.max(-1, Math.min(1, run.acceleration.forward / 5)) });
    while (!run.upcoming || run.upcoming.kind !== 'red-light') run.update(1000 / 60, steady());
  });
  await wait(() => /RED LIGHT/.test(document.querySelector('.b3d-chapterhud .objective')?.textContent ?? ''));
  // Through to the end by steady hands: the card counts the coffees and AGAIN rides again.
  const cups = await read(() => {
    const run = window.fixtureApp.coffee;
    while (!run.done) run.update(1000 / 60, { x: Math.max(-1, Math.min(1, run.acceleration.right / 5)), y: -Math.max(-1, Math.min(1, run.acceleration.forward / 5)) });
    return run.cupsLeft;
  });
  await wait(() => window.fixtureApp.state === 'coffee-done');
  const card = await page.locator('.b3d-panel').innerText();
  assert.match(card, cups === 8 ? /NOT A DROP SPILLED\.[\s\S]*\+300/ : new RegExp(`${cups} OF 8 COFFEES MADE IT`), card);
  assert.match(card, /AGAIN/);
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'coffee' && window.fixtureApp.coffee.elapsedMs < 2000);
  assert.equal(await read(() => window.fixtureApp.coffeeScene.report().cups), 8, 'a fresh set of coffees');
  assert.deepEqual(errors, []);
  console.log('PASS 3D Timmies run: the briefing link, Termite, Skanky with two trays, Brian and Doris in the roofless car, eight donut boxes, real-key tilting, pause, warnings, the card and AGAIN; no script errors');
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
