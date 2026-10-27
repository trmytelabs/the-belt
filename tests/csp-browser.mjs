import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { preview } from 'vite';

// The live site (https://thebelt.fun) sends the Content-Security-Policy in deploy/container.Caddyfile. This serves
// the production bundle with that same policy and loads the 3D game, a shipped character model with its embedded
// textures, and the original game, failing on any violation. On 2026-10-27 the policy blocked the models' textures
// (three.js fetches them from blob: URLs) and the crew drew untextured grey; nothing else served the game under it.
const caddyfile = readFileSync(new URL('../deploy/container.Caddyfile', import.meta.url), 'utf8');
const policy = caddyfile.match(/Content-Security-Policy "([^"]+)"/)?.[1];
assert.ok(policy, 'deploy/container.Caddyfile sets a Content-Security-Policy');

const server = await preview({ preview: { host: '127.0.0.1', port: 0, headers: { 'Content-Security-Policy': policy } }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const executable = process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' };
const browser = await chromium.launch({
  headless: true, ...executable,
  args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  const blocked = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (/Content Security Policy|Couldn't load texture/.test(message.text())) blocked.push(message.text()); });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.cspViolations.push(`${event.effectiveDirective} blocked ${event.blockedURI}`);
    });
    window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; event.detail.playPrologue = false; });
    let phaser;
    Object.defineProperty(window, 'Phaser', {
      configurable: true,
      get: () => phaser,
      set: (value) => {
        phaser = value;
        const boot = value.Game.prototype.boot;
        value.Game.prototype.boot = function (...args) { window.fixtureGame = this; return boot.apply(this, args); };
      },
    });
  });
  const violations = () => page.evaluate(() => window.cspViolations);

  // The 3D game, with a shipped crew model attached whatever the renderer (software renderers skip them otherwise).
  const response = await page.goto(`${url}?mode=3d`);
  assert.equal(response.headers()['content-security-policy'], policy, 'the page is served under the production policy');
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 60_000 });
  await page.evaluate(() => window.fixtureApp.useCharacterModels([{ names: ['TERMITE', 'SKANKY'], url: '/models/characters/termite.glb', skinMaterial: /head/i }]));
  await page.waitForFunction(() => Object.values(window.fixtureApp.workers).every((worker) => worker.root.getObjectByName('character-model')), null, { timeout: 60_000 });
  const textures = await page.evaluate(() => {
    const maps = [];
    window.fixtureApp.workers.termite.root.getObjectByName('character-model').traverse((child) => {
      for (const material of [child.material].flat()) {
        if (child.isMesh && material?.map) maps.push(Boolean(material.map.image) && material.map.image.width > 0);
      }
    });
    return maps;
  });
  assert.ok(textures.length > 0, "the crew model's materials have their textures (blocked textures leave none)");
  assert.ok(textures.every(Boolean), 'every texture decoded');
  assert.deepEqual(await violations(), [], 'the 3D game breaks no part of the policy');

  // The original game, as far as its shift.
  await page.goto(`${url}?mode=classic`);
  await page.waitForFunction(() => window.fixtureGame?.scene.isActive('TitleScene'), null, { timeout: 60_000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureGame.scene.isActive('GameScene'), null, { timeout: 60_000 });
  await page.waitForTimeout(1_000);
  assert.deepEqual(await violations(), [], 'the original game breaks no part of the policy');
  assert.deepEqual(blocked, []);
  assert.deepEqual(errors, []);
  console.log(`PASS the production Content-Security-Policy: the 3D game loads a crew model with all ${textures.length} of its textures, and the original game reaches its shift, with no violations`);
} finally {
  await browser.close();
  await server.close();
}
