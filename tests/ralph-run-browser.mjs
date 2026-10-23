import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';

// The Ralph run, Termite's five-ton paper route with Ralph: on its own (?minigame=ralph) by real keys, and in the
// night, from the choice after the shift through to clocking out.
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

  await page.goto(new URL('?mode=3d&minigame=ralph', base).href);
  await wait(() => window.fixtureApp?.state === 'briefing');
  assert.match(await page.locator('.b3d-panel').innerText(), /THE RALPH RUN\.[\s\S]*Ralph is riding along[\s\S]*START/);
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'paper');
  // Eight businesses' marks in the city, the drive's own guides hidden (from the first frame of the run), the five-ton.
  await wait(() => window.fixtureApp.drivingView.navigation.root.visible === false);
  const setup = await read(() => {
    const app = window.fixtureApp, view = app.drivingView;
    return { stops: view.scene.getObjectByName('ralph-run')?.children.filter((child) => child.name.startsWith('ralph-stop:')).length,
      arrow: view.navigation.root.visible, truck: view.truck.visible, parcels: app.ralph.parcelsLeft };
  });
  assert.deepEqual(setup, { stops: 8, arrow: false, truck: true, parcels: 12 });
  await wait(() => /STOPS\s*0 \/ 8[\s\S]*PARCELS\s*12/.test(document.querySelector('.b3d-chapterhud')?.textContent ?? ''));
  // Down the x = −60 street in the right-hand lane toward the barber on the right; F, real key, a little before it.
  await read(() => { Object.assign(window.fixtureApp.driving, { x: -56.5, z: 62, heading: Math.PI / 2, speed: 8 }); });
  // The truck coasts, slowing: F goes when a parcel thrown now would land on the mark (the window 1.4 m ahead of the
  // truck's middle, the parcel carried on at the truck's speed for its flight).
  await wait(() => { const d = window.fixtureApp.driving; return d.z - 1.4 - d.speed * 0.55 <= 45.4; }, null, { polling: 2 });
  await page.keyboard.press('KeyF');
  await wait(() => window.fixtureApp.ralph.delivered === 1);
  assert.equal(await read(() => window.fixtureApp.ralph.stops[0].name), 'BARBER');
  // The HUD's next stop follows the loop: the pizza place, on the left.
  await wait(() => /NEXT: PIZZA[\s\S]*on your LEFT/.test(document.querySelector('.b3d-chapterhud .objective')?.textContent ?? ''));
  // Ralph talks over the cab.
  await wait(() => window.fixtureApp.overlay.activeSpeech().some((speech) => speech.speaker === 'RALPH' && /three sets of triplets/.test(speech.text)));
  // ESC pauses the run where it is.
  await page.keyboard.press('Escape');
  await wait(() => window.fixtureApp.state === 'paused');
  const paused = await read(() => window.fixtureApp.ralph.elapsedMs);
  await page.waitForTimeout(500);
  assert.equal(await read(() => window.fixtureApp.ralph.elapsedMs), paused, 'paused, the clock stands still');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'paper');
  // Out of time: the card counts the deliveries, and AGAIN drives the loop again.
  await read(() => { window.fixtureApp.ralph.elapsedMs = 119_990; });
  await wait(() => window.fixtureApp.state === 'ralph-done');
  assert.match(await page.locator('.b3d-panel').innerText(), /THE RALPH RUN · OUT OF TIME[\s\S]*1 OF 8 DELIVERED[\s\S]*\+(50|75)[\s\S]*AGAIN/);
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'paper' && window.fixtureApp.ralph.delivered === 0 && window.fixtureApp.ralph.elapsedMs < 2000);
  console.log('PASS 3D Ralph run: the briefing, eight businesses, a real-key throw delivered to the barber, the next stop along the loop, Ralph talking, pause, the card and AGAIN; no script errors');

  // In the night: after the shift the choice offers Termite's run with Ralph (R); its card clocks out into the ending.
  await page.goto(new URL('?mode=3d', base).href);
  await wait(() => window.fixtureApp?.state === 'briefing');
  assert.equal(await page.locator('a', { hasText: 'TRY THE RALPH RUN' }).getAttribute('href'), '/?mode=3d&minigame=ralph');
  await read(() => { const app = window.fixtureApp; app.overlay.clearCenter(); app.showRunChoice(); });
  await wait(() => window.fixtureApp.state === 'run-choice');
  await page.keyboard.press('KeyR');
  await wait(() => window.fixtureApp.state === 'paper' && window.fixtureApp.story.chapter === 'ralph');
  await read(() => { const run = window.fixtureApp.ralph; for (const stop of run.stops) stop.delivered = true; run.points = 400; });
  await wait(() => window.fixtureApp.state === 'ralph-done');
  const card = await page.locator('.b3d-panel').innerText();
  assert.match(card, /EVERY STOP SERVED[\s\S]*EIGHT FOR EIGHT\.[\s\S]*CLOCK OUT/);
  assert.ok(await read(() => window.fixtureApp.ralphResult.points > 400), 'seconds to spare pay');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'go-home');
  assert.deepEqual(errors, []);
  console.log('PASS 3D Ralph run in the night: the choice after the shift, R for Termite\'s run, every stop served, and CLOCK OUT into the drive home; no script errors');
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
