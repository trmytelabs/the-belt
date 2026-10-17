import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { KYLIE_QUOTES, SHAN_RANTS, WORKER_SWEARS, COUGH_LINES, SHOT_WORDS, CLOCK_OUT_LINES } from '../src/game/slice/DepotReferences.ts';

// These are isolated clock/cargo fixtures, not claims of organic play. The
// ordinary keyboard A/B/C loop and real touch controls run in slice-browser.
// Timed fixtures call the production Scene.update in small steps, preserving
// every intermediate event stage rather than jumping over setup and payoff.
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BELT_BROWSER_RENDERER === 'canvas' ? { args: ['--disable-webgl'] } : {}),
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '' }));
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ body: '' }));
  await page.addInitScript(() => {
    let phaser;
    Object.defineProperty(window, 'Phaser', { configurable: true, get: () => phaser, set: value => {
      phaser = value;
      const boot = value.Game.prototype.boot;
      value.Game.prototype.boot = function (...args) { window.fixtureGame = this; return boot.apply(this, args); };
    } });
  });
  await page.goto(`${server.resolvedUrls.local[0]}?mode=2d`);
  await page.waitForFunction(() => window.fixtureGame?.scene.isActive('DepotScene'));
  const read = fn => page.evaluate(fn);
  const press = key => page.keyboard.press(key, { delay: 40 });
  const screenshot = async name => {
    if (!process.env.BELT_SCREENSHOT_DIR) return;
    // Scene.update fixtures intentionally sleep the loop. Render a real frame
    // before capturing; otherwise canvas pixels would still show the old state.
    const sleeping = await read(() => !window.fixtureGame.loop.running);
    if (sleeping) {
      await read(() => window.fixtureGame.loop.wake());
      await page.waitForTimeout(80);
      await read(() => window.fixtureGame.loop.sleep());
    }
    await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, name) });
  };
  console.log(`Reference renderer: ${await read(() => window.fixtureGame.renderer.type === 2 ? 'WebGL' : 'Canvas')}`);
  await press('Enter');
  const workerAtCountdown = await read(() => ({ ...window.fixtureGame.scene.getScene('DepotScene').model.activeWorker }));
  await page.keyboard.down('ArrowUp');
  await press('Space');
  for (const copy of ['3', '2', '1', 'SORT!']) {
    await page.waitForFunction(copy => window.fixtureGame.scene.getScene('DepotScene').children.list.some(item => item.type === 'Text' && item.text === copy), copy);
    assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.elapsedMs), 0,
      'the original countdown must finish before the shift clock and freight move');
  }
  await page.keyboard.up('ArrowUp');
  assert.deepEqual(await read(() => ({ ...window.fixtureGame.scene.getScene('DepotScene').model.activeWorker })), workerAtCountdown,
    'movement and grab controls must remain gated during countdown');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'playing');
  const truckNames = await read(() => window.fixtureGame.scene.getScene('DepotScene').depot.departureObjects
    .flatMap(({ object }) => (object.list ?? []).filter(child => child.type === 'Text')
      .map(child => ({ text: child.text.replace(/\s+/g, ' ').trim(), size: Number.parseFloat(child.style.fontSize) }))));
  for (const name of ['HUSSAN', 'AJ', 'PAULA ABDUL', 'BANNERMAN', 'FRUIT LOOP', 'BRIAN', 'DORIS', 'DONNA']) {
    assert.ok(truckNames.some(label => label.text === name && label.size >= 8), `${name} must be readable on its actual truck`);
  }
  const truckLayout = await read(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    const trucks = scene.depot.departureObjects.map(({ object }) => object)
      .filter(object => object.getData('truckFootprint'));
    return [...trucks, scene.life.routines.ralphTruck].map(object => ({
      name: object.getData('truckLabel'), x: object.x, y: object.y,
      footprint: object.getData('truckFootprint'), width: object.width, height: object.height,
      scaleX: object.scaleX, scaleY: object.scaleY,
    }));
  });
  assert.equal(truckLayout.length, 11, 'both player trucks, eight crew trucks and Ralph must use the same renderer');
  for (const truck of truckLayout) {
    assert.deepEqual(truck.footprint, { width: 148, height: 84 }, truck.name);
    assert.deepEqual([truck.width, truck.height, truck.scaleX, truck.scaleY], [148, 84, 1, 1], `${truck.name} must render at the common size`);
  }
  for (const [name, x, y] of [
    ['HUSSAN', 244, 148], ['AJ', 244, 244], ['PAULA ABDUL', 244, 340], ['BANNERMAN', 244, 436],
    ['FRUIT LOOP', 716, 148], ['DORIS', 716, 244], ['BRIAN', 716, 340], ['DONNA', 716, 436],
    ['HERES UR SOVICE', 268, 532], ['PAYTMAN', 692, 532],
  ]) {
    const truck = truckLayout.find(truck => truck.name === name);
    assert.deepEqual([truck?.x, truck?.y], [x, y], `${name} must occupy its original truck bay`);
  }
  await read(() => {
    window.fixtureGame.loop.sleep();
    window.referenceWindows = { left: [], right: [] };
    window.renderedFreightLabels = new Set();
  });
  const advance = async target => page.evaluate(target => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    while (scene.model.elapsedMs < target) {
      if (scene.state === 'interlude') {
        scene.update(scene.time.now, 100);
        continue;
      }
      if (scene.state !== 'playing') throw new Error(`Fixture unexpectedly stopped at ${scene.model.elapsedMs}: ${scene.state}`);
      scene.toastUntil = 0;
      for (const parcel of scene.model.packages) {
        const view = scene.parcels.get(parcel.id);
        if (view?.container.visible) {
          const label = view.container.list.find(child => child.type === 'Text'
            && child.visible && child.text.replace(/\s+/g, ' ').trim() === parcel.label);
          if (label && Number.parseFloat(label.style.fontSize) >= 9) window.renderedFreightLabels.add(parcel.label);
        }
        parcel.state = 'delivered';
      }
      for (const worker of scene.model.workers) worker.heldId = null;
      scene.update(scene.time.now, Math.min(100, target - scene.model.elapsedMs));
      for (const side of ['left', 'right']) {
        const bubble = scene.life.speech.get(side);
        const copy = bubble?.panel.list.filter(child => child.type === 'Text').map(child => child.text.replace(/\n/g, ' '));
        const records = window.referenceWindows[side];
        const last = records.at(-1);
        if (last && last.copy === copy?.[1] && last.name === copy?.[0]) last.end = scene.model.elapsedMs;
        else if (copy) records.push({ name: copy[0], copy: copy[1], start: scene.model.elapsedMs, end: scene.model.elapsedMs });
      }
    }
  }, target);
  const advanceInterlude = async target => page.evaluate(target => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    while (scene.life.benInterludeTime < target) {
      if (scene.state !== 'interlude') throw new Error(`Ben sequence stopped at ${scene.life.benInterludeTime}: ${scene.state}`);
      scene.update(scene.time.now, Math.min(100, target - scene.life.benInterludeTime));
    }
  }, target);
  const snapshot = () => read(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    const r = s.life.routines;
    return {
      time: s.model.elapsedMs, travel: s.model.beltTravel, eventStopped: s.model.eventStopped,
      snakeState: r.snakeState, cell: { x: r.cell.x, y: r.cell.y, visible: r.cell.visible },
      hussan: { x: s.life.cast.get('hussan').art.x, y: s.life.cast.get('hussan').art.y, angle: s.life.cast.get('hussan').art.rotation },
      ralphState: r.ralphState, ralphLoaded: r.ralphLoaded, ralphLifted: r.ralphLifted,
      ralphTruckX: r.ralphTruck.x, ralphTruckVisible: r.ralphTruck.visible,
      ralphCargo: r.ralphTruck.getData('loadedBoxes').filter(box => box.visible).length,
      ralphBoxVisible: r.ralphBox.visible, stock: s.depot.bulkStockCount,
      drivers: r.drivers.filter(driver => driver.visible).length, exhaustCommands: r.exhaust.commandBuffer.length,
      crewLoads: Object.fromEntries(r.crewLoads),
      crewCarried: [...r.crewFreight.values()].filter(parcel => parcel.visible).length,
      towel: s.life.towel.visible, bang: s.life.bang.visible ? s.life.bang.text : null,
      dead: s.life.deadMarker.visible, ben: s.life.cast.get('ben').art.visible,
      demon: s.life.cast.get('demon').art.visible, paula: s.life.cast.get('paula').art.visible,
      demonScale: s.life.cast.get('demon').art.scaleX,
      benX: s.life.cast.get('ben').art.x, benY: s.life.cast.get('ben').art.y,
      johnX: s.life.cast.get('john').art.x, johnVisible: s.life.cast.get('john').art.visible,
      gunman: s.life.cast.get('gunman').art.visible,
    };
  });
  await advance(13_100);
  const johnEntering = await snapshot();
  await advance(13_700);
  assert.ok((await snapshot()).johnX > johnEntering.johnX, 'John must physically enter before his yell and crouch');
  await advance(15_000);
  const coffeeWindows = await read(() => Object.values(window.referenceWindows).flat().filter(record => record.name === 'KYLIE'));
  assert.deepEqual(coffeeWindows.map(record => record.copy), KYLIE_QUOTES.map(copy => copy.replace(/\n/g, ' ')));
  assert.ok(coffeeWindows.every(record => record.end - record.start >= 3300), 'each coffee variant must be visibly readable, not merely logged');
  await advance(20_600);
  assert.ok(Object.values((await snapshot()).crewLoads).every(count => count > 0), 'all eight coworkers must finish an actual freight trip');
  await advance(25_100);
  assert.equal((await snapshot()).towel, true, 'Vic must lie under a towel while AJ works');
  await advance(40_100);
  const cellStart = await snapshot();
  assert.equal(cellStart.snakeState, 'belt');
  assert.equal(cellStart.cell.visible, true);
  await advance(40_350);
  const cellMoving = await snapshot();
  assert.ok(Math.abs((cellMoving.cell.y - cellStart.cell.y) - (cellMoving.travel - cellStart.travel)) < 1e-8,
    'the separate CELL prop must share exact belt displacement');
  await advance(40_900);
  assert.ok(['collecting', 'dancing'].includes((await snapshot()).snakeState));
  await advance(41_600);
  const dance = await snapshot();
  assert.equal(dance.snakeState, 'dancing');
  assert.ok(Math.abs(dance.cell.x - dance.hussan.x) < 18 && Math.abs(dance.cell.y - dance.hussan.y) < 9,
    'the collected prop must remain in Hussan\'s hands during his dance');
  assert.ok(await read(() => window.fixtureGame.scene.getScene('DepotScene').life.routines.cell.list.some(item => item.type === 'Text' && item.visible && item.text === 'CELL')),
    'the held event prop must change to its original CELL label');
  await read(() => window.fixtureGame.loop.wake());
  await press('Escape');
  const pausedDance = await snapshot();
  await page.waitForTimeout(200);
  assert.deepEqual(await snapshot(), pausedDance, 'pause must freeze the CELL dance, freight routines and belt together');
  await press('Escape');
  await read(() => window.fixtureGame.loop.sleep());
  await screenshot('after-cell-fixture.png');
  await advance(46_500);
  assert.equal((await snapshot()).snakeState, 'done');
  assert.equal((await snapshot()).cell.visible, false);
  assert.ok((await snapshot()).hussan.x < 240, 'Hussan must return from the intake after dancing');

  await advance(67_900);
  // Preserve meaningful live cargo, a held parcel and recovery freight across
  // the cinematic. This controlled fixture isolates freeze semantics.
  await read(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    for (const parcel of s.model.packages) parcel.state = 'delivered';
    const [belt, held, missed] = s.model.packages;
    Object.assign(belt, { state: 'belt', x: 480, y: 535, beltOffset: 535 - s.model.beltTravel, workerId: null });
    const worker = s.model.workers[0];
    Object.assign(held, { state: 'held', x: worker.x + 18, y: worker.y - 17, workerId: worker.id });
    worker.heldId = held.id;
    Object.assign(missed, { state: 'missed', workerId: null, missCounted: true });
    for (let attempts = 0; attempts < 5 && s.state === 'playing'; attempts++) s.update(s.time.now, 100);
    for (const view of s.parcels.values()) view.transferUntil = 0;
    s.syncWorld(0);
  });
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').state), 'interlude');
  assert.equal(await page.locator('.depot-touch').isVisible(), false, 'touch sorting controls must be unavailable while the event owns the scene');
  const frozenWarehouse = () => read(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    return {
      elapsed: s.model.elapsedMs, travel: s.model.beltTravel, score: s.model.score,
      sorted: s.model.sorted, missed: s.model.missed, backlog: s.model.pileup,
      cooldown: s.model.brakeCooldownMs, brake: s.model.brakeRemainingMs,
      packages: s.model.packages.map(parcel => ({ ...parcel })),
      workers: s.model.workers.map(worker => ({ ...worker })), tread: s.depot.belt.tilePositionY,
      colleagues: [...s.life.cast].filter(([id]) => !['ben', 'gunman', 'demon', 'paula'].includes(id))
        .map(([id, { art }]) => ({ id, x: art.x, y: art.y, angle: art.rotation, visible: art.visible })),
      crewLoads: [...s.life.routines.crewLoads],
    };
  });
  const frozen = await frozenWarehouse();
  await advanceInterlude(68_500);
  assert.equal((await snapshot()).gunman, true);
  await advanceInterlude(72_100);
  const benPanel = await read(() => window.fixtureGame.scene.getScene('DepotScene').life.speech.get('left').panel.list.filter(x => x.type === 'Text').map(x => x.text));
  assert.equal(benPanel[0], 'BEN');
  assert.ok(benPanel[1].includes('DODGE GUNS'));
  await read(() => window.fixtureGame.loop.wake());
  await page.keyboard.down('ArrowDown');
  await press('Space');
  await press('Tab');
  await press('KeyE');
  await page.keyboard.up('ArrowDown');
  assert.deepEqual(await frozenWarehouse(), frozen, 'movement, actions, sorting, spawning and coworker routines must freeze during the joke');
  await press('Escape');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').state), 'paused');
  const pausedIncident = await read(() => window.fixtureGame.scene.getScene('DepotScene').life.benInterludeTime);
  await page.waitForTimeout(200);
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').life.benInterludeTime), pausedIncident,
    'Escape must pause the interlude clock itself');
  await press('Escape');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').state), 'interlude',
    'resume must return to the joke, not restart sorting early');
  await read(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'paused');
  const blurIncident = await read(() => window.fixtureGame.scene.getScene('DepotScene').life.benInterludeTime);
  await page.waitForTimeout(150);
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').life.benInterludeTime), blurIncident,
    'losing focus must freeze the cinematic as well as freight');
  await read(() => window.dispatchEvent(new Event('focus')));
  await press('Escape');
  await read(() => window.fixtureGame.loop.sleep());
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').state), 'interlude');
  const shotWords = [];
  await advanceInterlude(77_300);
  const dodgeStart = await snapshot();
  await advanceInterlude(78_100);
  const dodgeNext = await snapshot();
  assert.ok(Math.abs(dodgeNext.benX - dodgeStart.benX) + Math.abs(dodgeNext.benY - dodgeStart.benY) > 10,
    'Ben must demonstrate the dodge training before the shots');
  for (const time of [78_520, 78_780, 79_200, 79_520, 80_040]) {
    await advanceInterlude(time); shotWords.push((await snapshot()).bang);
  }
  assert.deepEqual(shotWords, [...SHOT_WORDS], 'five distinct cartoon impacts must render in the original sequence');
  assert.equal((await snapshot()).dead, true);
  await advanceInterlude(82_000);
  assert.equal((await snapshot()).demon, true);
  const emergingDemon = await snapshot();
  await advanceInterlude(82_700);
  await screenshot('after-gate-fixture.png');
  await advanceInterlude(83_300);
  assert.ok((await snapshot()).demonScale > emergingDemon.demonScale + 0.3,
    'the adult demon must visibly rise to full size before dragging Ben');
  const dragStart = await snapshot();
  await screenshot('after-incident.png');
  await advanceInterlude(84_600);
  assert.ok((await snapshot()).benX < dragStart.benX - 10, 'the demon must visibly drag Ben toward the portal before he disappears');
  await advanceInterlude(86_500);
  assert.equal((await snapshot()).ben, false);
  assert.equal((await snapshot()).paula, true);
  const paulaPanel = await read(() => window.fixtureGame.scene.getScene('DepotScene').life.speech.get('left').panel.list.filter(x => x.type === 'Text').map(x => x.text));
  assert.equal(paulaPanel[0], 'PAULA ABDUL');
  assert.equal(paulaPanel[1], 'GREAT\nNOW WHICH BITCH\nIS GOING TO LOAD\nMY FUCKING TRUCK');
  assert.deepEqual(await frozenWarehouse(), frozen, 'the entire warehouse must remain intact through the demon and Paula payoff');
  await advanceInterlude(92_500);
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').state), 'playing');
  assert.deepEqual(await frozenWarehouse(), frozen, 'the completion frame must not advance freight or consume held input');
  await read(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    s.update(s.time.now, 100);
  });
  const resumed = await frozenWarehouse();
  assert.ok(resumed.elapsed > frozen.elapsed && resumed.travel > frozen.travel, 'the next gameplay frame must resume normally');
  assert.equal(resumed.workers[0].heldId, frozen.workers[0].heldId, 'the carried parcel must survive the entire cinematic');
  assert.ok(Math.abs((resumed.packages[0].y - frozen.packages[0].y) - (resumed.travel - frozen.travel)) < 1e-8,
    'resumed freight must keep exact belt contact, without a catch-up jump');

  await read(() => { window.fixtureGame.scene.getScene('DepotScene').model.bulkSorted = 5; });
  await advance(90_100);
  const ralphArriving = await snapshot();
  assert.equal(ralphArriving.ralphState, 'entering');
  assert.equal(ralphArriving.stock, 5);
  await advance(92_000);
  assert.equal((await snapshot()).ralphState, 'loading');
  assert.ok((await snapshot()).ralphTruckX < ralphArriving.ralphTruckX, 'Ralph truck must drive into the depot');
  await advance(92_700);
  assert.equal((await snapshot()).paula, false);
  const firstPickup = await read(() => window.fixtureGame.scene.getScene('DepotScene').life.routines.ralphStart + 3400);
  await advance(firstPickup);
  const bulkContact = await read(() => {
    const r = window.fixtureGame.scene.getScene('DepotScene').life.routines;
    return { box: { x: r.ralphBox.x, y: r.ralphBox.y, visible: r.ralphBox.visible },
      truck: { x: r.ralphTruck.x, y: r.ralphTruck.y } };
  });
  assert.deepEqual(bulkContact.box, { x: 480, y: 610, visible: true }, 'Ralph must lift from the same central bulk pile used for C deliveries');
  assert.deepEqual(bulkContact.truck, { x: 840, y: 606 }, 'Ralph must park clear of Paytman and the loading lanes');
  for (let trip = 0; trip < 5; trip++) {
    await advance(93_600 + trip * 3000);
    const lifted = await snapshot();
    assert.equal(lifted.ralphLifted, trip + 1);
    assert.equal(lifted.stock, 4 - trip, 'each lifted package must disappear from accumulated bulk stock');
    assert.equal(lifted.ralphBoxVisible, true);
    await advance(94_900 + trip * 3000);
    const loaded = await snapshot();
    assert.equal(loaded.ralphLoaded, trip + 1);
    assert.equal(loaded.ralphCargo, trip + 1, 'every delivered box must appear on the truck');
    if (trip === 0) {
      await advance(96_100);
      const stopped = await snapshot();
      assert.equal(stopped.eventStopped, true, 'Vic must physically stop the real belt');
      const contact = await read(() => {
        const s = window.fixtureGame.scene.getScene('DepotScene');
        const p = s.model.packages[0];
        Object.assign(p, { state: 'belt', x: 480, y: 350, beltOffset: 350 - s.model.beltTravel });
        const before = { y: p.y, travel: s.model.beltTravel };
        s.update(s.time.now, 100);
        return { before, after: { y: p.y, travel: s.model.beltTravel }, drawnY: s.parcels.get(p.id).container.y, tread: s.depot.belt.tilePositionY };
      });
      assert.deepEqual(contact.after, contact.before, 'a real parcel must stop with the tread during Vic\'s event');
      assert.equal(contact.drawnY, contact.after.y);
      assert.equal(contact.tread, -contact.after.travel);
      await advance(96_400);
      assert.equal((await snapshot()).travel, stopped.travel, 'tread travel must freeze during the scripted interruption');
    } else if (trip === 2) {
      await advance(101_900);
      assert.equal((await snapshot()).eventStopped, false, 'Shan must restore the belt after reaching its button');
      const restarted = await snapshot();
      await advance(102_100);
      assert.ok((await snapshot()).travel > restarted.travel);
    }
  }
  await advance(109_500);
  assert.equal((await snapshot()).ralphState, 'done');
  assert.equal((await snapshot()).ralphTruckVisible, false);
  assert.equal((await snapshot()).eventStopped, false);
  await advance(115_000);
  assert.equal((await snapshot()).drivers, 10, 'all original truck drivers must appear with the exhaust event');
  assert.ok((await snapshot()).exhaustCommands > 0);
  await advance(120_000);
  assert.equal((await snapshot()).drivers, 0);
  assert.ok((await snapshot()).exhaustCommands > 0, 'exhaust continues after drivers get back into their trucks');
  await advance(130_000);
  await advance(149_500);
  const renderedLabels = await read(() => [...window.renderedFreightLabels]);
  for (const name of ['MALLWOOD RD EAST', 'GOJI BERRIES', 'LIVE LOBSTERS', 'LE DUCK', 'MAKEUP LOTION', 'MESA BOOGIE', 'PANCHETTERS', 'SMALL ATV']) {
    assert.ok(renderedLabels.includes(name), `${name} must appear in full on spawned freight, not only in the HUD or model`);
  }
  const dialogueWindows = await read(() => Object.values(window.referenceWindows).flat());
  for (const copy of [...COUGH_LINES, ...WORKER_SWEARS]) {
    const window = dialogueWindows.find(record => record.copy === copy.replace(/\n/g, ' '));
    assert.ok(window && window.end - window.start >= 2500, `${copy} must receive a readable visible window`);
  }
  await read(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    s.model.sorted = s.model.goal;
  });
  await advance(180_000);
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').state), 'celebrating');
  assert.ok((await read(() => window.fixtureGame.scene.getScene('DepotScene').life.history)).includes('TERMITE: SHIFT DONE!'));
  assert.ok((await read(() => window.fixtureGame.scene.getScene('DepotScene').life.history)).includes('SKANKY: CLOCKED OUT!'));
  const truckStarts = await read(() => window.fixtureGame.scene.getScene('DepotScene').depot.departureObjects.map(({ object }) => object.x));
  for (const target of [3000, 5500, 8000, 10_500]) {
    await page.evaluate(target => {
      const s = window.fixtureGame.scene.getScene('DepotScene');
      while (s.life.celebrationMs < target) s.update(s.time.now, 100);
    }, target);
    const index = target === 3000 ? 0 : target === 5500 ? 2 : target === 8000 ? 4 : 6;
    const copies = await read(() => [...window.fixtureGame.scene.getScene('DepotScene').life.speech.values()]
      .map(b => b.panel.list.filter(x => x.type === 'Text')[1].text));
    assert.ok(copies.includes(CLOCK_OUT_LINES[index]) && copies.includes(CLOCK_OUT_LINES[index + 1]));
  }
  const departed = await read(() => window.fixtureGame.scene.getScene('DepotScene').depot.departureObjects.map(({ object }) => object.x));
  assert.ok(departed.every((x, i) => Math.abs(x - truckStarts[i]) >= 1000), 'every named truck must actually leave before results');
  await read(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    while (s.state === 'celebrating') s.update(s.time.now, 100);
    window.fixtureGame.loop.wake();
  });
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').state), 'results');

  // Each encounter uses a fresh scene, real choice controls and an isolated
  // deterministic risk fixture. The production encounter has no testing hook.
  const restart = async () => {
    await read(() => { window.fixtureGame.loop.wake(); window.fixtureGame.scene.getScene('DepotScene').scene.restart(); });
    await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'briefing');
    await press('Enter');
    await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'playing');
  };
  await restart();
  await read(() => {
    window.fixtureGame.loop.sleep();
    window.referenceWindows = { left: [], right: [] };
  });
  await advance(3000);
  // DOM key presses still reach Phaser while its frame loop sleeps (the
  // between-frame input check also verifies this). Keep this fixture's clock
  // controlled: live frames between samples can consume a short rant before
  // its readable window is recorded on a slower runner.
  await press('KeyE');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').model.brakeRemainingMs > 0);
  await advance(14_200);
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').life.speech.get('right').id), 'shan');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').life.cast.get('shan').art.visible), true,
    'Shan must reappear for the delayed rant instead of speaking from offscreen');
  for (const time of [16_000, 24_000, 32_000, 40_000, 48_000, 56_000, 72_000]) {
    await advance(time);
    const ready = await read(() => {
      const model = window.fixtureGame.scene.getScene('DepotScene').model;
      return model.elapsedMs + model.brakeCooldownMs + 100;
    });
    await advance(ready);
    await press('KeyE');
    await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').model.brakeRemainingMs > 0, undefined, { timeout: 5000 });
    await advance(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.elapsedMs + 4100));
  }
  const rants = await read(() => Object.values(window.referenceWindows).flat().filter(record => record.name === 'SHAN O MACK'));
  for (const quote of SHAN_RANTS) {
    assert.ok(rants.some(record => record.copy === quote.replace(/\n/g, ' ') && record.end - record.start >= 3500),
      `actual brake controls must expose the complete readable rant: ${quote}`);
  }
  const arrangeMesa = async roll => {
    await page.evaluate(roll => {
      const s = window.fixtureGame.scene.getScene('DepotScene');
      s.mesa.roll = () => roll;
      s.model.elapsedMs = 34_100;
      s.model.score = 1234;
      const parcel = s.model.packages[0];
      Object.assign(parcel, { kind: 'mesa', label: 'MESA BOOGIE', state: 'held', workerId: 'skanky', route: 'C' });
      s.model.workers[1].heldId = parcel.id;
    }, roll);
    await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'mesa');
    await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').mesa.stage === 'choice');
  };
  await restart();
  await arrangeMesa(0.5);
  const choice = await read(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    return { elapsed: s.model.elapsedMs, travel: s.model.beltTravel, score: s.model.score, held: s.model.workers[1].heldId };
  });
  await page.waitForTimeout(200);
  assert.deepEqual(await read(() => {
    const s = window.fixtureGame.scene.getScene('DepotScene');
    return { elapsed: s.model.elapsedMs, travel: s.model.beltTravel, score: s.model.score, held: s.model.workers[1].heldId };
  }), choice, 'Mesa choice must freeze the clock and belt without losing carried cargo');
  await screenshot('after-mesa-choice-fixture.png');
  await press('KeyN');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'playing');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.workers[1].heldId), choice.held);
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').mesa.stage), 'done');
  await restart();
  await arrangeMesa(0.5);
  await press('KeyY');
  await page.waitForFunction(() => window.fixtureGame.scene.isActive('MesaDreamScene'));
  assert.equal(await read(() => window.fixtureGame.scene.isPaused('DepotScene')), true);
  // Emit the same browser focus lifecycle event consumed by production Phaser;
  // do not mutate the scene's focus flag or resume it directly.
  await read(() => window.dispatchEvent(new Event('blur')));
  const dreamCopy = await read(() => {
    const found = [];
    function visit(item) { if (item.type === 'Text') found.push(item.text.replace(/\n/g, ' ')); if (item.list) item.list.forEach(visit); }
    window.fixtureGame.scene.getScene('MesaDreamScene').children.list.forEach(visit);
    return found;
  });
  for (const label of ['BULK RULES', 'PAYTMAN SUCKS', 'NO REPEATS', 'BUILT THE BELT', 'MESA BOOGIE', 'LUMINES', 'PS3']) assert.ok(dreamCopy.includes(label));
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('MesaDreamScene').cameras.main.fadeEffect.progress >= 1);
  await screenshot('after-mesa-dream-fixture.png');
  await page.waitForFunction(() => window.fixtureGame.scene.isActive('DepotScene') && !window.fixtureGame.scene.isActive('MesaDreamScene'));
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').state), 'paused',
    'leaving focus during the dream must return to a paused warehouse');
  await read(() => window.dispatchEvent(new Event('focus')));
  await press('Escape');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').state), 'playing');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.score), 1234, 'dream must resume the same shift, not reset progress');
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.workers[1].heldId), null);
  assert.equal(await read(() => window.fixtureGame.scene.getScene('DepotScene').model.packages[0].state), 'delivered');
  await restart();
  await arrangeMesa(0.1);
  const bounds = await page.locator('canvas').boundingBox();
  await page.touchscreen.tap(bounds.x + 376 / 960 * bounds.width, bounds.y + 451 / 720 * bounds.height);
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'results');
  assert.equal(await read(() => window.fixtureGame.scene.isActive('MesaDreamScene')), false);
  assert.ok(await read(() => window.fixtureGame.scene.getScene('DepotScene').overlay.list.some(item => item.text === 'BUSTED BY SHAN O MAC')),
    'the advertised unlucky outcome must actually end the shift with its original consequence');
  assert.deepEqual(errors, []);
  console.log('PASS rendered quote windows, crew freight, CELL contact/dance, five shots and demon/Paula, five Ralph loads, exhaust/coughs, clock-out departures, Mesa keyboard/touch leave/dream/caught; no script errors');
  await context.close();
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
