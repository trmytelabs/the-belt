import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

// The mall run on its own (?minigame=mall): the briefing link, the practice briefing's two starts, the whole run from
// the truck to its card (no drive back to UPS) and AGAIN; back to the briefing, START AT BENTLEY on run 4 with six
// stores signed, Bentley's loads taken with real keys, the getaway and its card; then a run shot down, whose GAME OVER
// plays the practice again; and the B key's start. The mall itself (the questions, the chase, the ambulance) is played
// by the mall chase suite.
const shots = process.env.BELT_SCREENSHOT_DIR;
const server = process.env.BELT_TEST_BASE_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
    args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
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
  const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, `mall-practice-${name}.png`) }); };
  const hud = (pattern) => wait((source) => new RegExp(source).test(document.querySelector('.b3d-chapterhud')?.textContent ?? ''), pattern.source);
  const mallState = () => read(() => {
    const { mall } = window.fixtureApp;
    return { run: mall.run, signed: mall.signatures, delivered: mall.delivered, truck: mall.truckBundles.filter((id) => id !== null), down: mall.down };
  });
  /** ESC, END NIGHT and END NIGHT again: back to the practice's own briefing. */
  const endToBriefing = async () => {
    await page.keyboard.press('Escape');
    await wait(() => window.fixtureApp.state === 'paused');
    await page.locator('.b3d-panel button[data-action="end"]').click();
    await wait(() => /END THIS NIGHT\?/.test(document.querySelector('.b3d-panel')?.textContent ?? ''));
    await page.locator('.b3d-panel button[data-action="end"]').click();
    await wait(() => window.fixtureApp.state === 'briefing');
    assert.match(await page.locator('.b3d-panel').innerText(), /THE MALL RUN\.[\s\S]*START AT BENTLEY/);
  };

  // The night's briefing offers it.
  await page.goto(new URL('?mode=3d', base).href);
  await wait(() => window.fixtureApp?.state === 'briefing');
  assert.match(await page.locator('a', { hasText: 'TRY THE MALL RUN' }).getAttribute('href'), /\?mode=3d&minigame=mall$/);
  assert.match(await page.locator('a', { hasText: 'TRY THE MALL RUN' }).innerText(), /SKANKY'S DELIVERIES/);

  // Its own briefing: the run, Bentley's refusal and security, and two starts.
  await page.goto(new URL('?mode=3d&minigame=mall', base).href);
  await wait(() => window.fixtureApp?.state === 'briefing');
  const briefing = await page.locator('.b3d-panel').innerText();
  assert.match(briefing, /THE MALL RUN\.[\s\S]*four runs, seven stores[\s\S]*BENTLEY won't sign[\s\S]*Mall security/, briefing);
  assert.deepEqual((await page.locator('.b3d-panel button').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim()), ['START THE MALL RUN ↵', 'START AT BENTLEY B']);
  assert.match(await page.locator('.b3d-panel a', { hasText: 'PLAY THE FULL NIGHT' }).getAttribute('href'), /\?mode=3d$/);
  await shot('briefing');

  // ENTER: the whole run, from the truck at the dock.
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'mall');
  assert.deepEqual(await mallState(), { run: 0, signed: 0, delivered: 0, truck: await read(() => window.fixtureApp.mall.stores.flatMap((store) => store.id === 'bentley' ? ['bentley', 'bentley'] : [store.id])), down: null });
  await hud(/RUN\s*1 \/ 4[\s\S]*SIGNED\s*0 \/ 7/);
  // Through to the close-up: every store signed, the cart back at the truck, Skanky at the tailgate; SPACE stows it.
  await read(() => {
    const { mall } = window.fixtureApp;
    for (const store of mall.stores) store.state = 'signed';
    mall.truckBundles.forEach((_, slot) => { mall.truckBundles[slot] = null; });
    Object.assign(mall, { signatures: 7, delivered: 7, run: 3, bentley: 'returned' });
    Object.assign(mall.cart, { x: 130, y: 400, pushed: false, facing: 'up', load: [] });
    Object.assign(mall.skanky, { x: 75, y: 400 });
  });
  await hud(/STOW CART & CLOSE UP/);
  await page.keyboard.press('Space');
  // No drive back to UPS: the card, over the mall.
  await wait(() => window.fixtureApp.state === 'mall-done');
  let card = await page.locator('.b3d-panel.docked').innerText();
  assert.match(card, /THE MALL RUN · SKANKY'S DELIVERIES[\s\S]*EVERY STORE SIGNED\.[\s\S]*7 of 7 delivered · 7 of 7 signed[\s\S]*7 × 50 · \+350[\s\S]*AGAIN[\s\S]*PLAY THE FULL NIGHT/, card);
  assert.equal(await read(() => window.fixtureApp.mallBonus), 350);
  await page.waitForTimeout(800);
  assert.deepEqual(await read(() => [window.fixtureApp.state, window.fixtureApp.cutscene, window.fixtureApp.stage.active]), ['mall-done', null, 'mall'], 'the card stays over the mall');
  await shot('card');
  // AGAIN: the run again, from the truck.
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'mall' && window.fixtureApp.mall.signatures === 0);
  assert.equal(await page.locator('.b3d-panel').count(), 0);
  assert.deepEqual((await mallState()).run, 0);

  // Back to the briefing; START AT BENTLEY: run 4, the six other stores signed, both Bentley loads in the truck.
  await endToBriefing();
  await page.locator('.b3d-panel button[data-action="bentley"]').click();
  await wait(() => window.fixtureApp.state === 'mall');
  assert.deepEqual(await mallState(), { run: 3, signed: 6, delivered: 6, truck: ['bentley', 'bentley'], down: null });
  assert.deepEqual(await read(() => window.fixtureApp.mall.stores.filter((store) => store.state === 'signed').length), 6);
  await hud(/RUN\s*4 \/ 4[\s\S]*DELIVERED\s*6 \/ 7[\s\S]*SIGNED\s*6 \/ 7/);
  await hud(/TAKE BENTLEY/);
  await shot('bentley-start');
  // Both loads onto the cart with real keys: SPACE takes one, SPACE loads it.
  for (let load = 1; load <= 2; load++) {
    await page.keyboard.press('Space');
    await wait(() => window.fixtureApp.mall.carrying === 'bentley');
    await page.keyboard.press('Space');
    await wait((count) => window.fixtureApp.mall.cart.load.length === count, load);
  }
  await hud(/push the full cart to BENTLEY/);
  // On to the chase (played in full by the mall chase suite): the box grabbed, shoved at Bentley on the run, then the
  // getaway into the five-ton.
  await read(() => {
    const { mall } = window.fixtureApp;
    mall.store('bentley').state = 'dropped';
    Object.assign(mall, { delivered: 7, bentley: 'denied' });
    Object.assign(mall.cart, { x: 1230, y: 420, pushed: false, facing: 'up', load: [] });
    mall.decide('grab');
    Object.assign(mall.chase, { guard: { x: 2400, y: 760, moving: false }, path: [], elapsedMs: 0, cooldownMs: 5000 });
    Object.assign(mall.skanky, { x: 1246, y: 452 });
  });
  await hud(/SHOVE THE BOX AT BENTLEY/);
  await page.keyboard.press('Space');
  await wait(() => window.fixtureApp.mall.chase?.delivered === true);
  await read(() => {
    const { mall } = window.fixtureApp;
    Object.assign(mall.chase, { elapsedMs: 0, cooldownMs: 5000 });
    Object.assign(mall.skanky, { x: 140, y: 400 });
  });
  await page.keyboard.down('KeyA');
  await wait(() => window.fixtureApp.mall.finished);
  await page.keyboard.up('KeyA');
  await wait(() => window.fixtureApp.state === 'mall-done');
  card = await page.locator('.b3d-panel.docked').innerText();
  assert.match(card, /GOT AWAY WITH IT\.[\s\S]*7 of 7 delivered · 7 of 7 signed[\s\S]*7 × 50 \+ 100 for the getaway · \+450[\s\S]*AGAIN/, card);
  assert.deepEqual(await read(() => [window.fixtureApp.mall.getaway, window.fixtureApp.mallBonus]), ['escaped', 450]);
  // AGAIN keeps the start: Bentley's run again.
  await page.locator('.b3d-panel.docked button', { hasText: 'AGAIN' }).click();
  await wait(() => window.fixtureApp.state === 'mall' && !window.fixtureApp.mall.finished);
  assert.deepEqual(await mallState(), { run: 3, signed: 6, delivered: 6, truck: ['bentley', 'bentley'], down: null });

  // Shot on the chase: GAME OVER, and its button plays the practice again rather than a full night.
  await read(() => {
    const { mall } = window.fixtureApp;
    mall.store('bentley').state = 'dropped';
    mall.truckBundles.forEach((_, slot) => { mall.truckBundles[slot] = null; });
    Object.assign(mall, { delivered: 7, bentley: 'denied' });
    mall.decide('grab');
    Object.assign(mall.skanky, { x: 1700, y: 824 });
    Object.assign(mall.chase, { guard: { x: 1450, y: 824, moving: false }, path: [], elapsedMs: 1000, cooldownMs: 0 });
  });
  await wait(() => window.fixtureApp.mall.down !== null);
  await read(() => { window.fixtureApp.mall.down.ms = 16400; });
  await wait(() => window.fixtureApp.state === 'ended');
  card = await page.locator('.b3d-panel').innerText();
  assert.match(card, /GAME OVER[\s\S]*ambulance took him away[\s\S]*AGAIN[\s\S]*PLAY THE FULL NIGHT/, card);
  assert.doesNotMatch(card, /ANOTHER NIGHT/);
  await shot('game-over');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'mall' && window.fixtureApp.mall.down === null);
  assert.deepEqual(await mallState(), { run: 3, signed: 6, delivered: 6, truck: ['bentley', 'bentley'], down: null });
  assert.equal(await page.locator('.b3d-panel').count(), 0);

  // The B key starts at Bentley too.
  await endToBriefing();
  await page.keyboard.press('KeyB');
  await wait(() => window.fixtureApp.state === 'mall');
  assert.deepEqual(await mallState(), { run: 3, signed: 6, delivered: 6, truck: ['bentley', 'bentley'], down: null });
  assert.deepEqual(errors, []);
  console.log('PASS 3D mall practice: the briefing link, two starts, the whole run from the truck to its card with no drive back and AGAIN, START AT BENTLEY on run 4 with six signed, both loads by real keys, the getaway card (+450), GAME OVER playing the practice again, and the B key; no script errors');
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
