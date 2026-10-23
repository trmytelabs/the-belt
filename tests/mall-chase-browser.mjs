import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

// The Bentley run's security desk and chase in the real app: the guard's questions on a docked card answered with real
// keys, a wrong answer and the choice it leaves, grabbing the box, the guard's pistol, aim and shot, the hit on the HUD,
// the box shoved at Bentley on the run, and the getaway into the five-ton in the results. The run up to the refusal,
// and the right answers, are played by the story suite.
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
  const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, `mall-chase-${name}.png`) }); };
  const card = () => page.locator('.b3d-panel.docked').innerText();

  await page.goto(new URL('?mode=3d', base).href);
  await wait(() => window.fixtureApp?.state === 'briefing');
  // Straight to the mall's fourth run: six stores signed, Bentley's loads dropped and the signature refused; Skanky at
  // the security desk down the hallway. Every sound is noted.
  await read(() => {
    const app = window.fixtureApp;
    app.overlay.clearCenter();
    app.story.go('mall');
    app.beginMall();
    window.played = [];
    const play = app.audio.play.bind(app.audio);
    app.audio.play = (effect, ...rest) => { window.played.push(effect); return play(effect, ...rest); };
  });
  await wait(() => window.fixtureApp.state === 'mall');
  await read(() => {
    const mall = window.fixtureApp.mall;
    for (const store of mall.stores) store.state = store.id === 'bentley' ? 'dropped' : 'signed';
    mall.truckBundles.forEach((_, slot) => { mall.truckBundles[slot] = null; });
    Object.assign(mall, { signatures: 6, delivered: 7, run: 3, bentley: 'refused' });
    Object.assign(mall.cart, { x: 1230, y: 420, pushed: false, facing: 'up' });
    Object.assign(mall.skanky, { x: 2330, y: 799 });
  });
  await wait(() => /ASK ABOUT THE MISSING BOX/.test(document.querySelector('.b3d-chapterhud')?.textContent ?? ''));

  // The questions: a docked card, three answers, Skanky held at the desk and sweating.
  await page.keyboard.press('Space');
  await wait(() => document.querySelector('.b3d-panel.docked')?.textContent.includes('QUESTION 1 OF 3'));
  assert.equal(await page.locator('.b3d-panel.docked button').count(), 3);
  assert.match(await card(), /MALL SECURITY · QUESTION 1 OF 3[\s\S]*PRESS 1, 2 OR 3/);
  await wait(() => window.fixtureApp.overlay.history.some((line) => /SECURITY: LOST AND FOUND\?/.test(line)));
  await wait(() => window.fixtureApp.stage.stages.mall.props.sweat.children.some((drop) => drop.visible));
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(200);
  await page.keyboard.up('KeyA');
  assert.deepEqual(await read(() => ({ x: window.fixtureApp.mall.skanky.x, y: window.fixtureApp.mall.skanky.y })), { x: 2330, y: 799 }, 'held at the desk');
  await shot('question');
  // A right answer by its number key, then a wrong one: the guard keeps the box.
  await page.keyboard.press(`Digit${await read(() => window.fixtureApp.mall.question.answer) + 1}`);
  await wait(() => window.fixtureApp.mall.quiz?.index === 1);
  await wait(() => document.querySelector('.b3d-panel.docked')?.textContent.includes('QUESTION 2 OF 3'));
  await page.keyboard.press(`Digit${(await read(() => window.fixtureApp.mall.question.answer) + 1) % 3 + 1}`);
  await wait(() => window.fixtureApp.mall.bentley === 'denied');
  await wait(() => /HE WON'T HAND IT OVER/.test(document.querySelector('.b3d-panel.docked')?.textContent ?? ''));
  assert.match(await card(), /1 · GRAB IT AND RUN[\s\S]*2 · ASK AGAIN/);
  await shot('denied');

  // 1: grab it and run. The card goes, the HUD counts hits, the guard yells and draws.
  await page.keyboard.press('Digit1');
  await wait(() => window.fixtureApp.mall.chase !== null);
  await wait(() => !document.querySelector('.b3d-panel.docked'));
  await wait(() => /HITS\s*0 \/ 3/.test(document.querySelector('.b3d-chapterhud')?.textContent ?? ''));
  await wait(() => window.fixtureApp.overlay.history.some((line) => /SECURITY: HEY! THAT'S LOST PROPERTY!/.test(line)));
  await wait(() => window.fixtureApp.stage.stages.mall.props.guardGun.visible);
  assert.ok(await read(() => window.played.includes('warning')), 'the alarm');
  // Down the hallway with the guard behind on the same line: his aim shows on the floor, and standing on it is a hit.
  await read(() => {
    const { mall } = window.fixtureApp;
    Object.assign(mall.skanky, { x: 1700, y: 824 });
    Object.assign(mall.chase, { guard: { x: 1450, y: 824, moving: false }, path: [], elapsedMs: 1000, cooldownMs: 0 });
  });
  await wait(() => window.fixtureApp.mall.chase.aim !== null);
  await wait(() => window.fixtureApp.stage.stages.mall.props.guardAim.visible);
  await shot('aim');
  await wait(() => window.fixtureApp.mall.chase.hits === 1);
  await wait(() => window.played.includes('gunshot'));
  await wait(() => /HITS\s*1 \/ 3/.test(document.querySelector('.b3d-chapterhud')?.textContent ?? ''));
  await shot('hit');

  // The box shoved at Bentley on the run (signed at once, with no idea what is going on), then into the five-ton.
  await read(() => {
    const { mall } = window.fixtureApp;
    Object.assign(mall.chase, { guard: { x: 2400, y: 760, moving: false }, path: [], elapsedMs: 0, cooldownMs: 5000 });
    Object.assign(mall.skanky, { x: 1246, y: 452 });
  });
  await wait(() => /SHOVE THE BOX AT BENTLEY/.test(document.querySelector('.b3d-chapterhud')?.textContent ?? ''));
  await page.keyboard.press('Space');
  await wait(() => window.fixtureApp.mall.chase?.delivered === true);
  assert.equal(await read(() => window.fixtureApp.mall.signatures), 7);
  await wait(() => window.fixtureApp.overlay.history.some((line) => /BENTLEY CLERK: WHAT IS GOING ON\?!/.test(line)));
  await read(() => {
    const { mall } = window.fixtureApp;
    Object.assign(mall.chase, { elapsedMs: 0, cooldownMs: 5000 });
    Object.assign(mall.skanky, { x: 140, y: 400 });
  });
  await page.keyboard.down('KeyA');
  await wait(() => window.fixtureApp.mall.finished);
  await page.keyboard.up('KeyA');
  assert.deepEqual(await read(() => [window.fixtureApp.mall.getaway, window.fixtureApp.mallBonus]), ['escaped', 450], 'seven signatures and the getaway');
  await wait(() => window.fixtureApp.state !== 'mall');
  assert.deepEqual(errors, []);
  console.log('PASS mall security asks three questions on a docked card answered by real keys, a wrong answer offers grab-and-run or ask again, and the chase draws the gun, shows the aim, hits, signs Bentley on the run and gets away into the five-ton for +450');
} finally {
  await browser?.close();
  await server?.httpServer.close();
}
