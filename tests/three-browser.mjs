import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { depotSolidFootprints, overlapsFootprint, DEPOT_BODY_RADIUS } from '../src/game/slice/DepotClearance.ts';
import { DEPOT_3D_LAYOUT as L } from '../src/three/layout.ts';

// The 3D preview needs WebGL. CI's GPU-free runners provide it through
// SwiftShader, so this suite requests that explicitly rather than inheriting
// the Canvas-fallback flag the Phaser suites use. A second browser with WebGL
// disabled checks the explanatory fallback.
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
// The plain address is the 3D depot.
const url = server.resolvedUrls.local[0];
const executable = process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' };
const browsers = [];
try {
  const blocked = await chromium.launch({ headless: true, args: ['--disable-webgl', '--disable-webgl2'], ...executable });
  browsers.push(blocked);
  const fallbackPage = await blocked.newPage();
  // The plain address is the 3D game; without WebGL it points to the original full shift.
  await fallbackPage.goto(server.resolvedUrls.local[0]);
  await fallbackPage.getByText('The 3D night shift needs WebGL').waitFor();
  assert.equal(await fallbackPage.getByRole('link', { name: 'Play the original full shift instead' }).getAttribute('href'), '/?mode=classic');
  console.log('PASS default 3D entry explains a missing WebGL renderer and links to ?mode=classic');

  const browser = await chromium.launch({
    headless: true, ...executable,
    args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  // Software renderers deliver animation frames about once a second on CI, while
  // the shift runs on its own timer. Conditions are polled every 10 ms rather
  // than per frame so brief windows (a parcel in reach) are not missed.
  const waitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = (fn, arg, options = {}) => waitForFunction(fn, arg, { polling: 10, ...options });
  if (process.env.BELT_BROWSER_CPU_RATE) {
    const diagnostics = await page.context().newCDPSession(page);
    await diagnostics.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.BELT_BROWSER_CPU_RATE) });
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  await page.addInitScript(() => {
    window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; event.detail.playPrologue = false; });
    // Each countdown step is recorded as it is drawn; SORT! is on screen for only 350 ms.
    window.fixtureCountdown = [];
    new MutationObserver(() => {
      const copy = document.querySelector('.b3d-count')?.textContent;
      if (copy && window.fixtureCountdown.at(-1) !== copy) window.fixtureCountdown.push(copy);
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.goto(url);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing');
  const read = (fn, arg) => page.evaluate(fn, arg);
  console.log(`3D quality: ${await read(() => window.fixtureApp.quality)}`);
  assert.equal(await read(() => typeof window.Phaser), 'undefined', '3D mode must not load the Phaser engine');
  assert.deepEqual(await read(() => [...window.fixtureApp.world.residents.keys()].sort()),
    ['aj', 'bannerman', 'ben', 'brian', 'donna', 'doris', 'fruitloop', 'hussan'], 'the eight resident coworkers must be present');
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-briefing.png') });

  // These checks cover the preserved shift; the mid-shift break has its own suite.
  await read(() => (window.fixtureApp.model.autonomousCoworker = false, window.fixtureApp.forceStory({ breakAtMs: 1e12 })));
  // The night opens outside UPS, then the scrum; ENTER skips each scene.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureApp.state === 'story' && window.fixtureApp.story.chapter === 'arrival');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureApp.cutscene?.scene.id === 'scrum');
  await page.keyboard.press('Enter');
  await page.locator('.b3d-count', { hasText: '3' }).waitFor();
  assert.equal(await read(() => window.fixtureApp.model.elapsedMs), 0, 'the shift clock waits for 3, 2, 1, SORT!');
  await page.waitForFunction(() => window.fixtureApp.state === 'playing', null, { timeout: 90_000 });
  assert.deepEqual(await read(() => window.fixtureCountdown), ['3', '2', '1', 'SORT!'], 'the original countdown is shown in order');

  await page.evaluate(() => {
    // Keep the extra everyday freight out of the long reference-event fixtures.
    // The gameplay-adjustments suite exercises the full default workload.
    window.fixtureEverydayCleanup ??= setInterval(() => {
      const model = window.fixtureApp?.model;
      if (!model) return;
      const named = new Set(['MALLWOOD RD EAST','GOJI BERRIES','LIVE LOBSTERS','LE DUCK','MAKEUP LOTION','MESA BOOGIE','PANCHETTERS','SMALL ATV','ENVELOPE','SMALL BOX','PARCEL','BIG BOX','LONG BOX','THE SNAKES CELL']);
      for (const parcel of model.packages) if (parcel.state === 'belt' && !named.has(parcel.label)) parcel.state = 'delivered';
    }, 10);
  });

  // Termite steps to the belt edge inside dock A with the real D key, grabs the
  // first parcel as it arrives and delivers it with a real Space press.
  // Kylie's anchoring is sampled in the page from now on (see below).
  await read(() => {
    window.kylieSamples = [];
    let overviewSince = null;
    const timer = setInterval(() => {
      const app = window.fixtureApp;
      overviewSince = app.overview ? overviewSince ?? performance.now() : null;
      const bubble = app.overlay.activeSpeech().find((item) => item.speaker === 'KYLIE');
      if (!bubble || overviewSince === null || performance.now() - overviewSince < 900) return;
      const actor = app.crew.actors.get('kylie');
      const head = actor.root.position.clone();
      head.y += actor.character.headHeight + 0.35;
      head.project(app.camera);
      const width = app.renderer.domElement.clientWidth;
      const height = app.renderer.domElement.clientHeight;
      window.kylieSamples.push({ edge: bubble.edge, dx: Math.abs(bubble.x - (head.x + 1) / 2 * width), dy: Math.abs(bubble.y - (1 - head.y) / 2 * height) });
      if (window.kylieSamples.length > 40) clearInterval(timer);
    }, 50);
  });
  await page.keyboard.down('KeyD');
  // Windows CI's input round trip can take seconds, longer than a parcel
  // stays in reach. This one grab dispatches Space through the game's own
  // keyboard handler from inside the page, at the moment the parcel arrives.
  // Every other key in this check is a native key press.
  await read(() => new Promise((resolve) => {
    const timer = setInterval(() => {
      const m = window.fixtureApp.model;
      const parcel = m.nearestPackage();
      if (!(parcel?.state === 'belt' && parcel.y > m.activeWorker.y - 45 && parcel.y < m.activeWorker.y)) return;
      clearInterval(timer);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
      // V opens the overview while Kylie is still searching for her coffee.
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV', key: 'v' }));
      resolve();
    }, 5);
  }));
  await page.keyboard.up('KeyD');
  const held = await read(() => window.fixtureApp.model.heldPackage && { label: window.fixtureApp.model.heldPackage.label, route: window.fixtureApp.model.heldPackage.route });
  assert.deepEqual(held, { label: 'MALLWOOD RD EAST', route: 'A' });
  // Align with the open rear door, then enter using real movement input.
  await read(() => { window.fixtureApp.model.activeWorker.y = window.fixtureApp.model.layout.dockA.y; });
  await page.keyboard.down('KeyA');
  await page.waitForFunction(() => window.fixtureApp.model.activeWorker.x < 302);
  await page.keyboard.up('KeyA');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.fixtureApp.model.sorted === 1);
  assert.deepEqual(await read(() => ({ sorted: window.fixtureApp.model.sorted, score: window.fixtureApp.model.score })), { sorted: 1, score: 100 });

  // Kylie's three original coffee lines arrive in order with her name.
  await page.waitForFunction(() => window.fixtureApp.overlay.history.filter((line) => line.startsWith('KYLIE: ')).length === 3, null, { timeout: 120_000 });
  assert.deepEqual(await read(() => window.fixtureApp.overlay.history.filter((line) => line.startsWith('KYLIE: '))),
    ['KYLIE: WHERE IS MY TIMMY HORTANS', 'KYLIE: MY TIMMY HORTANS?!', 'KYLIE: WHO TOOK MY TIMMY HORTANS']);
  // In the overview her bubble is anchored above her head, not pinned to a corner.
  await page.waitForFunction(() => window.kylieSamples.length > 0, null, { timeout: 60_000 });
  const anchoring = await read(() => window.kylieSamples);
  assert.ok(anchoring.every((sample) => !sample.edge), "Kylie's bubble must sit at her position in the overview");
  assert.ok(anchoring.every((sample) => sample.dx < 4 && sample.dy < 60), `bubble must follow Kylie (${JSON.stringify(anchoring[0])})`);
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-overview.png') });
  await page.keyboard.press('KeyV');

  // John retains the warning and now performs random sets of proper squats.
  await page.waitForFunction(() => window.fixtureApp.overlay.history.includes("JOHN RUSHTON: DON'T STACK BOXES ON BOXES!"), null, { timeout: 120_000 });
  await page.waitForFunction(() => window.fixtureApp.crew.actors.get('john').pose === 'shout');
  await page.waitForFunction(() => window.fixtureApp.crew.actors.get('john').pose === 'squat', null, { timeout: 60_000 });

  // A brake brings Shan out for his first original rant. Belt state is sampled
  // every 10 ms from the press, since a slow runner's round trips can outlast
  // the two-second hold.
  await read(() => {
    window.brakeSamples = [];
    const timer = setInterval(() => {
      const m = window.fixtureApp.model;
      window.brakeSamples.push({ held: m.brakeRemainingMs > 0, speed: m.beltSpeed });
      if (window.brakeSamples.length >= 2000) clearInterval(timer);
    }, 10);
  });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.fixtureApp.overlay.activeSpeech().some((item) => item.speaker === "SHAN O'MAC"));
  assert.equal(await read(() => window.fixtureApp.overlay.activeSpeech().find((item) => item.speaker === "SHAN O'MAC").text), '!@#%!');
  assert.equal(await read(() => window.fixtureApp.crew.actors.get('shan').root.visible), true);
  const brakeHeld = await read(() => window.brakeSamples.filter((sample) => sample.held));
  assert.ok(brakeHeld.length > 0 && brakeHeld.every((sample) => sample.speed === 0), 'the brake must stop the belt while it holds');

  // Pause freezes the shift; Enter resumes. Tab hands off to Skanky.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.fixtureApp.state === 'paused');
  const pausedAt = await read(() => window.fixtureApp.model.elapsedMs);
  await page.waitForTimeout(500);
  assert.equal(await read(() => window.fixtureApp.model.elapsedMs), pausedAt);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureApp.state === 'playing');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.fixtureApp.model.activeWorker.id === 'skanky');
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-follow.png') });
  assert.deepEqual(errors, []);
  console.log('PASS 3D preview countdown, real-key grab/deliver, anchored Kylie lines, Shan brake rant, pause/resume and handoff; no script errors');

  // Crew routines. Later cues use a synthetic shift clock, as the 2D reference
  // suite does; belt freight is cleared so a slow software renderer cannot
  // fail the shift while it waits. The routines themselves run unmodified.
  const clearFreight = () => read(() => {
    for (const parcel of window.fixtureApp.model.packages) {
      if (parcel.state === 'belt' || parcel.state === 'missed') parcel.state = 'delivered';
    }
  });
  const jump = async (ms) => { await clearFreight(); await read((t) => { window.fixtureApp.model.elapsedMs = t; }, ms); };
  const spoken = (copy) => page.waitForFunction((line) => window.fixtureApp.overlay.history.includes(line), copy, { timeout: 60_000 });
  const crew = (fn, arg) => read(fn, arg);
  // The first Mesa after 34 s starts Vic's offer; a reused parcel stands in for it.
  const placeMesa = (roll) => read((r) => {
    const app = window.fixtureApp;
    const m = app.model;
    app.mesa.roll = () => r;
    const parcel = m.packages.find((item) => item.state === 'delivered') ?? m.packages[0];
    Object.assign(parcel, { kind: 'mesa', label: 'MESA BOOGIE', route: 'C', size: 'heavy', state: 'belt', workerId: null, x: 480, y: 230, beltOffset: 230 - m.beltTravel });
    m.elapsedMs = 34_400;
    return parcel.id;
  }, roll);

  // Doris's freight trip: she carries a parcel from the belt side to her truck.
  await jump(15_700);
  await page.waitForFunction(() => window.fixtureApp.crew.actors.get('doris').carrying, null, { timeout: 60_000 });

  await jump(23_400);
  await spoken('VIC: I NEED A QUICK TUNE UP');
  await jump(25_200);
  await page.waitForFunction(() => window.fixtureApp.crew.massageStage === 'lying');
  assert.equal(await crew(() => window.fixtureApp.crew.actors.get('aj').pose), 'massage', 'AJ massages Vic');
  assert.equal(await crew(() => window.fixtureApp.crew.towel.visible), true, 'Vic lies under a towel');
  assert.equal(await crew(() => {
    const app = window.fixtureApp, y = app.crew.towel.position.z * 32 + 340;
    return y > app.model.layout.crewTruckRows[1] + 36 && y < app.model.layout.crewTruckRows[2] - 36;
  }), true, 'the massage plays in the space between truck rows');

  // Mesa: keyboard N leaves it on the belt and the shift resumes.
  await clearFreight();
  const mesaId = await placeMesa(0.9);
  await page.waitForFunction(() => window.fixtureApp.overlay.notices.includes('VIC SPOTTED THE MESA'), null, { timeout: 60_000 });
  assert.equal(await read(() => window.fixtureApp.state), 'mesa');
  await page.locator('.b3d-panel h1', { hasText: 'VIC WANTS THE MESA' }).waitFor({ timeout: 60_000 });
  assert.match(await page.locator('.b3d-panel').innerText(), /1 IN 5 SHAN O MAC CATCHES YOU BOTH\./);
  assert.ok((await read(() => window.fixtureApp.overlay.history)).includes("VIC: STEAL IT? I'LL TOSS IT IN THE SUV."));
  const mesaFrozen = await read(() => window.fixtureApp.model.elapsedMs);
  await page.keyboard.press('KeyN');
  await page.waitForFunction(() => window.fixtureApp.overlay.notices.includes('MESA STAYS ON THE BELT'));
  assert.equal(await read(() => window.fixtureApp.state), 'playing');
  assert.equal(await read((id) => window.fixtureApp.model.packages.find((item) => item.id === id).state, mesaId), 'belt', 'leaving keeps the Mesa');
  assert.equal(await read(() => window.fixtureApp.mesa.rolls), 0, 'leaving never rolls');
  assert.ok(mesaFrozen === 34_400, 'the shift clock waits during the choice');

  await jump(39_900);
  await spoken('HUSSAN: THE SNAKES CELL!');
  await page.waitForFunction(() => window.fixtureApp.crew.snakeState === 'dancing', null, { timeout: 90_000 });
  assert.deepEqual(await crew(() => ({ held: window.fixtureApp.crew.cellCaption.visible, belt: window.fixtureApp.crew.cell.tag.visible })),
    { held: true, belt: false }, 'the belt label THE SNAKES CELL becomes the held CELL label');
  // Step through the 3.2 s dance rather than waiting it out on a slow renderer.
  await read(() => { window.fixtureApp.model.elapsedMs += 3150; });
  await page.waitForFunction(() => window.fixtureApp.crew.snakeState === 'done', null, { timeout: 90_000 });

  // Ben's robbery: a separate story clock while the shift, belt and freight stay frozen.
  await jump(67_950);
  await page.waitForFunction(() => window.fixtureApp.state === 'interlude', null, { timeout: 60_000 });
  assert.equal(await read(() => window.fixtureApp.crew.crewFreight.get('ben').root.visible), false, "Ben's routine parcel does not float during the story");
  const frozen = await read(() => ({ t: window.fixtureApp.model.elapsedMs, travel: window.fixtureApp.model.beltTravel }));
  // The story is sampled every 10 ms, so brief stages cannot be missed.
  await read(() => {
    window.storySeen = { stages: [], marker: false, gateAndDemon: false, outsideBay: [] };
    const timer = setInterval(() => {
      const pieces = window.fixtureApp.setPieces;
      if (window.storySeen.stages.at(-1) !== pieces.benStage) window.storySeen.stages.push(pieces.benStage);
      window.storySeen.marker ||= pieces.deadMarker.visible;
      window.storySeen.gateAndDemon ||= pieces.gate.visible && pieces.demon.visible;
      const app = window.fixtureApp;
      for (const id of ['ben', 'gunman', 'paula']) {
        const root = app.crew.actors.get(id).root;
        if (!root.visible) continue;
        const y = root.position.z * 32 + 340;
        if (y < app.model.layout.crewTruckRows[2] + 48 || y > app.model.layout.crewTruckRows[3] - 48) {
          if (!window.storySeen.outsideBay.includes(id)) window.storySeen.outsideBay.push(id);
        }
      }
      if (window.fixtureApp.state !== 'interlude' && window.fixtureApp.state !== 'paused') clearInterval(timer);
    }, 10);
  });
  const story = (clock) => read((c) => { window.fixtureApp.benClock = c; }, clock);
  await spoken("GUNMAN: I'M GOING TO ROB THIS PLACE!");
  await story(71_950);
  await spoken("BEN: DON'T WORRY GUYS I GOT THIS I TOOK TRAINING ON HOW TO DODGE GUNS");
  const onlyStoryCast = await read(() => window.fixtureApp.overlay.activeSpeech().every((item) => ['GUNMAN', 'BEN', 'PAULA ABDUL'].includes(item.speaker)));
  assert.ok(onlyStoryCast, 'other speech waits during the story');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.fixtureApp.state === 'paused');
  const pausedStory = await read(() => window.fixtureApp.benClock);
  await page.waitForTimeout(400);
  assert.equal(await read(() => window.fixtureApp.benClock), pausedStory, 'pause freezes the story clock');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureApp.state === 'interlude');
  await story(77_300);
  await page.waitForFunction(() => window.storySeen.stages.includes('dodge'));
  await story(80_050);
  await page.waitForFunction(() => window.fixtureApp.setPieces.shotsFired === 5);
  await page.waitForFunction(() => window.storySeen.marker);
  await story(81_750);
  await page.waitForFunction(() => window.storySeen.stages.includes('demon'));
  await story(83_350);
  await page.waitForFunction(() => window.storySeen.stages.includes('drag'));
  await story(85_050);
  await page.waitForFunction(() => window.storySeen.stages.includes('sink'));
  await story(86_350);
  await spoken('PAULA ABDUL: GREAT NOW WHICH BITCH IS GOING TO LOAD MY FUCKING TRUCK');
  assert.equal(await read(() => window.fixtureApp.crew.actors.get('ben').root.visible), false, 'Ben has been taken');
  assert.deepEqual(await read(() => ({ t: window.fixtureApp.model.elapsedMs, travel: window.fixtureApp.model.beltTravel })), frozen,
    'shift clock and belt stay frozen through the story');
  await story(92_450);
  await page.waitForFunction(() => window.fixtureApp.state === 'playing');
  const seen = await read(() => window.storySeen);
  assert.ok(seen.marker, 'Ben falls with X_X');
  assert.ok(seen.gateAndDemon, 'the gate opens and the demon rises');
  assert.deepEqual(seen.outsideBay, [], 'the entire robbery, dodge, drag and Paula scene stays between parked trucks');
  const order = ['threat', 'boast', 'dodge', 'demon', 'drag', 'sink', 'paula'];
  assert.deepEqual(seen.stages.filter((stage) => order.includes(stage)).filter((stage, index, list) => list.indexOf(stage) === index), order,
    'the story stages play in their original order');
  assert.equal(await read(() => window.fixtureApp.crew.benGone && window.fixtureApp.overlay.hold === null), true);
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-ben-return.png') });

  // Vic presses STOP and the belt really stops; Shan rants and restarts it.
  await jump(95_900);
  await page.waitForFunction(() => window.fixtureApp.setPieces.buttonStage === 'stopped');
  await spoken('VIC: BELT STOPPED');
  const stoppedFor = await read(() => new Promise((resolve) => {
    const m = window.fixtureApp.model;
    const travel = m.beltTravel;
    const clock = m.elapsedMs;
    setTimeout(() => resolve({ moved: m.beltTravel - travel, elapsed: m.elapsedMs - clock, stopped: m.eventStopped }), 400);
  }));
  assert.ok(stoppedFor.elapsed > 0 && (stoppedFor.moved === 0 || !stoppedFor.stopped), `the belt is stopped while the shift runs (${JSON.stringify(stoppedFor)})`);
  const shanLines = await read(() => window.fixtureApp.overlay.history.filter((line) => line.startsWith("SHAN O'MAC: ")).length);
  // Shan's press must reach the rendered arm, not just the pose name.
  await read(() => {
    window.shanPress = false;
    const timer = setInterval(() => {
      const shan = window.fixtureApp.crew.actors.get('shan');
      if (shan.pose === 'press' && Math.abs(shan.character.rightArm.rotation.x + 1.2) < 0.25) window.shanPress = true;
      if (window.shanPress || window.fixtureApp.model.elapsedMs > 104_000) clearInterval(timer);
    }, 10);
  });
  await jump(101_550);
  await page.waitForFunction(() => window.fixtureApp.setPieces.buttonStage === 'running');
  await page.waitForFunction(() => window.shanPress, null, { timeout: 30_000 });
  await spoken("SHAN O'MAC: BELT RUNNING");
  assert.equal(await read(() => window.fixtureApp.model.eventStopped), false);
  assert.ok(await read((n) => window.fixtureApp.overlay.history.filter((line) => line.startsWith("SHAN O'MAC: ")).length >= n + 2, shanLines), 'Shan rants before restarting');

  // Ralph: five separate trips, each lifting one real crate off the bulk stock.
  await clearFreight();
  await read(() => { window.fixtureApp.bulkVisible = 6; window.fixtureApp.model.bulkSorted = 6; });
  await page.waitForFunction(() => window.fixtureApp.setPieces.ralphState !== 'waiting');
  const ralphStart = await read(() => window.fixtureApp.setPieces.ralphStart);
  const ralphAt = (offset) => read((t) => { window.fixtureApp.model.elapsedMs = t; }, ralphStart + offset);
  await ralphAt(1850);
  await spoken('RALPH: I NEED TO HURRY UP AND GET BACK TO MY 3 SETS OF TRIPLETS!');
  for (let trip = 0; trip < 5; trip += 1) {
    await ralphAt(1800 + trip * 3000 + 1700);
    await page.waitForFunction((n) => window.fixtureApp.setPieces.ralphLifted >= n, trip + 1);
    // Read the lifted count and the pile together so a later trip cannot interleave.
    const pile = await read(() => ({ lifted: window.fixtureApp.setPieces.ralphLifted, stock: window.fixtureApp.world.bulkStack.children.filter((crate) => crate.visible).length }));
    assert.equal(pile.stock, 6 - pile.lifted, `each of Ralph's trips removes exactly one crate (${JSON.stringify(pile)})`);
  }
  await ralphAt(1800 + 15_000 - 50);
  await page.waitForFunction(() => window.fixtureApp.world.ralphLoad.filter((crate) => crate.visible).length === 5);
  await ralphAt(1800 + 15_000 + 2300);
  await page.waitForFunction(() => window.fixtureApp.setPieces.ralphState === 'done');
  assert.equal(await read(() => window.fixtureApp.world.ralphTruck.visible), false, 'RALPH 5 TON drives away');

  await jump(133_900);
  await spoken("SHAN O'MAC: TERMITE AND SKANKY HAVE BOTH WON A FREE PAID DAY OFF FROM UNITED WAY");
  await jump(135_900);
  // The whole remaining floor reacts; Ben stays gone after the demon took him.
  await page.waitForFunction(() => window.fixtureApp.crew.ensemble.size === 7);
  assert.equal(await read(() => window.fixtureApp.crew.ensemble.has('ben')), false);
  const swears = [['HUSSAN', 'WHAT THE FUCK'], ['FRUIT LOOP', 'BULLSHIT'], ['AJ', 'YOU GOTTA BE FUCKING KIDDING'],
    ['DORIS', 'FUCK THIS'], ['BANNERMAN', 'ARE YOU FUCKING SERIOUS'], ['DONNA', 'SON OF A BITCH']];
  for (const [index, [who, line]] of swears.entries()) {
    if (index % 2 === 0) await jump(138_600 + index / 2 * 3500 - 50);
    await spoken(`${who}: ${line}`);
  }
  await jump(149_050);
  await spoken('BRIAN: WHAT THE FUCK');

  // Near the end the drivers arrive: one engine, its exhaust, coughing, the rest, and Shan.
  await read(() => window.fixtureApp.crew.reset());
  await jump(117_100);
  await page.waitForFunction(() => window.fixtureApp.crew.drivers.filter((driver) => driver.root.visible).length === window.fixtureApp.world.trucks.length);
  assert.equal(await crew(() => window.fixtureApp.world.trucks.length), 12, 'all ten original trucks plus the two new ones');
  assert.equal(await crew(() => window.fixtureApp.crew.runningEngines(119_999)), 0);
  assert.equal(await crew(() => window.fixtureApp.crew.runningEngines(120_000)), 1, 'the first engine starts with one minute left');
  await jump(125_500);
  await page.waitForFunction(() => window.fixtureApp.crew.runningEngines(window.fixtureApp.model.elapsedMs) === 12);
  for (const [at, line] of [[157_000, 'HUSSAN: COUGH!'], [158_400, "AJ: Could've waited five minutes."], [161_600, 'DORIS: HACK!'],
    [163_300, 'HUSSAN: COUGH COUGH!'], [165_400, "SHAN O'MAC: Belt's still moving."], [168_600, 'DORIS: UGH, EXHAUST!']]) {
    await jump(at - 50);
    await spoken(line);
  }
  assert.equal(await crew(() => window.fixtureApp.crew.runningEngines(window.fixtureApp.model.elapsedMs)), 12, 'every other truck has started');
  assert.ok(await crew(() => window.fixtureApp.model.beltSpeed > 0), 'the belt keeps moving through the exhaust');
  assert.equal(await crew(() => window.fixtureApp.crew.drivers.some((driver) => driver.root.visible)), false, 'drivers board their trucks');

  // Receiving: the dockhand stands at the intake while unloaders feed the line.
  const dockhand = await crew(() => {
    const p = window.fixtureApp.crew.dockhand.root.position;
    return { x: p.x * 32 + 480, y: p.z * 32 + 340 };
  });
  assert.ok(dockhand.x >= 400 && dockhand.x <= 430, 'the dockhand stands beside the intake');
  assert.ok(depotSolidFootprints(L, L.crewTruckRows, L.playerTruckDepth).every(rect => !overlapsFootprint(dockhand, DEPOT_BODY_RADIUS, rect)), 'the dockhand stays clear of the belt casing');

  // A winning clock-out: lines, celebration and every truck departing.
  const truckStart = await crew(() => window.fixtureApp.world.trucks.map((truck) => truck.group.position.x));
  await read(() => {
    const m = window.fixtureApp.model;
    for (const parcel of m.packages) if (parcel.state !== 'delivered') parcel.state = 'delivered';
    m.sorted = m.goal;
    m.elapsedMs = m.durationMs - 20;
  });
  await page.waitForFunction(() => window.fixtureApp.state === 'celebrating', null, { timeout: 30_000 });
  await spoken('TERMITE: SHIFT DONE!');
  await spoken('SKANKY: CLOCKED OUT!');
  // The celebration clock is stepped to each pair of resident lines.
  for (const [index, line] of ['WE MADE IT!', 'GO HOME!', 'CLOCK OUT!', 'SHIFT DONE!', 'TRUCKS OUT!', "BELT'S DEAD!", 'WE SURVIVED!', 'LAST TRUCK OUT!'].entries()) {
    if (index % 2 === 0) await read((at) => { window.fixtureApp.crew.celebrationMs = Math.max(window.fixtureApp.crew.celebrationMs, at); }, 2650 + index / 2 * 2500);
    await page.waitForFunction((copy) => window.fixtureApp.overlay.history.some((entry) => entry.endsWith(`: ${copy}`) && !entry.startsWith('TERMITE') && !entry.startsWith('SKANKY')), line, { timeout: 120_000 });
  }
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-clockout.png') });
  const truckEnd = await crew(() => window.fixtureApp.world.trucks.map((truck) => truck.group.position.x));
  truckEnd.forEach((x, index) => assert.ok(Math.abs(x - truckStart[index]) > 4, `truck ${index} must drive out`));
  await read(() => { window.fixtureApp.crew.celebrationMs = Math.max(window.fixtureApp.crew.celebrationMs, 12_950); });
  // The warehouse is finished, but the night is not: the results wait for a five-ton run, here Skanky's mall run (M).
  await page.waitForFunction(() => window.fixtureApp.state === 'run-choice', null, { timeout: 120_000 });
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => window.fixtureApp.cutscene?.scene.id === 'mall-assignment', null, { timeout: 120_000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureApp.cutscene?.scene.id === 'drive-to-mall');
  await read(() => window.fixtureApp.restart());
  await page.waitForFunction(() => window.fixtureApp.state === 'briefing');
  assert.deepEqual(errors, []);
  console.log('PASS 3D crew routines and set pieces: John, freight trip, massage/towel, Mesa leave, CELL dance, Ben/gunman/five shots/demon/Paula with frozen shift, Ralph five loads, Vic/Shan buttons, United Way, staggered engines/exhaust/coughs with both approved lines, dockhand, clock-out into the mall assignment; no script errors');

  // Mesa steal (touch/click), safe roll: Skanky's thought, the bedroom dream, same shift resumes.
  const begin = async () => {
    await read(() => { window.fixtureApp.model.autonomousCoworker = false; });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.fixtureApp.state === 'story');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.fixtureApp.cutscene?.scene.id === 'scrum');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.fixtureApp.state === 'countdown' || window.fixtureApp.state === 'playing');
    await page.waitForFunction(() => window.fixtureApp.state === 'playing', null, { timeout: 90_000 });
  };
  await begin();
  await clearFreight();
  await placeMesa(0.9);
  await page.locator('button[data-action="steal"]').waitFor({ timeout: 60_000 });
  const sortedBefore = await read(() => window.fixtureApp.model.sorted);
  await page.locator('button[data-action="steal"]').click();
  await page.waitForFunction(() => window.fixtureApp.state === 'dream', null, { timeout: 60_000 });
  assert.ok((await read(() => window.fixtureApp.overlay.history)).includes('SKANKY: MESA AT HOME'));
  assert.match(await page.locator('.b3d-dream').textContent(), /MESA AT HOME[\s\S]*ONE MORE GAME\.[\s\S]*THE BELT CAN WAIT A MINUTE\./);
  const dreamCopy = await read(() => {
    const words = [];
    window.fixtureApp.dream.scene.traverse((object) => { if (object.material?.map?.image?.getContext) words.push(object.material.map.image); });
    return words.length;
  });
  assert.ok(dreamCopy >= 6, 'posters, monitor, Lumines and amp labels are drawn in the room');
  // The two figures carry a motion record (seated, holding the guitar and the controller), so a crew model plays a seated idle under the hand-set arms.
  await page.waitForTimeout(700);
  const dreamMotion = await read(() => {
    const app = window.fixtureApp, d = app.dream;
    const report = c => ({ seated: c.motion?.seated, holding: c.motion?.holding, time: c.motion?.time, model: Boolean(c.root.getObjectByName('character-model')), role: app.clipRoleOf(c) });
    return { quality: app.quality, skanky: report(d.skanky), trmyte: report(d.trmyte) };
  });
  for (const who of ['skanky', 'trmyte']) {
    const m = dreamMotion[who];
    assert.ok(m.seated === true && m.holding === true && m.time > 0, `${who} in the dream is seated and holding, with a running clock: ${JSON.stringify(m)}`);
    if (m.model) assert.ok(['sitIdle', 'sitIdleAlt', 'sitLookAround'].includes(m.role), `${who}'s model plays a seated idle in the dream: ${JSON.stringify(m)}`);
  }
  // Each hand closes on what it holds: a point a hand's length along its fingers lies on the guitar or the controller.
  // With only the wrists placed, Trmyte's hands hung past the controller's ends and Skanky's lay open over the neck.
  const grips = await read(() => {
    const app = window.fixtureApp, d = app.dream, out = {};
    const V = (x = 0, y = 0, z = 0) => app.camera.position.clone().set(x, y, z);
    const Box = app.world.physicalBounds(d.controller).constructor;
    // The held things' parts in their own frames (the guitar's meshes are merged into Skanky's body; its group keeps the
    // frame): the guitar's body and its neck, tilted 0.2 rad about its centre, and the controller's shell.
    const parts = {
      guitar: [{ box: new Box(V(-0.25, -0.25, -0.04), V(0.36, 0.26, 0.04)) },
        { box: new Box(V(-0.35, -0.03, -0.02), V(0.35, 0.03, 0.02)), at: V(0.55, 0.12, 0), turn: 0.2 }],
      controller: [{ box: new Box(V(-0.095, -0.025, -0.05), V(0.095, 0.025, 0.05)) }],
    };
    for (const [who, c, held, name] of [['skanky', d.skanky, d.guitar, 'guitar'], ['trmyte', d.trmyte, d.controller, 'controller']]) {
      held.updateWorldMatrix(true, false);
      for (const side of ['left', 'right']) {
        const hand = c[`${side}Hand`];
        hand.updateWorldMatrix(true, false);
        const tip = held.worldToLocal(hand.localToWorld(V(0, -0.09, 0)));
        out[`${who} ${side}`] = +Math.min(...parts[name].map(({ box, at, turn }) => {
          const p = tip.clone();
          if (at) p.sub(at).applyAxisAngle(V(0, 0, 1), -turn);
          return box.distanceToPoint(p);
        })).toFixed(3);
      }
    }
    return out;
  });
  for (const [hand, gap] of Object.entries(grips)) assert.ok(gap < 0.025, `${hand} hand closes on what it holds: ${JSON.stringify(grips)}`);
  if (process.env.BELT_SCREENSHOT_DIR) {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-dream.png') });
  }
  await page.waitForFunction(() => window.fixtureApp.state === 'playing', null, { timeout: 120_000 });
  const resumedAt = await read(() => window.fixtureApp.model.elapsedMs);
  assert.ok(resumedAt >= 34_400 && resumedAt < 60_000, `the dream returns to the same shift (${resumedAt})`);
  assert.equal(await read(() => window.fixtureApp.model.sorted), sortedBefore, 'stolen freight is not a dispatch');
  assert.equal(await read(() => window.fixtureApp.mesa.rolls), 1);

  // Mesa caught by Shan: deduct points, resume this same shift.
  await read(() => window.fixtureApp.restart());
  assert.equal(await read(() => window.fixtureApp.crew.actors.get('ben').character.nameTag.visible), true, "a restart restores Ben's name tag");
  await begin();
  await clearFreight();
  await placeMesa(0.1);
  await read(() => { window.fixtureApp.model.score = 1000; });
  await page.locator('button[data-action="steal"]').waitFor({ timeout: 60_000 });
  await page.keyboard.press('KeyY');
  await page.locator('.b3d-panel h1', { hasText: 'BUSTED BY SHAN O MAC' }).waitFor();
  assert.match(await page.locator('.b3d-panel').innerText(), /500 POINTS · SHIFT CONTINUES/);
  await page.waitForFunction(() => window.fixtureApp.state === 'playing', null, { timeout: 60_000 });
  assert.equal(await read(() => window.fixtureApp.model.score), 500);
  assert.equal(await read(() => window.fixtureApp.model.ended), false);
  assert.deepEqual(errors, []);
  console.log('PASS 3D Mesa: keyboard leave, click steal into the bedroom dream and same-shift return, keyboard steal caught by Shan; no script errors');

  // Touch: a phone-sized touch browser plays with the on-screen controls only.
  // The desktop page is closed first so its WebGL resources are released.
  await page.close();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const touchPage = await phone.newPage();
  const touchSession = await phone.newCDPSession(touchPage);
  if (process.env.BELT_BROWSER_CPU_RATE) {
    await touchSession.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.BELT_BROWSER_CPU_RATE) });
  }
  const touchErrors = [];
  touchPage.on('pageerror', (error) => touchErrors.push(error.message));
  const touchConsole = [];
  touchPage.on('console', (message) => touchConsole.push(`${message.type()}: ${message.text()}`));
  const touchWait = touchPage.waitForFunction.bind(touchPage);
  const waitTouch = (fn, arg, options = {}) => touchWait(fn, arg, { polling: 10, ...options });
  const readTouch = (fn, arg) => touchPage.evaluate(fn, arg);
  await touchPage.addInitScript(() => window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; event.detail.playPrologue = false; }));
  await touchPage.goto(url);
  await waitTouch(() => window.fixtureApp?.state === 'briefing' || document.querySelector('.b3d-fallback'), null, { timeout: 60_000 })
    .catch((error) => { throw new Error(`touch page did not start: ${error.message}
errors: ${touchErrors.join(' | ')}
console: ${touchConsole.slice(-10).join(' | ')}`); });
  assert.equal(await touchPage.locator('.b3d-fallback').count(), 0, `touch page fell back to 2D; console: ${touchConsole.slice(-10).join(' | ')}`);
  await touchPage.locator('.b3d-more summary').click();
  assert.match(await touchPage.locator('.b3d-panel').innerText(), /The stick moves\. SWITCH changes worker\./, 'touch players get touch instructions');
  assert.equal(await touchPage.locator('.b3d-touch').isVisible(), false, 'controls wait for the shift to start');
  await readTouch(() => (window.fixtureApp.model.autonomousCoworker = false, window.fixtureApp.forceStory({ breakAtMs: 1e12 })));
  await touchPage.getByRole('button', { name: /START THE NIGHT/ }).tap();
  // Story scenes are skipped with the on-screen SKIP SCENE button.
  await waitTouch(() => window.fixtureApp.state === 'story');
  await touchPage.locator('[data-story="skip"]').tap();
  await waitTouch(() => window.fixtureApp.cutscene?.scene.id === 'scrum');
  await touchPage.locator('[data-story="next"]').tap();
  await waitTouch(() => window.fixtureApp.cutscene?.index >= 1);
  await touchPage.locator('[data-story="skip"]').tap();
  await waitTouch(() => window.fixtureApp.state === 'playing', null, { timeout: 90_000 });
  assert.equal(await touchPage.locator('[data-touch="throw"]').isVisible(), true, 'touch players can throw');
  await touchPage.locator('.b3d-stick').waitFor();
  // Pushing the stick up moves Termite up his lane.
  const startY = await readTouch(() => window.fixtureApp.model.activeWorker.y);
  const stick = await touchPage.locator('.b3d-stick').boundingBox();
  // Real touch points, not a mouse: press, drag up, release.
  const centre = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [centre] });
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centre.x, y: stick.y + 4 }] });
  await waitTouch(() => window.fixtureApp.touch.move.y < -0.5);
  await waitTouch((y) => window.fixtureApp.model.activeWorker.y < y - 40, startY, { timeout: 30_000 });
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitTouch(() => window.fixtureApp.touch.move.x === 0 && window.fixtureApp.touch.move.y === 0);
  // GRAB / DELIVER: Termite walks back to the dock edge and takes the first parcel as it arrives.
  await readTouch(() => { const w = window.fixtureApp.model.activeWorker; w.x = 400; w.y = 500; });
  await readTouch(() => new Promise((resolve) => {
    const timer = setInterval(() => {
      const m = window.fixtureApp.model;
      const parcel = m.nearestPackage();
      if (!(parcel?.state === 'belt' && parcel.y > m.activeWorker.y - 45 && parcel.y < m.activeWorker.y)) return;
      clearInterval(timer);
      document.querySelector('[data-touch="grab"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
      resolve();
    }, 5);
  }));
  assert.equal(await readTouch(() => window.fixtureApp.model.heldPackage?.label), 'MALLWOOD RD EAST', 'GRAB picks up the parcel');
  await readTouch(() => { window.fixtureApp.model.activeWorker.y = window.fixtureApp.model.layout.dockA.y; });
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [centre] });
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x + 4, y: centre.y }] });
  await waitTouch(() => window.fixtureApp.model.activeWorker.x < 302);
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchPage.locator('[data-touch="grab"]').tap();
  await waitTouch(() => window.fixtureApp.model.sorted === 1);
  await touchPage.locator('[data-touch="switch"]').tap();
  await waitTouch(() => window.fixtureApp.model.activeWorker.id === 'skanky');
  await touchPage.locator('[data-touch="brake"]').tap();
  await waitTouch(() => window.fixtureApp.model.brakeCooldownMs > 0);
  await waitTouch(() => window.fixtureApp.overlay.activeSpeech().some((item) => item.speaker === "SHAN O'MAC"));
  await touchPage.locator('[data-touch="view"]').tap();
  await waitTouch(() => window.fixtureApp.overview === true);
  await touchPage.locator('[data-touch="pause"]').tap();
  await waitTouch(() => window.fixtureApp.state === 'paused');
  await touchPage.locator('.b3d-touch').waitFor({ state: 'hidden' });
  await touchPage.getByRole('button', { name: /RESUME/ }).tap();
  await waitTouch(() => window.fixtureApp.state === 'playing');
  // Assistive activation: a plain click (no pointer press) still works, once.
  await readTouch(() => document.querySelector('[data-touch="view"]').click());
  await waitTouch(() => window.fixtureApp.overview === false);
  if (process.env.BELT_SCREENSHOT_DIR) await touchPage.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-touch.png') });
  assert.deepEqual(touchErrors, []);
  await phone.close();

  // The narrowest common phone keeps the stick and the action buttons apart.
  const small = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
  const smallPage = await small.newPage();
  await smallPage.addInitScript(() => window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; event.detail.playPrologue = false; }));
  await smallPage.goto(url);
  await smallPage.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { polling: 10, timeout: 60_000 });
  await smallPage.getByRole('button', { name: /START THE NIGHT/ }).tap();
  for (const scene of ['arrival', 'scrum']) {
    await smallPage.waitForFunction((id) => window.fixtureApp.state === 'story' && (id === 'arrival' || window.fixtureApp.cutscene?.scene.id === id), scene, { polling: 10, timeout: 60_000 });
    await smallPage.locator('[data-story="skip"]').tap();
  }
  await smallPage.locator('.b3d-stick').waitFor({ timeout: 90_000 });
  const smallStick = await smallPage.locator('.b3d-stick').boundingBox();
  const smallActions = await smallPage.locator('.b3d-actions').boundingBox();
  assert.ok(smallStick.x + smallStick.width + 8 <= smallActions.x,
    `stick and buttons must not overlap at 320px (${JSON.stringify({ smallStick, smallActions })})`);
  await small.close();
  console.log('PASS 3D touch: touch briefing, real touch stick drag/release, GRAB/DELIVER, SWITCH, BRAKE, VIEW, PAUSE/RESUME, assistive click activation and 320px layout; no script errors');
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
  await server.close();
}
