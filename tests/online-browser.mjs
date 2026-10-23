import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';

// Online play between two tabs of one browser (?online=local: a BroadcastChannel stands in for PeerJS and WebRTC, with
// no picture or voice): the host opens a room from PLAY ONLINE and plays Termite; the joining page plays Skanky. On the
// belt the joining player's keys work Skanky (player 2); in the mall run they move Skanky and the host's own keys do
// not; either can pause; the joining page shows whose turn it is.
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
  await wait(guest, () => /TERMITE IS ON THE MENU/.test(document.querySelector('.b3g-turn')?.textContent ?? ''));

  // JUST PLAY: the belt, with the joining player as Skanky, player 2.
  await host.locator('.b3d-panel button[data-action="play"]').click();
  await wait(host, () => window.fixtureApp.state === 'playing', null, { timeout: 120_000 });
  assert.equal(await read(host, () => window.fixtureApp.model.coop), true);
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

  // The mall run is Skanky's: the joining player moves him, and the host's own keys leave him be.
  await read(host, () => { const app = window.fixtureApp; app.model.paused = true; app.story.go('mall'); app.beginMall(); });
  await wait(host, () => window.fixtureApp.state === 'mall');
  await wait(guest, () => /YOUR TURN · you're Skanky/.test(document.querySelector('.b3g-turn')?.textContent ?? ''));
  await wait(host, () => /SKANKY'S TURN/.test(document.querySelector('.b3d-online-chip')?.textContent ?? ''));
  const skanky = () => read(host, () => window.fixtureApp.mall.skanky.x);
  const before = await skanky();
  await host.keyboard.down('KeyD');
  await host.waitForTimeout(400);
  await host.keyboard.up('KeyD');
  assert.equal(await skanky(), before, "the host's keys do not move Skanky on his turn");
  await guest.keyboard.down('KeyD');
  await wait(host, (x) => window.fixtureApp.mall.skanky.x > x + 20, before);
  await guest.keyboard.up('KeyD');
  assert.deepEqual(errors, []);
  console.log('PASS online between two tabs: the host opens a room from PLAY ONLINE, the joining page (no engine) joins as Skanky, works player 2 on the belt, pauses and resumes the night, and moves Skanky in the mall run while the host\'s own keys cannot');
} finally {
  await browser?.close();
  await server?.httpServer.close();
}
