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
    const kylie = app.crew.actors.get('kylie').root;
    const head = kylie.position.clone();
    head.y += app.crew.actors.get('kylie').character.headHeight + 0.35;
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

  // John Rushton's scheduled visit follows on the ordinary clock: he yells, then crouches.
  await page.waitForFunction(() => window.fixtureApp.overlay.history.includes("JOHN RUSHTON: DON'T STACK BOXES ON BOXES!"), null, { timeout: 120_000 });
  await page.waitForFunction(() => window.fixtureApp.crew.actors.get('john').pose === 'shout');
  await page.waitForFunction(() => window.fixtureApp.crew.actors.get('john').pose === 'crouch', null, { timeout: 60_000 });

  // A brake brings Shan out for his first original rant.
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.fixtureApp.overlay.activeSpeech().some((item) => item.speaker === 'SHAN O MACK'));
  assert.equal(await read(() => window.fixtureApp.overlay.activeSpeech().find((item) => item.speaker === 'SHAN O MACK').text), '!@#%!');
  assert.equal(await read(() => window.fixtureApp.crew.actors.get('shan').root.visible), true);
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

  // Crew routines. Later cues use a synthetic shift clock, as the 2D reference
  // suite does; belt freight is cleared so a slow software renderer cannot
  // fail the shift while it waits. The routines themselves run unmodified.
  const clearFreight = () => read(() => {
    for (const parcel of window.fixtureApp.model.packages) {
      if (parcel.state === 'belt' || parcel.state === 'missed') parcel.state = 'delivered';
    }
  });
  const jump = async (ms) => { await clearFreight(); await read((t) => { window.fixtureApp.model.elapsedMs = t; }, ms); };
  const spoken = (copy) => page.waitForFunction((line) => window.fixtureApp.overlay.history.includes(line), copy, { timeout: 60_000 });
  const crew = (fn, arg) => read(fn, arg);

  // Doris's freight trip: she carries a parcel from the belt side to her truck.
  await jump(15_700);
  await page.waitForFunction(() => window.fixtureApp.crew.actors.get('doris').carrying, null, { timeout: 60_000 });

  await jump(23_400);
  await spoken('VIC: I NEED A QUICK TUNE UP');
  await jump(25_200);
  await page.waitForFunction(() => window.fixtureApp.crew.massageStage === 'lying');
  assert.equal(await crew(() => window.fixtureApp.crew.actors.get('aj').pose), 'massage', 'AJ massages Vic');
  assert.equal(await crew(() => window.fixtureApp.crew.towel.visible), true, 'Vic lies under a towel');

  await jump(39_900);
  await spoken('HUSSAN: THE SNAKES CELL!');
  await page.waitForFunction(() => window.fixtureApp.crew.snakeState === 'dancing', null, { timeout: 90_000 });
  assert.deepEqual(await crew(() => ({ held: window.fixtureApp.crew.cellCaption.visible, belt: window.fixtureApp.crew.cell.tag.visible })),
    { held: true, belt: false }, 'the belt label THE SNAKES CELL becomes the held CELL label');
  await page.waitForFunction(() => window.fixtureApp.crew.snakeState === 'done', null, { timeout: 90_000 });

  await jump(114_100);
  await page.waitForFunction(() => window.fixtureApp.crew.drivers.filter((driver) => driver.root.visible).length === 10);
  for (const [index, line] of ['COUGH!', 'HACK!', 'COUGH COUGH!', 'UGH, EXHAUST!'].entries()) {
    await jump(116_000 + index * 3000 - 50);
    await spoken(`${index % 2 === 0 ? 'HUSSAN' : 'DORIS'}: ${line}`);
  }
  assert.equal(await crew(() => window.fixtureApp.crew.drivers.some((driver) => driver.root.visible)), false, 'drivers board their trucks');

  await jump(133_900);
  await spoken('SHAN O MACK: TERMITE AND SKANKY HAVE BOTH WON A FREE PAID DAY OFF FROM UNITED WAY');
  await jump(135_900);
  await page.waitForFunction(() => window.fixtureApp.crew.ensemble.size === 8);
  const swears = [['HUSSAN', 'WHAT THE FUCK'], ['FRUIT LOOP', 'BULLSHIT'], ['AJ', 'YOU GOTTA BE FUCKING KIDDING'],
    ['DORIS', 'FUCK THIS'], ['BANNERMAN', 'ARE YOU FUCKING SERIOUS'], ['DONNA', 'SON OF A BITCH']];
  for (const [index, [who, line]] of swears.entries()) {
    if (index % 2 === 0) await jump(138_600 + index / 2 * 3500 - 50);
    await spoken(`${who}: ${line}`);
  }
  await jump(149_050);
  await spoken('BRIAN: WHAT THE FUCK');

  // Receiving: the dockhand stands at the intake while unloaders feed the line.
  const dockhand = await crew(() => window.fixtureApp.crew.dockhand.root.position.x);
  assert.ok(Math.abs(dockhand - (430 - 480) / 32) < 0.01, 'the dockhand stands beside the intake');

  // A winning clock-out: lines, celebration and every truck departing.
  const truckStart = await crew(() => window.fixtureApp.world.trucks.map((truck) => truck.group.position.x));
  await read(() => {
    const m = window.fixtureApp.model;
    for (const parcel of m.packages) if (parcel.state !== 'delivered') parcel.state = 'delivered';
    m.sorted = m.goal;
    m.elapsedMs = m.durationMs - 20;
  });
  await page.waitForFunction(() => window.fixtureApp.state === 'celebrating', null, { timeout: 30_000 });
  await spoken('TERMITE: SHIFT DONE!');
  await spoken('SKANKY: CLOCKED OUT!');
  if (process.env.BELT_SCREENSHOT_DIR) await page.waitForTimeout(1500);
  for (const line of ['WE MADE IT!', 'GO HOME!', 'CLOCK OUT!', 'SHIFT DONE!', 'TRUCKS OUT!', "BELT'S DEAD!", 'WE SURVIVED!', 'LAST TRUCK OUT!']) {
    await page.waitForFunction((copy) => window.fixtureApp.overlay.history.some((entry) => entry.endsWith(`: ${copy}`) && !entry.startsWith('TERMITE') && !entry.startsWith('SKANKY')), line, { timeout: 120_000 });
  }
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-clockout.png') });
  const truckEnd = await crew(() => window.fixtureApp.world.trucks.map((truck) => truck.group.position.x));
  truckEnd.forEach((x, index) => assert.ok(Math.abs(x - truckStart[index]) > 4, `truck ${index} must drive out`));
  await page.waitForFunction(() => window.fixtureApp.state === 'ended', null, { timeout: 120_000 });
  assert.match(await page.locator('.b3d-panel').innerText(), /SHIFT COMPLETE \/ GRADE/);
  assert.deepEqual(errors, []);
  console.log('PASS 3D crew routines: John, freight trip, massage/towel, CELL dance, drivers/exhaust/coughs, United Way ensemble and swears, dockhand, clock-out lines and departures; no script errors');
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
  await server.close();
}
