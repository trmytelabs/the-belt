import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

import { BREAK_SCENES, OPENERS, SCRUM } from '../src/game/slice/StoryScript.ts';
import { breakScene3d } from '../src/three/breakScenes3d.ts';
import { DEPOT_3D_LAYOUT as L } from '../src/three/layout.ts';
import { driveJourney } from './driving-helpers.mjs';

// The overnight story in the 3D depot, played through the real app with real
// keys. Synthetic fixtures only move the shift clock, place a parcel in hand,
// fix a breakage roll or carry Skanky between mall stops; every story, throw,
// delivery and signature goes through the game's own input handling.
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const executable = process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' };
const browser = await chromium.launch({
  headless: true, ...executable,
  args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const shots = process.env.BELT_SCREENSHOT_DIR;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const waitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = (fn, arg, options = {}) => waitForFunction(fn, arg, { polling: 10, timeout: 90_000, ...options });
  if (process.env.BELT_BROWSER_CPU_RATE) {
    const diagnostics = await page.context().newCDPSession(page);
    await diagnostics.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.BELT_BROWSER_CPU_RATE) });
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  await page.addInitScript(() => window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; event.detail.playPrologue = false; }));
  await page.goto(url);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing');
  const read = (fn, arg) => page.evaluate(fn, arg);
  const wait = (fn, arg, timeout) => page.waitForFunction(fn, arg, timeout ? { timeout } : {});
  const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, `story-${name}.png`) }); };
  const spoken = (line) => wait((copy) => window.fixtureApp.overlay.history.includes(copy), line);
  const name = (speaker) => ({ shan: "SHAN O'MAC", fruitloop: 'FRUIT LOOP', cashier: 'CASHIER' }[speaker] ?? speaker.toUpperCase());
  const freshRun = async (choices) => {
    await read((c) => { if (window.fixtureApp.state !== 'briefing') window.fixtureApp.restart(); window.fixtureApp.model.autonomousCoworker = false; window.fixtureApp.forceStory(c); }, choices);
    await wait(() => window.fixtureApp.state === 'briefing');
  };
  const clearFreight = () => read(() => {
    for (const parcel of window.fixtureApp.model.packages) if (parcel.state === 'belt' || parcel.state === 'missed' || parcel.state === 'floor') parcel.state = 'delivered';
  });
  /** Steps a scene line by line with SPACE, checking each spoken line as it appears. */
  const stepScene = async (id) => {
    const beats = await read(() => window.fixtureApp.cutscene.scene.beats.length);
    for (let index = 0; index < beats; index += 1) {
      await wait(([sceneId, i]) => window.fixtureApp.cutscene?.scene.id !== sceneId || window.fixtureApp.cutscene.index >= i, [id, index]);
      const beat = await read((i) => window.fixtureApp.cutscene?.scene.beats[i], index);
      if (beat?.line) await spoken(`${name(beat.speaker)}: ${beat.line}`);
      // A real SPACE moves on while this beat clearly still has time left;
      // otherwise the beat is left to finish by itself, so no line is skipped unseen.
      const remaining = await read(([sceneId, i]) => {
        const cutscene = window.fixtureApp.cutscene;
        return cutscene?.scene.id === sceneId && cutscene.index === i ? cutscene.beat.ms - cutscene.elapsedMs : 0;
      }, [id, index]);
      if (remaining > 700) await page.keyboard.press('Space');
    }
    await wait((sceneId) => window.fixtureApp.cutscene?.scene.id !== sceneId, id);
  };
  const toShift = async () => {
    await wait(() => window.fixtureApp.state === 'countdown' || window.fixtureApp.state === 'playing');
    await wait(() => window.fixtureApp.state === 'playing');
  };

  // ---- Scene 1-3: each opener reaches the scrum; the scrum's approved lines; the countdown.
  await freshRun({ opener: 0, breakAtMs: 1e12 });
  await read(() => {
    window.countdown = [];
    window.scrumSamples = [];
    const sampler = setInterval(() => {
      const app = window.fixtureApp;
      if (app.cutscene?.scene.id !== 'scrum' || app.cutscene.index !== 0 || app.cutscene.progress < 0.05) return;
      const roots = ['termite', 'skanky', 'doris', 'brian'].map(id => id in app.workers ? app.workers[id].root : app.crew.actors.get(id).root);
      window.scrumSamples.push(roots.map(root => ({ z: root.position.z, facing: Math.cos(root.rotation.y) })));
      if (window.scrumSamples.length > 100) clearInterval(sampler);
    }, 50);
    new MutationObserver(() => {
      const copy = document.querySelector('.b3d-count')?.textContent;
      if (copy && window.countdown.at(-1) !== copy) window.countdown.push(copy);
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'opener-1');
  assert.equal(await read(() => window.fixtureApp.model.elapsedMs), 0, 'the shift waits through the story');
  assert.match(await page.locator('.b3d-storybar').innerText(), /1:30 AM · SHIFT STARTED 1:00 AM/);
  await shot('opener-1');
  await stepScene('opener-1');
  assert.equal(await read(() => window.fixtureApp.cutscene.scene.id), 'scrum');
  await wait(() => window.scrumSamples.length > 3 && window.scrumSamples.at(-1)[0].z < window.scrumSamples[0][0].z - 0.15);
  const approach = await read(() => [window.scrumSamples[0], window.scrumSamples.at(-1)]);
  for (let i = 0; i < approach[0].length; i++) {
    assert.ok(approach[1][i].z < approach[0][i].z, `the crew moves up toward Shan: ${JSON.stringify(approach)}`);
    assert.ok(approach[1][i].facing < -0.5, `the crew faces forward while approaching Shan: ${JSON.stringify(approach)}`);
  }
  await shot('scrum');
  const scrumLines = SCRUM.beats.filter((beat) => beat.line).map((beat) => `${name(beat.speaker)}: ${beat.line}`);
  await stepScene('scrum');
  const history = await read(() => window.fixtureApp.overlay.history);
  const positions = scrumLines.map((line) => history.indexOf(line));
  assert.ok(positions.every((at) => at >= 0), 'every approved scrum line is shown with its speaker');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'the scrum lines play in order');
  assert.ok((await read(() => window.fixtureApp.overlay.subtitles)).some((text) => /Everyone turns to look at Termite and Skanky/.test(text)), 'the announcement gets its beat');
  await toShift();
  assert.deepEqual(await read(() => window.countdown), ['3', '2', '1', 'SORT!'], 'the countdown follows the scrum');
  assert.deepEqual(await read(() => window.fixtureApp.story.visited), ['briefing', 'arrival', 'scrum', 'countdown', 'shift']);
  await page.keyboard.down('KeyW');
  await wait(() => window.fixtureApp.model.activeWorker.y < 480);
  await page.keyboard.up('KeyW');
  assert.equal(await read(() => window.fixtureApp.model.activeWorker.id), 'termite', 'sorting is playable after the countdown');

  // Opener 2 is skipped at once: initialization still happens and the scrum still plays.
  await freshRun({ opener: 1, breakAtMs: 1e12 });
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'opener-2');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'scrum');
  assert.equal(await read(() => window.fixtureApp.stage.active), null, 'the scrum is in the depot');
  await page.keyboard.press('Enter');
  await toShift();
  assert.deepEqual(await read(() => window.fixtureApp.model.workers.map(({ x, y }) => ({ x, y }))), [{ x: 382, y: 500 }, { x: 578, y: 500 }],
    'skipping places both workers at their stations');
  assert.equal(await read(() => window.fixtureApp.model.paused), false);

  // Opener 3 plays out with no input at all.
  await freshRun({ opener: 2, breakAtMs: 1e12 });
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'opener-3');
  await shot('opener-3');
  for (const beat of OPENERS[2].beats.filter((item) => item.line)) await spoken(`${name(beat.speaker)}: ${beat.line}`);
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'scrum', null, 120_000);
  // The on-screen buttons by keyboard: each does only its own action.
  await page.waitForTimeout(400);
  const beatBefore = await read(() => window.fixtureApp.cutscene.index);
  await page.locator('.b3d-storykeys [data-story="next"]').focus();
  await page.keyboard.press('Enter');
  await wait((index) => window.fixtureApp.cutscene?.index > index, beatBefore);
  assert.deepEqual(await read(() => [window.fixtureApp.cutscene?.scene.id, window.fixtureApp.cutscene?.index]), ['scrum', beatBefore + 1],
    'Enter on NEXT shows the next line; it does not skip the scene');
  // Touch has no Escape: the story bar has its own PAUSE.
  await page.locator('.b3d-storykeys [data-story="pause"]').click();
  await wait(() => window.fixtureApp.state === 'paused');
  assert.match(await page.locator('.b3d-panel').innerText(), /STORY PAUSED/);
  await page.locator('.b3d-panel button').click();
  await wait(() => window.fixtureApp.state === 'story');
  await page.locator('.b3d-storykeys [data-story="skip"]').focus();
  await page.keyboard.press('Space');
  await wait(() => window.fixtureApp.cutscene?.scene.id !== 'scrum');
  // Leaving the story lets go of the button's focus, so Enter starts the next night again.
  await wait(() => window.fixtureApp.state !== 'story');
  assert.equal(await read(() => document.querySelector('.b3d-storykeys').contains(document.activeElement)), false,
    'no story button keeps keyboard focus outside a story scene');
  await wait(() => window.fixtureApp.state === 'playing');
  assert.equal(await read(() => window.fixtureApp.model.paused), false,
    'resuming the scrum must not leave the initial shift frozen');
  const resumedY = await read(() => window.fixtureApp.model.activeWorker.y);
  await page.keyboard.down('KeyW');
  await wait(y => window.fixtureApp.model.activeWorker.y < y - 8, resumedY);
  await page.keyboard.up('KeyW');
  assert.deepEqual(errors, []);
  console.log('PASS 3D story: three openers reach the scrum (stepped, skipped and unattended), approved scrum lines in order, NEXT/SKIP/PAUSE buttons by keyboard and click, countdown into playable sorting; no script errors');

  // ---- Scene 4-5: every break variant, once per shift, with the shift and freight preserved.
  const breaks = [];
  for (const place of ['7eleven', 'timhortons']) for (let variant = 0; variant < 3; variant += 1) breaks.push([place, variant]);
  for (const [index, [place, variant]] of breaks.entries()) {
    await freshRun({ opener: 0, breakPlace: place, breakVariant: variant, breakAtMs: 46_000 });
    await page.keyboard.press('Enter');
    await wait(() => window.fixtureApp.state === 'story');
    await page.keyboard.press('Enter');
    await wait(() => window.fixtureApp.cutscene?.scene.id === 'scrum');
    await page.keyboard.press('Enter');
    await toShift();
    await clearFreight();
    // Termite holds a parcel when the break starts.
    const before = await read(() => {
      const m = window.fixtureApp.model;
      m.score = 700;
      m.elapsedMs = 45_990;
      const parcel = m.packages[0];
      Object.assign(parcel, { state: 'held', workerId: 'termite', route: 'A', kind: 'smallbox', size: 'normal' });
      m.workers[0].heldId = parcel.id;
      return { score: m.score, held: parcel.id };
    });
    const id = `${place}-${variant + 1}`;
    await page.locator('.b3d-lunch-alert').waitFor({state:'visible'});
    assert.equal(await read(()=>window.fixtureApp.stage.active),null,'the lunch warning appears in the warehouse before travelling');
    assert.equal(await read(()=>window.fixtureApp.state),'break-alert');
    await wait((sceneId) => window.fixtureApp.cutscene?.scene.id === sceneId, id);
    assert.equal(await read(() => window.fixtureApp.story.chapter), 'break');
    const frozen = await read(() => ({ t: window.fixtureApp.model.elapsedMs, travel: window.fixtureApp.model.beltTravel, paused: window.fixtureApp.model.paused }));
    assert.equal(frozen.paused, true, 'the shift is paused for the break');
    if (index === 0 || index === 3) { await page.waitForTimeout(1200); await shot(`break-${id}`); }
    // The 3D night plays Tim Hortons inside the restaurant (see breakScenes3d.ts).
    const lines = breakScene3d(BREAK_SCENES[place][variant]).beats.filter((beat) => beat.line).map((beat) => `${name(beat.speaker)}: ${beat.line}`);
    await stepScene(id);
    for (const line of lines) assert.ok((await read(() => window.fixtureApp.overlay.history)).includes(line), `${id} shows "${line}"`);
    await wait(() => window.fixtureApp.state === 'playing');
    const after = await read(() => ({ score: window.fixtureApp.model.score, held: window.fixtureApp.model.workers[0].heldId, t: window.fixtureApp.model.elapsedMs }));
    assert.equal(after.score, before.score, 'no score is lost to the break');
    assert.equal(after.held, before.held, 'the held parcel is still in hand');
    assert.ok(Math.abs(after.t - frozen.t) < 2000, 'the same shift resumes where it stopped');
    // It never comes back: not after more time, not after a pause.
    await page.keyboard.press('Escape');
    await wait(() => window.fixtureApp.state === 'paused');
    await page.keyboard.press('Enter');
    await wait(() => window.fixtureApp.state === 'playing');
    await read(() => { window.fixtureApp.model.elapsedMs = 55_900; });
    await page.waitForTimeout(600);
    assert.equal(await read(() => window.fixtureApp.story.visited.filter((chapter) => chapter === 'break').length), 1, `${id} happens once per shift`);
    assert.equal(await read(() => window.fixtureApp.state), 'playing');
  }
  assert.deepEqual(errors, []);
  console.log('PASS 3D break: all six exchanges (three at 7-Eleven, three inside Tim Hortons) by real keys, shift and held freight preserved, once per shift; no script errors');

  // ---- Throwing and breakage with the real F key; the belt keeps moving while Shan yells.
  await freshRun({ opener: 0, breakAtMs: 1e12 });
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'story');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'scrum');
  await page.keyboard.press('Enter');
  await toShift();
  const holdFor = (route, kind, at) => read(({ r, k, p }) => {
    const m = window.fixtureApp.model;
    // A fresh synthetic parcel each time, so earlier throws are never reused.
    const parcel = { ...m.packages[0], id: 1000 + m.packages.length, flight: null, pileIndex: undefined, thrownDelivery: false, broken: false, breakY: null };
    m.packages.push(parcel);
    Object.assign(parcel, { state: 'held', workerId: 'termite', route: r, kind: k, size: ['mallwood', 'mesa', 'atv', 'lobsters', 'bigbox', 'longbox'].includes(k) ? 'heavy' : 'normal', recovered: false });
    if (m.activeIndex !== 0) m.switchWorker();
    Object.assign(m.workers[0], p, { heldId: parcel.id });
    return parcel.id;
  }, { r: route, k: kind, p: at });
  // The hint follows the held freight on the next HUD refresh, which a slow software renderer can delay past a fixed sleep.
  const expectHint = async (pattern) => {
    await page.waitForFunction(source => new RegExp(source).test(document.querySelector('.b3d-hint')?.innerText ?? ''), pattern.source, { polling: 20, timeout: 10_000 }).catch(() => undefined);
    assert.match(await page.locator('.b3d-hint').innerText(), pattern);
  };
  const heavyId = await holdFor('A', 'mallwood', { x: 380, y: 400 });
  await expectHint(/TOO HEAVY TO THROW/);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(150);
  assert.equal(await read((id) => window.fixtureApp.model.heldPackage?.id, heavyId), heavyId, 'heavy freight stays in hand');
  await clearFreight();
  await read(() => { window.fixtureApp.model.workers[0].heldId = null; for (const p of window.fixtureApp.model.packages) if (p.state === 'held') p.state = 'delivered'; });
  // A clean throw down the left stair; truck freight must be carried inside.
  const cleanId = await holdFor('T', 'smallbox', { x: 330, y: L.stairs.centerY });
  await read(() => { window.fixtureApp.model.random = () => 0.99; });
  await expectHint(/\[F\] THROW DOWN STAIRS · 30% BREAK RISK/);
  assert.equal(await read(() => window.fixtureApp.throwArc), undefined, 'no safe aiming guide reveals the destination');
  const scoreBefore = await read(() => window.fixtureApp.model.score);
  await page.keyboard.press('KeyF');
  await wait((id) => window.fixtureApp.model.packages.find((item) => item.id === id).state === 'delivered', cleanId);
  assert.equal(await read(() => window.fixtureApp.model.score - 0), scoreBefore + 100);
  assert.equal(await read(() => window.fixtureApp.model.thrownDeliveries), 1);
  // A broken throw: no credit, one penalty, Shan comes over, the belt keeps moving.
  const brokenId = await holdFor('T', 'makeup', { x: 330, y: L.stairs.centerY });
  await read(() => { window.fixtureApp.model.random = () => 0; window.fixtureApp.model.score = 1000; });
  const travel = await read(() => window.fixtureApp.model.beltTravel);
  await page.keyboard.press('KeyF');
  await wait((id) => window.fixtureApp.model.packages.find((item) => item.id === id).state === 'damaged', brokenId);
  await wait(() => window.fixtureApp.crew.breakageLines.length === 1);
  await wait(() => window.fixtureApp.overlay.history.some((line) => line.startsWith("SHAN O'MAC: WHAT DID I SAY")));
  await page.waitForTimeout(600);
  await shot('broken-shan');
  const damage = await read(() => ({ score: window.fixtureApp.model.score, damaged: window.fixtureApp.model.damaged, sorted: window.fixtureApp.model.sorted, shan: window.fixtureApp.crew.actors.get('shan').root.visible }));
  assert.deepEqual(damage, { score: 850, damaged: 1, sorted: 1, shan: true });
  assert.ok(await read((t) => window.fixtureApp.model.beltTravel > t && window.fixtureApp.state === 'playing', travel), 'the belt keeps moving during his reaction');
  // Touching it again, standing in the dock, throwing again: nothing changes.
  // The belt is cleared and intake held so these presses can only reach the broken parcel.
  await clearFreight();
  await read(() => { window.fixtureApp.model.eventStopped = true; Object.assign(window.fixtureApp.model.workers[0], { x: 369, y: window.fixtureApp.model.layout.dockA.y }); });
  const snapshot = () => read(() => ({ score: window.fixtureApp.model.score, damaged: window.fixtureApp.model.damaged, sorted: window.fixtureApp.model.sorted }));
  const beforeRepeat = await snapshot();
  for (let i = 0; i < 3; i += 1) { await page.keyboard.press('Space'); await page.keyboard.press('KeyF'); }
  await page.waitForTimeout(400);
  // Snapshot before intake resumes, so only the repeated inputs can have changed anything.
  const settled = await snapshot();
  await read(() => { window.fixtureApp.model.eventStopped = false; window.fixtureApp.model.random = () => 0.99; });
  assert.deepEqual({ damaged: settled.damaged, sorted: settled.sorted }, { damaged: 1, sorted: 1 }, 'a broken parcel is never credited or penalized twice');
  assert.equal(settled.score, beforeRepeat.score, 'repeat contact neither restores nor re-deducts points');
  // Carrying still works, down the real stairs to the lower floor.
  await read(() => { const m = window.fixtureApp.model; m.workers[0].heldId = null; for (const p of m.packages) if (p.state === 'held') p.state = 'delivered'; });
  // Isolate the physical descent from protocol-latency overshoot while walking
  // south: start this held-cargo fixture at the shared stair approach, then use
  // real horizontal controls for every step down, delivery and return.
  const floorId = await holdFor('T', 'smallbox', { x: 380, y: L.stairs.centerY });
  const surface = () => read(() => window.fixtureApp.workers.termite.root.position.y);
  assert.ok(Math.abs(await surface() - 1.1) < 0.01, 'Termite stands on the raised platform');
  await page.keyboard.down('KeyA');
  const stairPose = await wait(x => {
    const app = window.fixtureApp;
    return app.model.activeWorker.x < x ? { height: app.workers.termite.root.position.y } : false;
  }, (L.platform.left + L.lowerFloor.left.maxX) / 2);
  const { height: stairHeight } = await stairPose.jsonValue();
  assert.ok(stairHeight > 0 && stairHeight < 1.1, 'the left flight descends outward across the side of the platform');
  await wait(x => window.fixtureApp.model.activeWorker.x <= x + 3, L.floorT.x);
  await page.keyboard.up('KeyA');
  assert.ok(await surface() < 0.05, 'the stairs lead down to the lower floor');
  await page.keyboard.press('Space');
  await wait((id) => window.fixtureApp.model.packages.find((item) => item.id === id).state === 'delivered', floorId);
  await wait(() => window.fixtureApp.world.floorPiles.T.count === 2);
  await shot('lower-floor-pile');
  await page.keyboard.down('KeyD');
  await wait(x => window.fixtureApp.model.activeWorker.x >= x + 20, L.platform.left);
  await page.keyboard.up('KeyD');
  assert.ok(Math.abs(await surface() - 1.1) < 0.01, 'and back up to the platform');
  assert.ok(await read(y => window.fixtureApp.model.activeWorker.y < y, L.bulkRearWall.y - L.bulkRearWall.height / 2),
    'the whole stair route stays in front of the final back wall');
  assert.deepEqual(errors, []);
  console.log('PASS 3D throwing: heavy freight carry-only, clean F throw without aiming guides and with credit, broken throw with one penalty and Shan while the belt runs, no repeat penalty, carry down and up the real stairs to a floor-drop pile; no script errors');

  // ---- Scenes 7-13: shift completion, the mall run, the truck back to UPS, home and results.
  await read(() => {
    const m = window.fixtureApp.model;
    m.workers[0].heldId = null;
    for (const parcel of m.packages) if (parcel.state !== 'damaged') parcel.state = 'delivered';
    m.sorted = m.goal;
    m.elapsedMs = m.durationMs - 20;
  });
  await wait(() => window.fixtureApp.state === 'celebrating');
  assert.equal(await read(() => window.fixtureApp.story.chapter), 'clockout');
  await read(() => { window.fixtureApp.crew.celebrationMs = 12_950; });
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'mall-assignment');
  // Shan walks down to Skanky facing the way he goes (he used to crab-walk sideways).
  const shanWalk = [];
  for (let i = 0; i < 30; i++) {
    shanWalk.push(await read(() => { const root = window.fixtureApp.crew.actor('shan').root; return { x: root.position.x, z: root.position.z, yaw: root.rotation.y }; }));
    await page.waitForTimeout(40);
  }
  // A step, not the jump onto his start mark: on a slow renderer the first sample can land before the scene's first frame.
  const moving = shanWalk.slice(1).map((s, i) => ({ ...s, dx: s.x - shanWalk[i].x, dz: s.z - shanWalk[i].z })).filter(s => Math.hypot(s.dx, s.dz) > 0.02 && Math.hypot(s.dx, s.dz) < 1.5);
  assert.ok(moving.length >= 1, `Shan walks during the first beat: ${moving.length} moving samples`);
  for (const s of moving) {
    const off = Math.atan2(Math.sin(Math.atan2(s.dx, s.dz) - s.yaw), Math.cos(Math.atan2(s.dx, s.dz) - s.yaw));
    assert.ok(Math.abs(off) < 1.0, `Shan faces the way he walks: ${off.toFixed(2)} rad off`);
  }
  await shot('mall-assignment');
  await spoken("SHAN O'MAC: Skanky. Mall run. The five-ton's loaded.");
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'drive-to-mall');
  await page.waitForTimeout(1500);
  await shot('drive-to-mall');
  await page.keyboard.press('Enter');
  await driveJourney(page, 'mall');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'mall-intro');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'mall');
  const mallState = () => read(() => {
    const mall = window.fixtureApp.mall;
    return { run: mall.run, delivered: mall.delivered, signatures: mall.signatures, carrying: mall.carrying, load: [...mall.cart.load], finished: mall.finished };
  });
  const at = (x, y) => read(([px, py]) => Object.assign(window.fixtureApp.mall.skanky, { x: px, y: py }), [x, y]);
  const stores = await read(() => window.fixtureApp.mall.stores.map((store) => ({ id: store.id, run: store.run, x: store.door.x, side: store.side })));
  const slotY = (id) => read((storeId) => window.fixtureApp.mall.slotPosition(window.fixtureApp.mall.truckBundles.indexOf(storeId)).y, id);
  // An empty-handed visit to a store earns nothing.
  const first = stores.filter((store) => store.run === 0);
  await at(first[0].x, first[0].side === 'north' ? 322 : 478);
  await page.keyboard.press('Space');
  assert.equal((await mallState()).delivered, 0, 'no delivery without the freight');
  // Pointing at a later run's slot highlights an available current-run bundle.
  const later = stores.find((store) => store.run === 2);
  await at(70, await slotY(later.id));
  await page.keyboard.press('Space');
  const firstPickup = (await mallState()).carrying;
  assert.equal(stores.find(store => store.id === firstPickup)?.run, 0, 'selection skips later-run bundles');
  assert.ok(await read(id => window.fixtureApp.mall.truckBundles.includes(id), later.id), 'the later delivery stays in the truck');
  const deliver = async (store) => {
    const y = store.side === 'north' ? 322 : 478;
    await read(([x, ry]) => Object.assign(window.fixtureApp.mall.cart, { x: x + 30, y: ry, pushed: true, facing: 'right' }), [store.x, y]);
    await at(store.x, y);
    await page.keyboard.press('Space');
    await wait((id) => window.fixtureApp.mall.store(id).state === 'dropped', store.id);
    await page.keyboard.press('Space');
    await wait((id) => window.fixtureApp.mall.store(id).state === 'signed', store.id);
    // Pressing again at a signed store gives nothing.
    const counts = await mallState();
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    const again = await mallState();
    assert.deepEqual([again.delivered, again.signatures], [counts.delivered, counts.signatures], `${store.id} credits once`);
  };
  for (let run = 0; run < 3; run += 1) {
    const manifest = stores.filter((store) => store.run === run).sort((a, b) => Number(a.id !== firstPickup) - Number(b.id !== firstPickup));
    // Back at the truck: park the cart, then take each bundle and load it.
    await read(() => Object.assign(window.fixtureApp.mall.cart, { x: 150, y: 400, pushed: false, facing: 'up' }));
    for (const store of manifest) {
      if ((await mallState()).carrying !== store.id) {
        await at(70, await slotY(store.id));
        await page.keyboard.press('Space');
        await wait((id) => window.fixtureApp.mall.carrying === id, store.id);
      }
      await at(190, 400);
      await page.keyboard.press('Space');
      await wait((id) => window.fixtureApp.mall.cart.load.includes(id), store.id);
    }
    assert.equal((await mallState()).load.length, 2, 'two stores per trip');
    if (run === 0) {
      // A third bundle does not fit; and E really grabs the cart.
      const third = stores.find((store) => store.run === 1);
      await at(70, await slotY(third.id));
      await page.keyboard.press('Space');
      assert.equal((await mallState()).carrying, null);
      await at(182, 400);
      await page.keyboard.press('KeyE');
      await wait(() => window.fixtureApp.mall.cart.pushed);
      await page.waitForTimeout(500);
      await shot('mall-loaded');
    }
    for (const store of manifest) await deliver(store);
    if (run === 0) await shot('mall-signed');
    if (run < 2) assert.equal((await mallState()).finished, false);
  }
  assert.deepEqual(await mallState().then(({ delivered, signatures, finished }) => ({ delivered, signatures, finished })), { delivered: 6, signatures: 6, finished: false },
    'the last signature is not the end: the cart and Skanky go back to the truck');
  await read(() => Object.assign(window.fixtureApp.mall.cart, { x: 150, y: 400, pushed: false }));
  await at(80, 465);
  await page.keyboard.press('Space');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'drive-to-ups');
  await page.keyboard.press('Enter');
  await driveJourney(page, 'ups');
  await wait(() => window.fixtureApp.state === 'lot');
  await page.waitForTimeout(800);
  await shot('return-truck');
  // No results until the keys are back: walk them over with real keys.
  await page.keyboard.press('Space');
  assert.equal(await read(() => window.fixtureApp.state), 'lot');
  await page.keyboard.down('KeyD');
  await wait(() => window.fixtureApp.lot.skanky.x > 820);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyW');
  await wait(() => window.fixtureApp.lot.atKeyDrop);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Space');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'go-home');
  await page.waitForTimeout(2000);
  await shot('home');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'ended');
  const results = await page.locator('.b3d-panel').innerText();
  await shot('results');
  assert.match(results, /HOME\. FINALLY\./);
  assert.match(results, /MALL RUN · 6\/6 delivered · 6\/6 signed · five-ton returned · \+300/);
  assert.match(results, /1 broken \(−150 points\)/);
  assert.match(results, /NIGHT TOTAL/);
  // Tonight's goals: named in the results with a tick or a cross each, and paid into the night total.
  assert.match(results, /NIGHT GOALS · [0-3] OF 3 · [✓✗] Load 8 in a row · [✓✗] Finish with no wrong drops · [✓✗] Make 3 priority parcels on time · [+](0|150|300|450)/);
  // The first night in a fresh browser is a personal best, and the record is kept for the next.
  assert.match(results, /NEW PERSONAL BEST · NIGHT 1/);
  const stored = await read(() => JSON.parse(window.localStorage.getItem('the-belt:3d-record:v1')));
  assert.equal(stored.played, 1);
  assert.equal(stored.completed, 1);
  assert.ok(stored.best.total > 0 && /^opener-\d$/.test(stored.openers[0]), `the night is recorded: ${JSON.stringify(stored)}`);
  assert.deepEqual(await read(() => window.fixtureApp.story.visited.slice(-9)),
    ['shift', 'clockout', 'assignment', 'to-mall', 'mall', 'to-ups', 'return', 'home', 'results']);
  assert.deepEqual(errors, []);
  console.log('PASS 3D finale: shift completion into the mall assignment, three cart runs by real keys with no empty, early or duplicate credit, six drops and six signatures, return to the truck, five-ton back to UPS by key drop, home and results; no script errors');

  // Regression for a near-complete night with recovered freight: the same mall
  // and key-return objects have really completed, only the warehouse totals are synthetic.
  await read(() => {
    const app=window.fixtureApp,m=app.model,template=m.packages[0];
    m.packages.splice(0,m.packages.length,...Array.from({length:57},(_,i)=>({...template,id:i+1,state:i<56?'delivered':'missed',recovered:i<16})));
    Object.assign(m,{sorted:56,missed:17,score:5950,bestCombo:9,damaged:0,breakagePenalty:0,wrongSortErrors:0,won:true,ended:true,bulkSorted:12});
    Object.assign(m.routeSorted,{A:9,D:8,T:5,B:8,E:7,S:7,C:12});
    app.state='celebrating';app.showResults();
  });
  const recovered=await page.locator('.b3d-panel').innerText();
  assert.match(recovered,/SHIFT COMPLETE \/ GRADE S/);
  assert.match(recovered,/98% of freight dispatched · 16 recovered and dispatched/);
  assert.match(recovered,/1 left behind · 0 wrong drops · GRADE 98\.2%/);
  const driveTotals = await read(() => ({ penalty: window.fixtureApp.drivingPenalty,
    bumps: window.fixtureApp.drivingCollisions, redLights: window.fixtureApp.drivingRedLights }));
  assert.equal(driveTotals.penalty, (driveTotals.bumps + driveTotals.redLights) * 100, 'road incidents retain their separate 100-point deduction');
  const goalBonus = await read(() => window.fixtureApp.goalBonus);
  const expectedNightTotal = String(Math.max(0, 6250 - driveTotals.penalty + goalBonus)).padStart(5, '0');
  assert.match(recovered, new RegExp(`NIGHT TOTAL ${expectedNightTotal}.*OUTSTANDING SHIFT`));
  await shot('recovered-s-rank');
  console.log(`PASS 56 of 57 dispatched, recovered freight and the completed mall run render S rank, an explicit grade breakdown and the correct ${expectedNightTotal} night total after driving deductions`);

  // ---- Restart and replay start clean.
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'briefing');
  const clean = await read(() => {
    const app = window.fixtureApp;
    return {
      cutscene: app.cutscene, mall: app.mall, lot: app.lot, stage: app.stage.active, speech: app.overlay.activeSpeech().length,
      elapsed: app.model.elapsedMs, breakTaken: app.story.breakTaken, chapter: app.story.chapter, damaged: app.model.damaged,
      piles: app.world.floorPiles.T.count, shan: app.crew.breakageLines.length,
    };
  });
  assert.deepEqual(clean, { cutscene: null, mall: null, lot: null, stage: null, speech: 0, elapsed: 0, breakTaken: false, chapter: 'briefing', damaged: 0, piles: 0, shan: 0 });
  // The briefing shows the record so far: two nights reached the results (the finale and the synthetic regression), both finished.
  // Two nights on record: the third night's goals are the rotation's third set.
  assert.match(await page.locator('.b3d-panel').innerText(), /TONIGHT’S GOALS · [+]150 EACH: Finish with 2 or fewer missed · Load 8 in a row · Finish with no wrong drops/);
  assert.match(await page.locator('.b3d-panel').innerText(), /YOUR RECORD · 2 OF 2 NIGHTS FINISHED · BEST NIGHT \d{5} · GRADE [SABCDF] · 1 OF 3 OPENERS SEEN/);
  // A finished night unlocks the peak night beside the ordinary one; Enter still starts the ordinary night.
  assert.match(await page.locator('.b3d-panel').innerText(), /PEAK NIGHT UNLOCKED/);
  assert.ok(await page.locator('button[data-action="peak"]').isVisible(), 'the PEAK NIGHT button shows');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'story' && window.fixtureApp.story.chapter === 'arrival');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'scrum');
  assert.equal(await read(() => window.fixtureApp.model.peak), false, 'Enter starts an ordinary night');
  // And P from the briefing starts a peak night: its own faster, tighter shift.
  await read(() => window.fixtureApp.restart());
  await wait(() => window.fixtureApp.state === 'briefing');
  await page.keyboard.press('KeyP');
  await wait(() => window.fixtureApp.state === 'story');
  assert.deepEqual(await read(() => ({ peak: window.fixtureApp.model.peak, capacity: window.fixtureApp.model.capacity })), { peak: true, capacity: 6 });
  assert.deepEqual(errors, []);
  console.log('PASS 3D replay: restart clears scenes, mall, lot, speech, piles and once-only flags, and the next night starts normally; a finished night unlocks the peak night; no script errors');
} finally {
  await browser.close();
  await server.close();
}
