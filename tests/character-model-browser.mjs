import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { syntheticHumanoid, toGlb } from './fixtures/humanoid.mjs';
import { ROCKETBOX_CAST } from '../src/three/rocketboxCast.ts';
import { OPENERS } from '../src/game/slice/StoryScript.ts';

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
    for (const id of ['lot', 'coffee', 'mall', 'dimsum']) {
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
  // Christmas: Shan's Santa hat is a head accessory, so it stays on over his imported model.
  const shanHat = await page.evaluate(() => {
    const shan = window.fixtureApp.crew.actor('shan');
    let accessories = 0;
    shan.character.head.traverse(child => { if (child.isMesh && child.visible && !child.userData.figure) accessories += 1; });
    return { model: Boolean(shan.root.getObjectByName('character-model')), accessories };
  });
  assert.ok(shanHat.model && shanHat.accessories > 0, `Shan's Santa hat shows over his model: ${JSON.stringify(shanHat)}`);
  console.log('PASS Shan wears his Christmas hat over the imported model');
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
      // A change of pose blends in over a fifth of a second; settle into the swear before sampling it.
      actor.pose = 'swear'; actor.animate(0.1, -1, false);
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

  // Motion-captured Rocketbox clips on the real cast (on by default on GPU renderers, forced here for software ones).
  // Under clips the spine and fingers move, which the figure's poses never do; the clip plays in place; and a
  // pose without a clip, or reduced motion, hands the whole body back to the figure.
  const withClips = cast.map((entry, index) => ({ ...entry, clips: /Female/.test(ROCKETBOX_CAST[index].source) ? 'female' : 'male', walk: ROCKETBOX_CAST[index].walk }));
  await page.evaluate(async entries => {
    const app = window.fixtureApp;
    await app.useCharacterModels(entries.map(entry => ({ ...entry, skinMaterial: /head/i })));
    await app.useCharacterClips(true);
    const names = new Set(entries.flatMap(entry => entry.names));
    app.world.scene.traverse(object => { if (names.has(object.name)) object.visible = false; });
    for (const id of ['hussan', 'doris']) app.crew.actor(id).root.visible = true;
  }, withClips);
  const clipRun = await page.evaluate(() => {
    const app = window.fixtureApp;
    const bones = id => {
      const model = app.crew.actor(id).root.getObjectByName('character-model');
      const get = name => model.getObjectByName(name);
      return { spine: get('Bip01_Spine1').quaternion.clone(), finger: get('Bip01_R_Finger1').quaternion.clone(), root: get('Bip01').position.clone(),
        torso: ['Bip01_Pelvis', 'Bip01_Spine1', 'Bip01_Neck', 'Bip01_Head', 'Bip01_L_Clavicle'].map(name => get(name).quaternion.clone()) };
    };
    let time = 100;
    const run = (seconds, setup) => {
      for (let i = 0; i < seconds * 30; i++) {
        time += 1 / 30;
        for (const id of ['hussan', 'doris']) { const actor = app.crew.actor(id); setup(actor); actor.animate(1 / 30, time, setup.reduced === true); }
        app.lastRender = -Infinity; app.draw();
      }
    };
    const idle = actor => { actor.pose = 'none'; actor.carrying = false; };
    // The figure's own (unposed) look first: clips off.
    app.useCharacterClips(false); run(0.5, idle);
    const figure = { hussan: bones('hussan'), doris: bones('doris') };
    app.useCharacterClips(true); run(2, idle);
    const a = { hussan: bones('hussan'), doris: bones('doris') };
    run(1, idle);
    const b = { hussan: bones('hussan'), doris: bones('doris') };
    const out = {};
    for (const id of ['hussan', 'doris']) {
      out[id] = {
        spineFromFigure: a[id].spine.angleTo(figure[id].spine),
        // The torso the figure never moves: pelvis, spine, neck, head and clavicle, the most-moved of them.
        torsoMoves: Math.max(...a[id].torso.map((q, index) => q.angleTo(b[id].torso[index]))),
        fingerMoves: a[id].finger.angleTo(b[id].finger) + a[id].finger.angleTo(figure[id].finger),
        drift: Math.hypot(b[id].root.x - figure[id].root.x, b[id].root.z - figure[id].root.z),
      };
    }
    const squat = actor => { actor.pose = 'squat'; actor.poseStart = time; };
    run(1, squat);
    out.squatSpine = bones('hussan').spine.angleTo(figure.hussan.spine);
    const reduced = Object.assign(idle, { reduced: true });
    run(1, reduced);
    out.reducedSpine = bones('hussan').spine.angleTo(figure.hussan.spine);
    return out;
  });
  for (const id of ['hussan', 'doris']) {
    const sample = clipRun[id];
    assert.ok(sample.spineFromFigure > 0.01 && sample.torsoMoves > 0.005, `${id}'s torso follows the clip: ${JSON.stringify(sample)}`);
    assert.ok(sample.fingerMoves > 0.01, `${id}'s fingers relax out of the rest pose: ${JSON.stringify(sample)}`);
    assert.ok(sample.drift < 15, `${id}'s clip plays in place (${sample.drift.toFixed(1)} cm)`);
  }
  assert.ok(clipRun.squatSpine < 0.02, `a pose without a clip hands the spine back to the figure (${clipRun.squatSpine})`);
  assert.ok(clipRun.reducedSpine < 0.02, `reduced motion hands the spine back to the figure (${clipRun.reducedSpine})`);
  console.log('PASS motion-captured clips move the real crew\'s spine and fingers in place, for both bodies, and hand back to the figure for unclipped poses and reduced motion');

  // The loosened motion: a shout plays the angry gesture, an idle is broken by a fidget, a big change of facing
  // steps round on a turn clip while the root comes round over the same span, and a hand-built pose blends in.
  const loosened = await page.evaluate(() => {
    const app = window.fixtureApp, actor = app.crew.actor('hussan'), c = actor.character;
    let time = 200;
    const step = (seconds, setup) => {
      const roles = new Set();
      for (let i = 0; i < seconds * 30; i++) {
        time += 1 / 30;
        setup(actor);
        // The models advance without a render: a software renderer takes about a second per frame.
        actor.animate(1 / 30, time, false); app.syncModels();
        roles.add(app.clipRoleOf(c));
      }
      return [...roles];
    };
    const out = {};
    actor.faceAngle = c.root.rotation.y;
    step(0.5, a => { a.pose = 'none'; a.carrying = false; });
    out.shout = step(0.5, a => { a.pose = 'shout'; a.poseStart = time; });
    step(0.5, a => { a.pose = 'none'; });
    // Fourteen seconds of standing still: at least one fidget breaks the idle, then the idle returns.
    const idleRoles = step(14, a => { a.pose = 'none'; });
    out.fidgets = idleRoles.filter(role => ['lookAround', 'scratchHead', 'stretchArms'].includes(role));
    // A fidget may be mid-way at the window's end; the idle returns within a few more seconds.
    for (let guard = 0; guard < 8 && !['idle', 'idleAlt'].includes(app.clipRoleOf(c)); guard++) step(1, a => { a.pose = 'none'; });
    out.idleBack = app.clipRoleOf(c);
    // A half turn while standing: the root turns over about 0.7 s on a turn clip, not in a frame.
    const facing = c.root.rotation.y;
    actor.faceAngle = facing + Math.PI * 0.95;
    const turnRoles = step(0.3, a => { a.pose = 'none'; });
    out.turnRoles = turnRoles;
    out.partWay = Math.abs(c.root.rotation.y - facing);
    out.turning = Boolean(c.motion.turn);
    step(0.6, a => { a.pose = 'none'; });
    out.turned = Math.abs(Math.atan2(Math.sin(c.root.rotation.y - actor.faceAngle), Math.cos(c.root.rotation.y - actor.faceAngle)));
    out.turnDone = c.motion.turn === null;
    // A hand-built pose (the keys jingle has no clip) eases in from the joints' last positions.
    const before = c.rightArm.quaternion.clone();
    actor.setPoseAt('keys', time);
    step(0.05, a => { a.pose = 'keys'; });
    const early = c.rightArm.quaternion.angleTo(before);
    step(0.5, a => { a.pose = 'keys'; });
    const settled = c.rightArm.quaternion.angleTo(before);
    out.blend = { early, settled };
    return out;
  });
  assert.ok(loosened.shout.includes('angry'), `a shout plays the angry gesture: ${JSON.stringify(loosened.shout)}`);
  assert.ok(loosened.fidgets.length >= 1 && ['idle', 'idleAlt'].includes(loosened.idleBack), `an idle fidgets and settles back: ${JSON.stringify(loosened)}`);
  assert.ok(loosened.turning && loosened.turnRoles.some(role => /^turn/.test(role)) && loosened.partWay > 0.3 && loosened.partWay < 2.6, `a half turn steps round on a turn clip: ${JSON.stringify(loosened)}`);
  assert.ok(loosened.turnDone && loosened.turned < 0.02, `and arrives facing the new way: ${JSON.stringify(loosened)}`);
  // Part way, not held: a blend that held the old joints and then snapped would read zero early on.
  assert.ok(loosened.blend.early > loosened.blend.settled * 0.03 && loosened.blend.early < loosened.blend.settled * 0.7 && loosened.blend.settled > 0.2, `a hand-built pose blends in instead of snapping: ${JSON.stringify(loosened.blend)}`);
  // The Quaternius clips: a lift off the belt bends at the hips, a button press reaches, a line spoken standing gestures,
  // the dockhand's push pushes, and Shan walks the manager's walk.
  const quaternius = await page.evaluate(async () => {
    const app = window.fixtureApp;
    await app.useCharacterClips(true);
    const play = (id, setup, seconds) => {
      const actor = app.crew.actor(id), c = actor.character;
      actor.root.visible = true;
      let time = 900 + Math.random();
      actor.place(480, 600); actor.place(480, 600);
      actor.pose = 'none'; actor.carrying = false; actor.speaking = false; actor.faceAngle = 0;
      for (let i = 0; i < 20; i++) { time += 1 / 30; actor.animate(1 / 30, time, false); app.syncModels(); }
      const roles = new Set();
      setup(actor, time);
      for (let i = 0; i < seconds * 30; i++) {
        time += 1 / 30;
        if (actor.walking) actor.place(480 + (i + 1) * 1.6, 600);
        actor.animate(1 / 30, time, false); app.syncModels(); roles.add(app.clipRoleOf(c));
      }
      actor.walking = false; actor.pose = 'none'; actor.speaking = false;
      return [...roles];
    };
    return {
      belt: play('hussan', (a, t) => { a.character.action = { kind: 'lift', start: t, from: 'belt' }; }, 0.4),
      floor: play('hussan', (a, t) => { a.character.action = { kind: 'lift', start: t, from: 'floor' }; }, 0.4),
      press: play('hussan', (a, t) => { a.pose = 'press'; a.poseStart = t; }, 0.5),
      push: play('hussan', (a, t) => { a.pose = 'push'; a.poseStart = t; }, 0.5),
      talking: play('hussan', (a) => { a.speaking = true; }, 0.6),
      femaleTalking: play('doris', (a) => { a.speaking = true; }, 0.6),
      shan: play('shan', (a) => { a.walking = true; }, 0.8),
      walker: play('hussan', (a) => { a.walking = true; }, 0.8),
      // A hand raised and a phone held on the move: the legs keep walking rather than sliding on a standing clip.
      handupWalking: play('hussan', (a, t) => { a.pose = 'handup'; a.poseStart = t; a.walking = true; }, 0.8),
      phoneWalking: play('hussan', (a, t) => { a.pose = 'phone'; a.poseStart = t; a.walking = true; }, 0.8),
      handupStill: play('hussan', (a, t) => { a.pose = 'handup'; a.poseStart = t; }, 0.5),
    };
  });
  assert.ok(quaternius.belt.includes('pickupTable') && !quaternius.belt.includes('crouchIn'), `a lift off the belt bends at the hips: ${JSON.stringify(quaternius)}`);
  assert.ok(quaternius.floor.includes('crouchIn') && !quaternius.floor.includes('pickupTable'), `a lift off the floor still crouches: ${JSON.stringify(quaternius)}`);
  assert.ok(quaternius.press.includes('interact') && quaternius.push.includes('push'), `a press reaches and a push pushes: ${JSON.stringify(quaternius)}`);
  assert.ok(quaternius.talking.includes('talking') && quaternius.femaleTalking.includes('talking'), `speaking standing gestures, in both bodies: ${JSON.stringify(quaternius)}`);
  assert.ok(quaternius.shan.includes('walkFormal') && !quaternius.walker.includes('walkFormal'), `Shan walks the manager's walk and the crew their own: ${JSON.stringify(quaternius)}`);
  // Setting off from standing at 1.5 m/s goes straight into the walk: the slow walk's first steps slid its feet under the body.
  assert.ok(quaternius.walker.includes('walk') && !quaternius.walker.includes('walkSlow'), `setting off at a walking pace goes straight into the walk: ${JSON.stringify(quaternius.walker)}`);
  for (const [name, still] of [['handupWalking', 'wave'], ['phoneWalking', 'phone']]) {
    const roles = quaternius[name];
    assert.ok(!roles.includes(still) && roles.some(role => ['walk', 'walkSlow', 'run'].includes(role)), `a gesture on the move keeps the legs walking: ${name} ${JSON.stringify(roles)}`);
  }
  assert.ok(quaternius.handupStill.includes('wave'), `standing still, the raised hand plays its clip: ${JSON.stringify(quaternius.handupStill)}`);
  // Seated on the lot's contract seats the driver plays a seated idle with the hands kept on the wheel.
  await page.evaluate(() => { window.fixtureApp.stage.stage('lot'); });
  await page.waitForFunction(() => Object.entries(window.fixtureApp.stage.stages.lot.props).filter(([name]) => /^car-/.test(name)).every(([, car]) => car.userData.contract), null, { timeout: 90_000 });
  const seated = await page.evaluate(scene => {
    const app = window.fixtureApp;
    app.playScene(scene);
    const stage = app.stage.stages.lot;
    for (let i = 0; i < 60; i++) { app.cutscene.index = 0; app.cutscene.elapsedMs = 500 + i * 30; app.stage.direct(app.cutscene, 1 / 30, 300 + i / 30); app.syncModels(); }
    const report = id => { const actor = stage.actors.get(id); return { seat: actor.seat, role: app.clipRoleOf(actor.character), hands: actor.character.motion.hands, model: Boolean(actor.root.getObjectByName('character-model')) }; };
    return { driver: report('skanky'), passenger: report('termite') };
  }, OPENERS[0]);
  // The driver keeps the whole figure so the hands stay on the wheel; the passenger plays a seated idle.
  assert.ok(seated.driver.model && seated.driver.seat === 'driver' && seated.driver.hands, `the seated driver holds the wheel on the figure: ${JSON.stringify(seated)}`);
  assert.ok(seated.passenger.model && seated.passenger.seat === 'passenger' && !seated.passenger.hands && ['sitIdle', 'sitIdleAlt', 'sitLookAround'].includes(seated.passenger.role), `the seated passenger plays a seated idle: ${JSON.stringify(seated)}`);
  await page.evaluate(() => window.fixtureApp.useCharacterClips(false));
  console.log('PASS the loosened motion: angry shout, fidgets, turns on the spot, pose blending and seated idles, the Quaternius pick-up, press, push, talking and formal walk, and gestures on the move');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS no page errors with imported character models');
} finally {
  await browser.close();
  await server.close();
}
