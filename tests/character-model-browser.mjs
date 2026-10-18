import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { syntheticHumanoid, toGlb } from './fixtures/humanoid.mjs';

// The production bundle loads a listed character model, swaps it in for the
// procedural workers and drives it through real play. The model is the
// synthetic humanoid fixture, served on a route; no third-party model is used.
const glb = await toGlb(syntheticHumanoid());
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const executable = process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' };
const browser = await chromium.launch({
  headless: true, ...executable,
  args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const waitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = (fn, arg, options = {}) => waitForFunction(fn, arg, { polling: 10, ...options });
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.url().includes('/models/')) requests.push(request.url()); });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('**/models/characters/fixture-humanoid.glb', (route) => route.fulfill({ body: glb, contentType: 'model/gltf-binary' }));
  await page.addInitScript(() => {
    window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; });
  });
  await page.goto(url);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing');
  assert.deepEqual(requests, [], 'no model is requested while none is listed');

  await page.evaluate(() => window.fixtureApp.useCharacterModels([{ names: ['TERMITE', 'SKANKY'], url: '/models/characters/fixture-humanoid.glb' }]));
  const modelState = () => page.evaluate(() => {
    const out = {};
    for (const [id, worker] of Object.entries(window.fixtureApp.workers)) {
      const model = worker.root.getObjectByName('character-model');
      let shownFigure = 0;
      let heldProps = 0;
      worker.body.traverse((child) => {
        if (child.isMesh && child.visible && child.userData.figure) shownFigure += 1;
      });
      for (const hand of [worker.leftHand, worker.rightHand]) {
        hand.traverse((child) => { if (child.isMesh && child.visible && !child.userData.figure) heldProps += 1; });
      }
      const arm = worker.root.getObjectByName('mixamorigRightArm');
      out[id] = { model: Boolean(model), shownFigure, heldProps, tag: worker.nameTag.visible, arm: arm ? arm.quaternion.toArray() : null };
    }
    return out;
  });
  await page.waitForFunction(() => Object.values(window.fixtureApp.workers).every((worker) => worker.root.getObjectByName('character-model')), null, { timeout: 30_000 });
  const before = await modelState();
  for (const id of ['termite', 'skanky']) {
    assert.ok(before[id].model, `${id} wears the listed model`);
    assert.equal(before[id].shownFigure, 0, `${id}'s procedural figure is hidden`);
    assert.ok(before[id].tag, `${id}'s name tag stays`);
  }
  console.log('PASS a listed model replaces both workers\' procedural figures');

  // Start the night, skip the story with ENTER, then walk: the model's arms swing with the walk cycle.
  await page.keyboard.press('Enter');
  for (let guard = 0; guard < 8 && await page.evaluate(() => window.fixtureApp.state !== 'playing'); guard += 1) {
    await page.keyboard.press('Enter', { delay: 40 });
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => window.fixtureApp.state === 'playing', null, { timeout: 30_000 });
  const standing = (await modelState()).termite.arm;
  // Models are posed when a frame is drawn, and software renderers on CI draw
  // about once a second, so wait for drawn frames rather than a fixed time.
  await page.keyboard.down('KeyD');
  await page.waitForFunction((rest) => {
    const arm = window.fixtureApp.workers.termite.root.getObjectByName('mixamorigRightArm');
    return Math.abs(arm.quaternion.toArray().reduce((sum, value, index) => sum + value * rest[index], 0)) < 0.9999;
  }, standing, { timeout: 30_000 });
  await page.keyboard.up('KeyD');
  console.log('PASS the model follows the walk cycle during the shift');
  await page.screenshot({ path: process.env.BELT_MODEL_SCREENSHOT ?? 'node_modules/.cache/character-model.png' });
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS no page errors with imported character models');
} finally {
  await browser.close();
  await server.close();
}
