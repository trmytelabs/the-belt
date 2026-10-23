import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';

// Online play between two tabs of one browser (?online=local: a BroadcastChannel stands in for PeerJS and WebRTC, with
// no picture or voice): the host opens a room from PLAY ONLINE and plays Termite; the joining page plays Skanky. The game
// online is the belt, endless (with no finished night needed): the joining player's keys work Skanky (player 2); either
// can pause; the joining page shows whether Skanky is on the belt.
const server = process.env.BELT_TEST_BASE_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
    args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '' }));
  await context.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  const base = process.env.BELT_TEST_BASE_URL ?? server.resolvedUrls.local[0];
  const errors = [];
  const host = await context.newPage();
  host.on('pageerror', (error) => errors.push(`host: ${error.message}`));
  await host.addInitScript(() => {
    window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; event.detail.playPrologue = false; });
  });
  const read = (page, fn, arg) => page.evaluate(fn, arg);
  const wait = (page, fn, arg, options = {}) => page.waitForFunction(fn, arg, { polling: 10, timeout: 90_000, ...options });

  // The host: PLAY ONLINE (O), HOST · I'M TERMITE, a room and its link.
  await host.goto(new URL('?mode=3d&online=local', base).href);
  await wait(host, () => window.fixtureApp?.state === 'briefing');
  assert.match(await host.locator('.b3d-panel').innerText(), /PLAY ONLINE/);
  await host.keyboard.press('KeyO');
  await wait(host, () => document.querySelector('.b3d-panel button[data-action="host"]'));
  assert.match(await host.locator('.b3d-panel').innerText(), /TERMITE AND SKANKY, ONLINE[\s\S]*PeerJS/);
  await host.locator('.b3d-panel button[data-action="host"]').click();
  await wait(host, () => document.querySelector('[data-online-panel]'));
  const code = await read(host, () => window.fixtureApp.online.code);
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.match(await host.locator('.b3d-panel').innerText(), new RegExp(`ROOM ${code}[\\s\\S]*join=${code}[\\s\\S]*Waiting for Skanky`));

  // The joining page: no game engine, the code filled in from the link, JOIN AS SKANKY.
  const guest = await context.newPage();
  guest.on('pageerror', (error) => errors.push(`guest: ${error.message}`));
  await guest.goto(new URL(`?mode=3d&online=local&join=${code}`, base).href);
  await wait(guest, () => document.querySelector('.b3g-card input'));
  assert.equal(await guest.locator('.b3g-card input').inputValue(), code);
  assert.equal(await read(guest, () => typeof window.fixtureApp), 'undefined', 'the joining page runs no game of its own');
  await guest.locator('.b3g-card button').click();
  await wait(host, () => window.fixtureApp.online.joined);
  await wait(host, () => /SKANKY HAS JOINED/.test(document.querySelector('.b3d-panel')?.textContent ?? ''));
  await wait(guest, () => /BETWEEN SHIFTS/.test(document.querySelector('.b3g-turn')?.textContent ?? ''));
  assert.match(await host.locator('.b3d-panel').innerText(), /START THE ENDLESS SHIFT/);
  assert.equal(await host.locator('.b3d-panel button[data-action="play"]').count(), 0, 'no story, no JUST PLAY: the belt only');

  // START THE ENDLESS SHIFT (ENTER): the belt, endless, with the joining player as Skanky, player 2; no night finished
  // on this browser, and no story.
  assert.equal(await read(host, () => window.fixtureApp.record.completed), 0);
  await host.keyboard.press('Enter');
  await wait(host, () => window.fixtureApp.state === 'playing', null, { timeout: 120_000 });
  assert.deepEqual(await read(host, () => [window.fixtureApp.model.coop, window.fixtureApp.model.endless]), [true, true]);
  await wait(guest, () => /THE BELT · you are Skanky, player 2/.test(document.querySelector('.b3g-turn')?.textContent ?? ''));
  await wait(host, () => /TERMITE \+ SKANKY/.test(document.querySelector('.b3d-online-chip')?.textContent ?? ''));
  const partner = () => read(host, () => ({ x: window.fixtureApp.model.partnerWorker.x, y: window.fixtureApp.model.partnerWorker.y }));
  const start = await partner();
  await guest.keyboard.down('ArrowLeft');
  await wait(host, (x) => window.fixtureApp.model.partnerWorker.x < x - 20, start.x);
  await guest.keyboard.up('ArrowLeft');
  // Either player can pause; the joining player carries on.
  await guest.keyboard.press('Escape');
  await wait(host, () => window.fixtureApp.state === 'paused');
  await wait(guest, () => /PAUSED/.test(document.querySelector('.b3g-turn')?.textContent ?? ''));
  await guest.keyboard.press('Escape');
  await wait(host, () => window.fixtureApp.state === 'playing');
  // Keys outside the belt's (the mall's answers, the host's mute) never reach the host.
  await guest.keyboard.press('Digit1');
  await guest.keyboard.press('KeyM');
  assert.deepEqual(await read(host, () => [window.fixtureApp.state, window.fixtureApp.audio.muted]), ['playing', false]);
  assert.deepEqual(errors, []);
  console.log('PASS online between two tabs: the host opens a room from PLAY ONLINE, the joining page (no engine) joins as Skanky, the room starts the endless belt with no unlock or story, the joining player works player 2, pauses and resumes the shift, and keys outside the belt never reach the host');
} finally {
  await browser?.close();
  await server?.httpServer.close();
}
