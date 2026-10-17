import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

// The 3D preview needs WebGL. CI's GPU-free runners provide it through
// SwiftShader, so this suite requests that explicitly rather than inheriting
// the Canvas-fallback flag the Phaser suites use. A second browser with WebGL
// disabled checks the explanatory fallback.
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const url = `${server.resolvedUrls.local[0]}?mode=3d`;
const executable = process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' };
const browsers = [];
try {
  const blocked = await chromium.launch({ headless: true, args: ['--disable-webgl', '--disable-webgl2'], ...executable });
  browsers.push(blocked);
  const fallbackPage = await blocked.newPage();
  await fallbackPage.goto(url);
  await fallbackPage.getByText('This preview needs WebGL').waitFor();
  assert.equal(await fallbackPage.getByRole('link', { name: 'Play the full 2D night shift instead' }).count(), 1);
  console.log('PASS 3D preview explains a missing WebGL renderer and links to the 2D shift');

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
    window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; });
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

  await page.keyboard.press('Enter');
  await page.locator('.b3d-count', { hasText: '3' }).waitFor();
  assert.equal(await read(() => window.fixtureApp.model.elapsedMs), 0, 'the shift clock waits for 3, 2, 1, SORT!');
  await page.waitForFunction(() => window.fixtureApp.state === 'playing', null, { timeout: 90_000 });
  assert.deepEqual(await read(() => window.fixtureCountdown), ['3', '2', '1', 'SORT!'], 'the original countdown is shown in order');

  // Termite steps to the belt edge inside dock A with the real D key, grabs the
  // first parcel as it arrives and delivers it with a real Space press.
  // Kylie's anchoring is sampled in the page from now on (see below).
  await read(() => {
    window.kylieSamples = [];
    let overviewSince = null;
    const timer = setInterval(() => {
      const app = window.fixtureApp;
      overviewSince = app.overview ? overviewSince ?? performance.now() : null;
      const bubble = app.overlay.activeSpeech().find((item) => item.speaker === 'KYLIE' && item.text === 'WHO TOOK MY\nTIMMY HORTANS');
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
      resolve();
    }, 5);
  }));
  await page.keyboard.up('KeyD');
  const held = await read(() => window.fixtureApp.model.heldPackage && { label: window.fixtureApp.model.heldPackage.label, route: window.fixtureApp.model.heldPackage.route });
  assert.deepEqual(held, { label: 'MALLWOOD RD EAST', route: 'A' });
  await page.keyboard.press('Space');
  assert.deepEqual(await read(() => ({ sorted: window.fixtureApp.model.sorted, score: window.fixtureApp.model.score })), { sorted: 1, score: 100 });

  // Kylie's three original coffee lines arrive in order with her name.
  await page.keyboard.press('KeyV');
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

  // John Rushton's scheduled visit follows on the ordinary clock: he yells, then crouches.
  await page.waitForFunction(() => window.fixtureApp.overlay.history.includes("JOHN RUSHTON: DON'T STACK BOXES ON BOXES!"), null, { timeout: 120_000 });
  await page.waitForFunction(() => window.fixtureApp.crew.actors.get('john').pose === 'shout');
  await page.waitForFunction(() => window.fixtureApp.crew.actors.get('john').pose === 'crouch', null, { timeout: 60_000 });

  // A brake brings Shan out for his first original rant. Belt state is sampled
  // every 10 ms from the press, since a slow runner's round trips can outlast
  // the two-second hold.
  await read(() => {
    window.brakeSamples = [];
    const timer = setInterval(() => {
      const m = window.fixtureApp.model;
      window.brakeSamples.push({ held: m.brakeRemainingMs > 0, speed: m.beltSpeed });
      if (window.brakeSamples.length >= 300) clearInterval(timer);
    }, 10);
  });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.fixtureApp.overlay.activeSpeech().some((item) => item.speaker === 'SHAN O MACK'));
  assert.equal(await read(() => window.fixtureApp.overlay.activeSpeech().find((item) => item.speaker === 'SHAN O MACK').text), '!@#%!');
  assert.equal(await read(() => window.fixtureApp.crew.actors.get('shan').root.visible), true);
  const brakeHeld = await read(() => window.brakeSamples.filter((sample) => sample.held));
  assert.ok(brakeHeld.length > 0 && brakeHeld.every((sample) => sample.speed === 0), 'the brake must stop the belt while it holds');

  // Pause freezes the shift; Enter resumes. Tab hands off to Skanky.
  await page.keyboard.press('Escape');
  assert.equal(await read(() => window.fixtureApp.state), 'paused');
  const pausedAt = await read(() => window.fixtureApp.model.elapsedMs);
  await page.waitForTimeout(500);
  assert.equal(await read(() => window.fixtureApp.model.elapsedMs), pausedAt);
  await page.keyboard.press('Enter');
  assert.equal(await read(() => window.fixtureApp.state), 'playing');
  await page.keyboard.press('Tab');
  assert.equal(await read(() => window.fixtureApp.model.activeWorker.id), 'skanky');
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
  const frozen = await read(() => ({ t: window.fixtureApp.model.elapsedMs, travel: window.fixtureApp.model.beltTravel }));
  // The story is sampled every 10 ms, so brief stages cannot be missed.
  await read(() => {
    window.storySeen = { stages: [], marker: false, gateAndDemon: false };
    const timer = setInterval(() => {
      const pieces = window.fixtureApp.setPieces;
      if (window.storySeen.stages.at(-1) !== pieces.benStage) window.storySeen.stages.push(pieces.benStage);
      window.storySeen.marker ||= pieces.deadMarker.visible;
      window.storySeen.gateAndDemon ||= pieces.gate.visible && pieces.demon.visible;
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
  assert.equal(await read(() => window.fixtureApp.state), 'paused');
  const pausedStory = await read(() => window.fixtureApp.benClock);
  await page.waitForTimeout(400);
  assert.equal(await read(() => window.fixtureApp.benClock), pausedStory, 'pause freezes the story clock');
  await page.keyboard.press('Enter');
  assert.equal(await read(() => window.fixtureApp.state), 'interlude');
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
  const shanLines = await read(() => window.fixtureApp.overlay.history.filter((line) => line.startsWith('SHAN O MACK: ')).length);
  await jump(101_750);
  await page.waitForFunction(() => window.fixtureApp.setPieces.buttonStage === 'running');
  await spoken('SHAN O MACK: BELT RUNNING');
  assert.equal(await read(() => window.fixtureApp.model.eventStopped), false);
  assert.ok(await read((n) => window.fixtureApp.overlay.history.filter((line) => line.startsWith('SHAN O MACK: ')).length >= n + 2, shanLines), 'Shan rants before restarting');

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

  await jump(114_100);
  await page.waitForFunction(() => window.fixtureApp.crew.drivers.filter((driver) => driver.root.visible).length === 10);
  for (const [index, line] of ['COUGH!', 'HACK!', 'COUGH COUGH!', 'UGH, EXHAUST!'].entries()) {
    await jump(116_000 + index * 3000 - 50);
    await spoken(`${index % 2 === 0 ? 'HUSSAN' : 'DORIS'}: ${line}`);
  }
  assert.equal(await crew(() => window.fixtureApp.crew.drivers.some((driver) => driver.root.visible)), false, 'drivers board their trucks');

  await jump(133_900);
  await spoken('SHAN O MACK: TERMITE AND SKANKY HAVE BOTH WON A FREE PAID DAY OFF FROM UNITED WAY');
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

  // Receiving: the dockhand stands at the intake while unloaders feed the line.
  const dockhand = await crew(() => window.fixtureApp.crew.dockhand.root.position.x);
  assert.ok(Math.abs(dockhand - (430 - 480) / 32) < 0.01, 'the dockhand stands beside the intake');

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
  await page.waitForFunction(() => window.fixtureApp.state === 'ended', null, { timeout: 120_000 });
  assert.match(await page.locator('.b3d-panel').innerText(), /SHIFT COMPLETE \/ GRADE/);
  assert.deepEqual(errors, []);
  console.log('PASS 3D crew routines and set pieces: John, freight trip, massage/towel, Mesa leave, CELL dance, Ben/gunman/five shots/demon/Paula with frozen shift, Ralph five loads, Vic/Shan buttons, drivers/exhaust/coughs, United Way, dockhand, clock-out; no script errors');

  // Mesa steal (touch/click), safe roll: Skanky's thought, the bedroom dream, same shift resumes.
  const begin = async () => {
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.fixtureApp.state === 'countdown' || window.fixtureApp.state === 'playing');
    await page.waitForFunction(() => window.fixtureApp.state === 'playing', null, { timeout: 90_000 });
  };
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureApp.state === 'briefing');
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
  if (process.env.BELT_SCREENSHOT_DIR) {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'after-3d-dream.png') });
  }
  await page.waitForFunction(() => window.fixtureApp.state === 'playing', null, { timeout: 120_000 });
  const resumedAt = await read(() => window.fixtureApp.model.elapsedMs);
  assert.ok(resumedAt >= 34_400 && resumedAt < 60_000, `the dream returns to the same shift (${resumedAt})`);
  assert.equal(await read(() => window.fixtureApp.model.sorted), sortedBefore, 'stolen freight is not a dispatch');
  assert.equal(await read(() => window.fixtureApp.mesa.rolls), 1);

  // Mesa steal (keyboard Y), caught roll: BUSTED BY SHAN O MAC ends the run.
  await read(() => window.fixtureApp.restart());
  await begin();
  await clearFreight();
  await placeMesa(0.1);
  await page.locator('button[data-action="steal"]').waitFor({ timeout: 60_000 });
  await page.keyboard.press('KeyY');
  await page.locator('.b3d-panel h1', { hasText: 'BUSTED BY SHAN O MAC' }).waitFor();
  await page.waitForFunction(() => window.fixtureApp.state === 'ended', null, { timeout: 60_000 });
  const caught = await page.locator('.b3d-panel').innerText();
  assert.match(caught, /SHIFT TERMINATED/);
  assert.match(caught, /Shan caught you and Vic trying to load the Mesa into the SUV\./);
  assert.match(caught, /GAME OVER/);
  assert.deepEqual(errors, []);
  console.log('PASS 3D Mesa: keyboard leave, click steal into the bedroom dream and same-shift return, keyboard steal caught by Shan; no script errors');
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
  await server.close();
}
