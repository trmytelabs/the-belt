import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';

import { BREAK_SCENES, OPENERS, SCRUM, SPEAKER_NAMES } from '../src/game/slice/StoryScript.ts';
import { SHIFT_LAYOUT } from '../src/game/slice/ShiftModel.ts';
import { finishNight, skipOpening } from './night-helpers.mjs';

// The overnight story in the 2D depot (?mode=2d), with the game's real keys.
// Fixtures only move the shift clock, put a parcel in hand or fix a breakage roll.
const server = process.env.BELT_TEST_BASE_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BELT_BROWSER_RENDERER === 'canvas' ? { args: ['--disable-webgl'] } : {}),
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  await page.addInitScript(() => {
    let phaser;
    Object.defineProperty(window, 'Phaser', { configurable: true, get: () => phaser, set: (value) => {
      phaser = value;
      const boot = value.Game.prototype.boot;
      value.Game.prototype.boot = function (...args) { window.fixtureGame = this; return boot.apply(this, args); };
    } });
  });
  await page.goto(`${process.env.BELT_TEST_BASE_URL ?? server.resolvedUrls.local[0]}?mode=2d`);
  await page.waitForFunction(() => window.fixtureGame?.scene.isActive('DepotScene'));
  const S = 'window.fixtureGame.scene.getScene("DepotScene")';
  const read = (fn, arg) => page.evaluate(fn, arg);
  const wait = (expression, timeout = 60_000) => page.waitForFunction(expression, null, { timeout, polling: 20 });
  const press = (key) => page.keyboard.press(key, { delay: 30 });
  const name = (speaker) => SPEAKER_NAMES[speaker];
  /** Steps a scene with SPACE, never past a beat that has not been shown. */
  const stepScene = async (id) => {
    const beats = await read(`${S}.cutscene.scene.beats.length`);
    for (let index = 0; index < beats; index += 1) {
      await wait(`${S}.cutscene?.scene.id !== ${JSON.stringify(id)} || ${S}.cutscene.index >= ${index}`);
      const remaining = await read(`(() => { const c = ${S}.cutscene; return c?.scene.id === ${JSON.stringify(id)} && c.index === ${index} ? c.beat.ms - c.elapsedMs : 0; })()`);
      if (remaining > 700) await press('Space');
    }
    await wait(`${S}.cutscene?.scene.id !== ${JSON.stringify(id)}`);
  };
  const fresh = async (choices) => {
    await read(`(() => { const s = ${S}; s.forceStory(${JSON.stringify(choices)}); if (s.state !== 'briefing') s.scene.restart(); })()`);
    await wait(`${S}.state === 'briefing'`);
    await read(`${S}.forceStory(${JSON.stringify(choices)})`);
  };

  // Each opener reaches the scrum: stepped, skipped, and left to play.
  await fresh({ opener: 1, breakAtMs: 1e12 });
  await press('Enter');
  await wait(`${S}.cutscene?.scene.id === 'opener-2'`);
  await wait(`${S}.storyView.speechBubble !== null`);
  await read(`window.fixtureSpeech = ${S}.storyView.speechBubble`);
  assert.equal(await read(`${S}.storyView.speechBubble.parentContainer === ${S}.storyView.stage`), true,
    'the current speech bubble belongs to the story stage');
  await press('Escape');
  await wait(`${S}.state === 'paused'`);
  await page.waitForTimeout(2600);
  assert.equal(await read('window.fixtureSpeech.active'), true, 'pause keeps the current line visible');
  await press('Escape');
  await stepScene('opener-2');
  assert.equal(await read('window.fixtureSpeech.active'), false, 'advancing or skipping destroys the old stage speech');
  for (const beat of OPENERS[1].beats.filter((item) => item.line)) {
    assert.ok((await read(`${S}.storyView.history`)).includes(`${name(beat.speaker)}: ${beat.line}`), `opener-2: ${beat.line}`);
  }
  assert.equal(await read(`${S}.cutscene.scene.id`), 'scrum');
  await wait(`${S}.cutscene.index > 0`);
  const scrumSamples = await read(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    const camera = scene.view.world;
    const members = [...scene.life.cast].filter(([id]) =>
      ['shan', 'hussan', 'aj', 'ben', 'bannerman', 'fruitloop', 'doris', 'brian', 'donna'].includes(id))
      .map(([id, actor]) => ({ id, art: actor.art, tag: actor.tag }));
    members.push(...scene.workers.map((worker, index) => ({ id: index ? 'skanky' : 'termite', art: worker.container })));
    const bodyEnvelope = (id, art) => {
      // Bounds of the authored idle silhouettes in DepotCastArt/DepotArt,
      // including hats, limbs and held props, excluding text/shadows/effects.
      // Transform them through the actual sprite scale/rotation; foot circles
      // alone miss head/torso overlaps between staggered rows.
      const local = id === 'termite' ? [-17, -37, 19, 28]
        : id === 'skanky' ? [-17, -35, 19, 28]
          : id === 'hussan' ? [-19, -34, 19, 25]
            : id === 'ben' ? [-17.5, -34, 30, 25]
              : id === 'bannerman' ? [-17.5, -34, 23, 25]
                : id === 'doris' ? [-17.5, -40, 23.5, 25] : [-17.5, -34, 18.5, 25];
      const matrix = art.getWorldTransformMatrix();
      const corners = [[local[0], local[1]], [local[2], local[1]], [local[0], local[3]], [local[2], local[3]]]
        .map(([x, y]) => matrix.transformPoint(x, y));
      return { left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)),
        top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y)) };
    };
    return [0, 0.5, 1].map(gather => {
      const focus = scene.life.directStory(scene.cutscene, scene.workers, cue => cue === 'gather' ? gather : 0);
      for (let frame = 0; frame < 30; frame++) scene.view.update(100, scene.model.activeWorker, 'story', focus);
      camera.preRender();
      return { gather, members: members.map(({ id, art, tag }) => {
        // Phaser Graphics have no measured geometry bounds. Check the authored
        // body envelope plus the actual raster-text label bounds instead of the
        // container's bounds, which can incorrectly include the world origin.
        const label = tag?.getBounds();
        const bounds = { left: Math.min(art.x - 28, label?.left ?? Infinity), right: Math.max(art.x + 28, label?.right ?? -Infinity),
          top: Math.min(art.y - 55, label?.top ?? Infinity), bottom: Math.max(art.y + 24, label?.bottom ?? -Infinity) };
        return { id, x: art.x, y: art.y, visible: art.visible, body: bodyEnvelope(id, art),
          left: camera.x + camera.width / 2 + (bounds.left - camera.midPoint.x) * camera.zoom,
          right: camera.x + camera.width / 2 + (bounds.right - camera.midPoint.x) * camera.zoom,
          top: camera.y + camera.height / 2 + (bounds.top - camera.midPoint.y) * camera.zoom,
          bottom: camera.y + camera.height / 2 + (bounds.bottom - camera.midPoint.y) * camera.zoom };
      }) };
    });
  });
  for (const { gather, members } of scrumSamples) {
    assert.equal(members.length, 11, 'the whole scrum cast is present');
    for (const member of members) {
      assert.equal(member.visible, true, `${member.id} is present at the scrum`);
      assert.ok(member.left >= 0 && member.right <= 960 && member.top >= 126 && member.bottom <= 620,
        `${member.id}: the complete illustration and name fit between the story bars`);
      assert.ok(member.body.left >= SHIFT_LAYOUT.platform.left && member.body.right <= SHIFT_LAYOUT.beltX - 52,
        `${member.id}: the scrum stands on the clear west platform, outside the conveyor`);
    }
    for (let first = 0; first < members.length; first++) for (let second = first + 1; second < members.length; second++) {
      const a = members[first]; const b = members[second];
      const overlapX = Math.min(a.body.right, b.body.right) - Math.max(a.body.left, b.body.left);
      const overlapY = Math.min(a.body.bottom, b.body.bottom) - Math.max(a.body.top, b.body.top);
      assert.ok(overlapX <= 0 || overlapY <= 0, `gather ${gather}: ${a.id}/${b.id} body silhouettes overlap`);
    }
  }
  await stepScene('scrum');
  const life = await read(`${S}.life.history`);
  for (const beat of SCRUM.beats.filter((item) => item.line)) {
    assert.ok(life.includes(`${name(beat.speaker)}: ${beat.line}`), `the scrum line "${beat.line}" plays on the depot floor`);
  }
  await wait(`${S}.state === 'countdown' || ${S}.state === 'playing'`);
  await wait(`${S}.state === 'playing'`);
  assert.equal(await read(`${S}.model.elapsedMs < 1000`), true, 'the shift starts after the scrum');
  await fresh({ opener: 0, breakAtMs: 1e12 });
  await press('Enter');
  await skipOpening(page);
  assert.deepEqual(await read(`${S}.model.workers.map(({ x, y }) => ({ x, y }))`), [{ x: 382, y: 500 }, { x: 578, y: 500 }]);
  await fresh({ opener: 2, breakAtMs: 1e12 });
  await press('Enter');
  await wait(`${S}.cutscene?.scene.id === 'scrum'`, 120_000);
  assert.ok((await read(`${S}.storyView.history`)).includes('BRIAN: Thirty-two minutes!'), 'opener-3 plays out by itself');
  assert.deepEqual(errors, []);
  console.log('PASS 2D story: three openers reach the scrum (stepped, skipped, unattended), approved scrum lines on the depot floor, countdown into play; no script errors');

  // Every break variant, once, with the shift and held freight preserved.
  for (const place of ['7eleven', 'timhortons']) {
    for (let variant = 0; variant < 3; variant += 1) {
      await fresh({ opener: 0, breakPlace: place, breakVariant: variant, breakAtMs: 46_000 });
      await press('Enter');
      await skipOpening(page);
      const held = await read(`(() => { const s = ${S}; const m = s.model; for (const p of m.packages) p.state = 'delivered';
        const parcel = m.packages[0]; Object.assign(parcel, { state: 'held', workerId: 'termite', route: 'A', kind: 'smallbox', size: 'normal' });
        m.workers[0].heldId = parcel.id; m.score = 400; m.elapsedMs = 45_990; return parcel.id; })()`);
      const id = `${place}-${variant + 1}`;
      await wait(`${S}.cutscene?.scene.id === ${JSON.stringify(id)}`);
      assert.equal(await read(`${S}.model.paused`), true);
      await stepScene(id);
      const history = await read(`${S}.storyView.history`);
      for (const beat of BREAK_SCENES[place][variant].beats.filter((item) => item.line)) {
        assert.ok(history.includes(`${name(beat.speaker)}: ${beat.line}`), `${id}: ${beat.line}`);
      }
      await wait(`${S}.state === 'playing'`);
      assert.deepEqual(await read(`({ score: ${S}.model.score, held: ${S}.model.workers[0].heldId })`), { score: 400, held }, `${id} keeps score and freight`);
      await read(`${S}.model.elapsedMs = 55_900`);
      await page.waitForTimeout(400);
      assert.equal(await read(`${S}.story.visited.filter((chapter) => chapter === 'break').length`), 1, `${id} happens once`);
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS 2D break: all six approved exchanges by real keys, shift and held freight preserved, once per shift; no script errors');

  // Throwing and breakage with F; carrying down the stairs.
  await fresh({ opener: 0, breakAtMs: 1e12 });
  await press('Enter');
  await skipOpening(page);
  const hold = (route, kind, x, y) => read(`(() => { const m = ${S}.model; for (const p of m.packages) if (p.state === 'belt') p.state = 'delivered';
    const parcel = { ...m.packages[0], id: 1000 + m.packages.length, flight: null, pileIndex: undefined, thrownDelivery: false, broken: false, breakY: null }; m.packages.push(parcel);
    Object.assign(parcel, { state: 'held', workerId: 'termite', route: '${route}', kind: '${kind}', size: 'normal', recovered: false });
    if (m.activeIndex !== 0) m.switchWorker(); Object.assign(m.workers[0], { x: ${x}, y: ${y}, heldId: parcel.id }); return parcel.id; })()`);
  await hold('D', 'smallbox', 380, 560);
  await read(`${S}.model.random = () => 0.99`);
  await page.waitForTimeout(100);
  assert.match(await read(`${S}.actionText.text`), /F THROWS \(15% RISK\)/, 'the console offers the throw and its risk');
  assert.equal(await read(`${S}.throwLabel.visible`), true, 'the landing spot is marked');
  await press('KeyF');
  await wait(`${S}.model.thrownDeliveries === 1`);
  const brokenId = await hold('A', 'makeup', 380, 400);
  await read(`(() => { ${S}.model.random = () => 0; ${S}.model.score = 1000; })()`);
  const travel = await read(`${S}.model.beltTravel`);
  await press('KeyF');
  await wait(`${S}.model.packages.find((p) => p.id === ${brokenId}).state === 'damaged'`);
  await wait(`${S}.life.breakageLines.length === 1`);
  assert.deepEqual(await read(`({ score: ${S}.model.score, damaged: ${S}.model.damaged, sorted: ${S}.model.sorted })`), { score: 850, damaged: 1, sorted: 1 });
  assert.ok(await read(`${S}.model.beltTravel > ${travel} && ${S}.state === 'playing'`), 'the belt keeps moving while Shan yells');
  // Shan walks over on the shift clock, then yells once he arrives.
  await wait(`${S}.life.history.some((line) => line.startsWith("SHAN O'MAC: WHAT DID I SAY"))`);
  assert.ok(await read(`${S}.model.beltTravel > ${travel} && ${S}.state === 'playing'`), 'the belt is still moving when he arrives');
  await read(`(() => { const m = ${S}.model; m.eventStopped = true; Object.assign(m.workers[0], { x: 369, y: 532 }); })()`);
  const beforeRepeat = await read(`${S}.model.score`);
  for (let i = 0; i < 3; i += 1) { await press('Space'); await press('KeyF'); }
  assert.deepEqual(await read(`({ damaged: ${S}.model.damaged, sorted: ${S}.model.sorted, score: ${S}.model.score })`), { damaged: 1, sorted: 1, score: beforeRepeat }, 'no second penalty or credit');
  await read(`(() => { ${S}.model.eventStopped = false; ${S}.model.random = () => 0.99; })()`);
  const floorId = await hold('T', 'smallbox', 380, 640);
  await page.keyboard.down('KeyS');
  await wait(`${S}.model.activeWorker.y > 912`);
  await page.keyboard.up('KeyS');
  await press('Space');
  await wait(`${S}.model.packages.find((p) => p.id === ${floorId}).state === 'delivered'`);
  assert.deepEqual(await read(`${S}.depot.floorPiles.getData('floorPiles')`), { T: 1, S: 0 }, 'the lower-floor drop shows its pile');
  assert.deepEqual(errors, []);
  console.log('PASS 2D throwing: F throw with risk shown, clean credit, one broken penalty with Shan while the belt runs, no repeat penalty, carry down the stairs to a floor-drop pile; no script errors');

  // Synthetic held freight isolates route coverage; reach every destination
  // through public movement, then dispatch with the real keyboard action.
  for (const [index, route] of ['A', 'D', 'T', 'B', 'E', 'S', 'C'].entries()) {
    const arrival = await read(({ route, index, layout }) => {
      const m = window.fixtureGame.scene.getScene('DepotScene').model;
      m.eventStopped = true; m.crewAssist = false; m.elapsedMs = 1000;
      for (const parcel of m.packages) parcel.state = 'delivered';
      for (const worker of m.workers) worker.heldId = null;
      const side = ['B', 'E', 'S'].includes(route) ? 1 : 0;
      if (m.activeIndex !== side) m.switchWorker();
      const worker = m.activeWorker;
      const target = route === 'C' ? layout.bulkLeft : layout.dropAreas[route];
      const parcel = { id: 8000 + index, route, kind: 'smallbox', label: `SYNTHETIC ${route}`, size: 'normal',
        x: worker.x, y: worker.y, state: 'held', workerId: worker.id, beltOffset: 0,
        recovered: false, missCounted: false, broken: false, breakY: null };
      m.packages.push(parcel); worker.heldId = parcel.id;
      for (let frame = 0; frame < 1000 && Math.hypot(worker.x - target.x, worker.y - target.y) > 3; frame++) {
        m.update(20, { x: target.x - worker.x, y: target.y - worker.y });
      }
      return { id: parcel.id, dock: m.currentDock(), before: m.routeSorted[route], distance: Math.hypot(worker.x - target.x, worker.y - target.y) };
    }, { route, index, layout: SHIFT_LAYOUT });
    assert.equal(arrival.dock, route, `${route}: public movement reaches its drop`);
    assert.ok(arrival.distance <= 3, `${route}: worker reaches the intended approach`);
    await press('Space');
    await wait(`${S}.model.packages.find(p => p.id === ${arrival.id}).state === 'delivered'`);
    assert.equal(await read(`${S}.model.routeSorted.${route}`), arrival.before + 1, `${route}: real Space records a delivery`);
  }
  await read(`(() => { ${S}.model.eventStopped = false; ${S}.model.crewAssist = true; })()`);
  assert.deepEqual(errors, []);
  console.log('PASS 2D destinations: A, D, T, B, E, S and shared C reached through movement and delivered using real Space');

  const crewFloorClearance = await read(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    const m = scene.model;
    m.elapsedMs = 1000; m.eventStopped = true;
    scene.life.update();
    const art = scene.life.cast.get('bannerman').art;
    const parcel = { ...m.packages[0], id: 9000, state: 'floor', workerId: null, x: art.x, y: art.y };
    m.packages.push(parcel);
    scene.life.update();
    const result = { visible: art.visible, radius: art.getData('bodyRadius'), distance: Math.hypot(art.x - parcel.x, art.y - parcel.y) };
    parcel.state = 'delivered'; m.eventStopped = false;
    return result;
  });
  assert.equal(crewFloorClearance.visible, true, 'the floor-cargo fixture uses a visible colleague');
  assert.ok(crewFloorClearance.distance >= SHIFT_LAYOUT.parcelRadius + crewFloorClearance.radius - 0.001,
    'the rendered colleague stands outside the loose parcel footprint');
  console.log('PASS 2D crew clearance: a visible colleague moves clear of loose floor freight');

  // Four real assisted pickups/carries/deliveries unlock the late-shift fault.
  // Only cargo and the late clock are fixtures; score and assistance counters
  // remain untouched, and actual Tab/Space inputs must service the scanner.
  const scanner = await read(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    const m = scene.model;
    for (const parcel of m.packages) parcel.state = 'delivered';
    for (const worker of m.workers) worker.heldId = null;
    if (m.activeIndex !== 0) m.switchWorker();
    m.eventStopped = true; m.crewAssist = true; m.elapsedMs = 36_000;
    const before = { score: m.score, combo: m.combo, assisted: m.assistedSorted, sorted: m.sorted, playerSorted: m.playerSorted };
    for (let index = 0; index < 4; index++) {
      const y = 240 + index * 70;
      m.packages.push({ id: 9100 + index, route: 'B', kind: 'smallbox', label: 'SYNTHETIC PARTNER B', size: 'normal',
        x: 480, y, state: 'belt', workerId: null, beltOffset: y - m.beltTravel,
        recovered: false, missCounted: false, broken: false, breakY: null });
    }
    for (let frame = 0; frame < 2000 && m.assistedSorted < before.assisted + 4 && !m.ended; frame++) m.update(20);
    const after = { score: m.score, combo: m.combo, assisted: m.assistedSorted, sorted: m.sorted, playerSorted: m.playerSorted };
    m.elapsedMs = 70_000; m.update(20);
    // Keep the unrelated Ben interlude out of this isolated scanner fixture.
    m.elapsedMs = 60_000;
    const worker = m.workers[1];
    const parcel = { id: 9200, route: 'B', kind: 'smallbox', label: 'HELD DURING RESET', size: 'normal',
      x: worker.x, y: worker.y, state: 'held', workerId: worker.id, beltOffset: 0,
      recovered: false, missCounted: false, broken: false, breakY: null };
    m.packages.push(parcel); worker.heldId = parcel.id;
    return { before, after, fault: m.pendingScannerWorker, held: parcel.id };
  });
  assert.deepEqual(scanner.after, { ...scanner.before, assisted: scanner.before.assisted + 4, sorted: scanner.before.sorted + 4 },
    'partner deliveries increase team dispatch without adding personal score, combo or player deliveries');
  assert.equal(scanner.fault, 'skanky');
  await wait(`${S}.comboText.text.includes('SKANKY SCANNER')`);
  assert.match(await read(`${S}.comboText.text`), /TAB THEN SPACE/, 'inactive worker fault gives a persistent switch prompt');
  assert.doesNotMatch(await read(`${S}.operatorText.text`), /AUTO/, 'the interrupted partner is not labeled as assisting');
  await press('Tab');
  await wait(`${S}.model.activeWorker.id === 'skanky'`);
  assert.equal(await read(`${S}.model.pendingScannerWorker`), 'skanky', 'switching alone does not clear the fault');
  await wait(`${S}.actionText.text.includes("RESET SKANKY'S SCANNER")`);
  await press('Space');
  await wait(`${S}.model.pendingScannerWorker === null`);
  assert.deepEqual(await read(`({ held: ${S}.model.activeWorker.heldId, score: ${S}.model.score, sorted: ${S}.model.sorted })`),
    { held: scanner.held, score: scanner.after.score, sorted: scanner.after.sorted }, 'reset preserves held freight and personal points');
  await press('Space');
  await wait(`${S}.model.packages.find(parcel => parcel.id === ${scanner.held}).state === 'delivered'`);
  assert.ok(await read(`${S}.model.score > ${scanner.after.score}`), 'the next manual delivery earns personal points');
  assert.equal(await read(`${S}.model.playerSorted`), scanner.after.playerSorted + 1);
  await read(`(() => { ${S}.model.eventStopped = false; ${S}.model.elapsedMs = 1000; })()`);
  assert.deepEqual(errors, []);
  console.log('PASS 2D partner and scanner: automatic team dispatch earns no personal points; real Tab/Space resets without losing freight, then manual delivery earns points');

  // A won shift goes on through the mall and home to the results.
  await read(`(() => { const m = ${S}.model; for (const p of m.packages) if (p.state !== 'damaged') p.state = 'delivered'; m.workers[0].heldId = null; m.sorted = m.goal; m.elapsedMs = m.durationMs - 20; })()`);
  await wait(`${S}.state === 'celebrating'`);
  await finishNight(page);
  const results = await read(`${S}.overlay.list.filter((item) => item.type === 'Text').map((item) => item.text).join(' | ')`);
  assert.match(results, /HOME\. FINALLY\./);
  assert.match(results, /MALL RUN · 6\/6 delivered · 6\/6 signed · five-ton returned/);
  assert.deepEqual(await read(`${S}.story.visited.slice(-9)`), ['shift', 'clockout', 'assignment', 'to-mall', 'mall', 'to-ups', 'return', 'home', 'results']);
  await press('Enter');
  await wait(`${S}.state === 'briefing'`);
  assert.deepEqual(await read(`({ cutscene: ${S}.cutscene, mall: ${S}.mall, lot: ${S}.lot, active: ${S}.storyView.active, breaks: ${S}.story.breakTaken })`),
    { cutscene: null, mall: null, lot: null, active: null, breaks: false }, 'a replay starts clean');
  assert.deepEqual(errors, []);
  console.log('PASS 2D finale and replay: clock-out into the mall run, six drops and signatures, keys back, home, results and a clean restart; no script errors');
} finally {
  await browser?.close();
  await server?.close();
}
