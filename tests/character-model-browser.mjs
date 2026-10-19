import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { syntheticHumanoid, toGlb } from './fixtures/humanoid.mjs';
import { ROCKETBOX_CAST } from '../src/three/rocketboxCast.ts';

// The production bundle loads a listed character model, swaps it in for the
// procedural workers and drives it through real play. First use a synthetic
// humanoid served on a route, then check the actual shipped cast in each stage.
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
    window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; event.detail.playPrologue = false; });
  });
  await page.goto(url);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing');
  if (await page.evaluate(() => window.fixtureApp.quality) === 'low') {
    assert.deepEqual(requests, [], 'software renderers keep the procedural people and request no models');
  } else {
    assert.ok(requests.every((request) => /\/models\/(characters\/[a-z0-9-]+|vehicles\/sedan(?:-wide)?|creatures\/devil)\.glb$/.test(request)), 'only the shipped crew, cars and devil models are requested');
  }

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
  await page.evaluate(() => window.fixtureApp.forceStory({ breakAtMs: 1e12 }));
  await page.keyboard.press('Enter');
  for (let guard = 0; guard < 8 && await page.evaluate(() => window.fixtureApp.state !== 'playing'); guard += 1) {
    await page.keyboard.press('Enter', { delay: 40 });
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => window.fixtureApp.state === 'playing', null, { timeout: 30_000 });
  const standing = (await modelState()).termite.arm;
  // Slow software frames can miss the whole walk before the worker reaches the
  // wall. Sample a drawn pose during movement triggered by the real W key.
  const walker = () => page.evaluate(() => {
    const worker = window.fixtureApp.workers.termite;
    return { at: worker.root.position.toArray().map((value) => +value.toFixed(2)), walkPhase: +worker.walkPhase.toFixed(2), state: window.fixtureApp.state };
  });
  const start = await walker();
  await page.evaluate(() => {
    window.fixtureWalkingArms = [];
    window.fixtureWalkingTimer = setInterval(() => {
      const app = window.fixtureApp;
      if (!app.model.activeWorker.moving || !app.keys.has('KeyW')) return;
      app.lastRender = -Infinity;
      app.draw();
      window.fixtureWalkingArms.push(app.workers.termite.root.getObjectByName('mixamorigRightArm').quaternion.toArray());
    }, 100);
  });
  await page.keyboard.down('KeyW');
  try {
    await page.waitForFunction(rest => window.fixtureWalkingArms.some(arm =>
      Math.abs(arm.reduce((sum, value, index) => sum + value * rest[index], 0)) < 0.9999), standing, { timeout: 30_000 });
  } catch (error) {
    console.log('Termite before and after walking:', JSON.stringify([start, await walker()]));
    throw error;
  } finally {
    await page.keyboard.up('KeyW');
    await page.evaluate(() => clearInterval(window.fixtureWalkingTimer));
  }
  console.log('PASS the model follows the walk cycle during the shift');
  await page.screenshot({ path: process.env.BELT_MODEL_SCREENSHOT ?? 'node_modules/.cache/character-model.png' });

  // Decode and attach every shipped model too. Controlled scene fixtures show
  // the normally hidden cast, including the mall clerks and Mesa dream copies.
  // Gameplay with the real workers is covered by gameplay-adjustments-browser.
  await page.evaluate(() => { window.fixtureApp.state = 'paused'; window.fixtureApp.pausedFrom = 'playing'; });
  const cast = ROCKETBOX_CAST.map(({ file, names }) => ({ names, url: `/models/characters/${file}.glb` }));
  await page.evaluate(entries => window.fixtureApp.useCharacterModels(entries.map(entry => ({ ...entry, skinMaterial: /head/i }))), cast);
  const shipped = await page.evaluate(entries => {
    const app = window.fixtureApp;
    const names = new Set(entries.flatMap(entry => entry.names));
    const results = [];
    const reveal = scene => scene.traverse(object => { if (names.has(object.name)) object.visible = true; });
    const inspect = scene => scene.traverse(object => {
      if (!names.has(object.name)) return;
      const model = object.getObjectByName('character-model');
      let vertices = 0;
      let shownFigure = 0;
      object.traverse(child => {
        if (child.isSkinnedMesh) vertices += child.geometry.attributes.position.count;
        if (child.userData.figure && child.visible) shownFigure += 1;
      });
      results.push({ name: object.name, model: Boolean(model), vertices, shownFigure });
    });
    reveal(app.world.scene);
    app.lastRender = -Infinity; app.draw(); inspect(app.world.scene);
    for (const id of ['lot', 'store', 'coffee', 'mall']) {
      const stage = app.stage.stage(id);
      app.stage.active = id; app.pausedFrom = 'mall'; reveal(stage.scene);
      app.lastRender = -Infinity; app.draw(); inspect(stage.scene);
    }
    app.state = 'dream'; reveal(app.dream.scene);
    app.lastRender = -Infinity; app.draw(); inspect(app.dream.scene);
    app.state = 'paused'; app.pausedFrom = 'playing'; app.stage.end();
    return results;
  }, cast);
  for (const { file, names } of ROCKETBOX_CAST) {
    assert.ok(shipped.some(result => names.includes(result.name)), `${file} is present in a real game scene`);
  }
  assert.equal(shipped.filter(result => result.name === 'CLERK').length, 6, 'all six mall clerks use the cast model');
  for (const result of shipped) {
    assert.ok(result.model && result.vertices > 1000, `${result.name} attaches its actual shipped skinned mesh`);
    assert.equal(result.shownFigure, 0, `${result.name} hides only its procedural figure`);
  }
  console.log(`PASS all ${ROCKETBOX_CAST.length} shipped character models decode and attach across depot, story, mall and dream scenes`);
  // Check the actual rig proportions too: the previous inward shoulder roll
  // put angry fists together across the chest on the imported crew.
  const armSamples = [];
  for (const { file } of ROCKETBOX_CAST) {
    await page.evaluate(async ({ file, entries }) => {
      const app = window.fixtureApp;
      await app.useCharacterModels([{ names:['HUSSAN'],url:`/models/characters/${file}.glb`,skinMaterial:/head/i }, ...entries.filter(entry => !entry.names.includes('HUSSAN'))]);
      const names = new Set(entries.flatMap(entry => entry.names));
      app.world.scene.traverse(object => { if (names.has(object.name)) object.visible = false; });
      app.crew.actor('hussan').root.visible = true;
    }, { file, entries:cast });
    const samples = await page.evaluate(() => {
      const app = window.fixtureApp, actor = app.crew.actor('hussan');
      const out = [];
      for (const time of [0,0.35,0.7,1.05]) {
        actor.pose = 'swear'; actor.poseStart = 0; actor.carrying = false;
        actor.animate(0.1,time,false); app.lastRender = -Infinity; app.draw();
        actor.root.updateMatrixWorld(true);
        const inverse = actor.character.body.matrixWorld.clone().invert();
        const roles = { upper:[],elbow:[],hand:[] };
        actor.root.getObjectByName('character-model').traverse(bone => {
          if (!bone.isBone) return;
          const role = /upperarm$/i.test(bone.name) ? 'upper' : /forearm$/i.test(bone.name) ? 'elbow' : /hand$/i.test(bone.name) ? 'hand' : null;
          if (role) roles[role].push(bone.getWorldPosition(actor.root.position.clone()).applyMatrix4(inverse));
        });
        for (const points of Object.values(roles)) points.sort((a,b) => a.x-b.x);
        out.push({ separation:roles.hand[0].distanceTo(roles.hand[1]),
          arms:roles.upper.map((shoulder,index) => ({ shoulder:shoulder.x,elbow:roles.elbow[index].x,hand:roles.hand[index].x,
            bend:roles.elbow[index].clone().sub(shoulder).angleTo(roles.hand[index].clone().sub(roles.elbow[index])) })) });
      }
      return out;
    });
    armSamples.push(...samples.map(sample => ({ file,...sample })));
  }
  for (const sample of armSamples) {
    assert.ok(sample.separation > 0.25, `${sample.file} keeps its fists separated`);
    for (const arm of sample.arms) {
      assert.ok(Math.sign(arm.shoulder) === Math.sign(arm.elbow) && Math.sign(arm.shoulder) === Math.sign(arm.hand), `${sample.file} never crosses its own chest`);
      assert.ok(Math.abs(arm.elbow) >= Math.abs(arm.shoulder)*0.8 && Math.abs(arm.hand) >= Math.abs(arm.shoulder)*0.8);
      assert.ok(arm.bend > 0.8 && arm.bend < 1.6, `${sample.file} bends at the elbow: ${arm.bend}`);
    }
  }
  console.log('PASS all 23 real character rigs keep angry fists apart, flex the elbows and avoid crossing the chest');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS no page errors with imported character models');
} finally {
  await browser.close();
  await server.close();
}
