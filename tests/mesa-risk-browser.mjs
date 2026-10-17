import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';

// Synthetic parcels isolate the production encounter's risk decision. The
// constructor and every decision handler come from the actual built game.
// Nothing is injected into shipped code, persisted, or run in the user's tab.
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
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'playing');
  await page.keyboard.press('KeyM');
  const initial = await page.evaluate(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    window.fixtureInitialMesa = scene.mesa;
    window.fixtureRollCalls = 0;
    const usesNativeRandom = scene.mesa.roll === Math.random;
    scene.mesa.roll = () => { window.fixtureRollCalls += 1; return 0.19999999999999998; };
    scene.model.elapsedMs = 34_100;
    for (const parcel of scene.model.packages) parcel.state = 'delivered';
    for (const worker of scene.model.workers) worker.heldId = null;
    const parcel = {
      id: -901, route: 'C', kind: 'mesa', label: 'MESA BOOGIE', size: 'normal',
      x: scene.model.workers[1].x, y: scene.model.workers[1].y, state: 'held', workerId: 'skanky',
      beltOffset: 0, recovered: false, missCounted: false, broken: false, breakY: null,
    };
    scene.model.packages.push(parcel);
    scene.model.workers[1].heldId = parcel.id;
    return { usesNativeRandom, stealListeners: scene.input.keyboard.listenerCount('keydown-Y'),
      leaveListeners: scene.input.keyboard.listenerCount('keydown-N') };
  });
  assert.equal(initial.usesNativeRandom, true, 'a real new shift must use the unmodified browser Math.random by default');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').mesa.stage === 'choice');

  // Actual browser key repeat followed by actual touch cannot reroll a choice.
  await page.keyboard.down('KeyY');
  await page.keyboard.down('KeyY');
  await page.keyboard.up('KeyY');
  const bounds = await page.locator('#app canvas').boundingBox();
  const stealPoint = { x: bounds.x + 376 / 960 * bounds.width, y: bounds.y + 451 / 720 * bounds.height };
  await page.touchscreen.tap(stealPoint.x, stealPoint.y);
  await page.touchscreen.tap(stealPoint.x, stealPoint.y);
  assert.equal(await page.evaluate(() => window.fixtureRollCalls), 1, 'one theft must make exactly one roll despite repeat Y and extra taps');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'results');
  assert.equal(await page.evaluate(() => window.fixtureGame.scene.isActive('MesaDreamScene')), false);

  // Restart through the game's real input, then verify the previous encounter
  // and its input subscriptions cannot carry a prior result into the new shift.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.fixtureGame.scene.getScene('DepotScene').state === 'briefing');
  const restart = await page.evaluate(() => {
    const scene = window.fixtureGame.scene.getScene('DepotScene');
    return { fresh: scene.mesa !== window.fixtureInitialMesa, previousDisposed: window.fixtureInitialMesa.disposed,
      nativeRandom: scene.mesa.roll === Math.random, stage: scene.mesa.stage, seen: scene.mesa.seen,
      stealListeners: scene.input.keyboard.listenerCount('keydown-Y'), leaveListeners: scene.input.keyboard.listenerCount('keydown-N') };
  });
  assert.deepEqual(restart, { fresh: true, previousDisposed: true, nativeRandom: true, stage: 'idle', seen: false,
    stealListeners: initial.stealListeners, leaveListeners: initial.leaveListeners });

  const report = await page.evaluate(() => {
    const game = window.fixtureGame;
    const scene = game.scene.getScene('DepotScene');
    game.loop.sleep();
    const Encounter = scene.mesa.constructor;
    const Model = scene.model.constructor;
    const nativeRandom = Math.random;
    const storageBefore = JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } });
    const listenersBefore = [scene.input.keyboard.listenerCount('keydown-Y'), scene.input.keyboard.listenerCount('keydown-N'),
      scene.events.listenerCount('mesa-dream-finished'), scene.events.listenerCount(Phaser.Scenes.Events.SHUTDOWN)];
    const ensure = (condition, message) => { if (!condition) throw new Error(message); };
    let nextParcel = -1000;
    const make = (roll, reentrant = false) => {
      const model = new Model();
      model.elapsedMs = 34_100;
      model.paused = false;
      const parcel = { id: nextParcel--, route: 'C', kind: 'mesa', label: 'MESA BOOGIE', size: 'normal',
        x: model.workers[1].x, y: model.workers[1].y, state: 'held', workerId: 'skanky',
        beltOffset: 0, recovered: false, missCounted: false, broken: false, breakY: null };
      model.packages.push(parcel);
      model.workers[1].heldId = parcel.id;
      const callbacks = { begin: 0, finish: 0, caught: 0, thought: 0, offer: [] };
      let encounter;
      encounter = new Encounter(scene, model, {
        begin: () => { callbacks.begin += 1; }, finish: () => { callbacks.finish += 1; },
        caught: () => { callbacks.caught += 1; }, offer: value => callbacks.offer.push(value),
        thought: () => { callbacks.thought += 1; if (reentrant) encounter.chooseSteal(); },
      }, roll);
      encounter.update();
      ensure(encounter.stage === 'approach' && model.paused && callbacks.begin === 1, 'fixture must enter the real encounter approach');
      // Fire only the actual approach timer's callback, avoiding 1.1s of wall
      // time per isolated fixture. No stage or outcome is assigned by the test.
      const approach = encounter.timer;
      approach.remove(false);
      approach.callback.apply(approach.callbackScope, approach.args);
      ensure(encounter.stage === 'choice', 'real approach timer must show the real choice');
      const stealButton = encounter.panel.list.find(item => item.type === 'Rectangle' && item.x === 376);
      const tap = stealButton.listeners('pointerdown')[0];
      return { encounter, model, parcel, callbacks, tap,
        dispose() {
          encounter.destroy();
          // A synthetic fixture is disposed before its real scene shuts down.
          scene.events.off(Phaser.Scenes.Events.SHUTDOWN, encounter.destroy, encounter);
        } };
    };
    const outcome = fixture => fixture.encounter.stage === 'caught' ? 'caught' : fixture.encounter.stage === 'transition' ? 'safe' : fixture.encounter.stage;
    const key = repeat => ({ repeat, preventDefault() {} });
    const pointer = { event: { preventDefault() {} } };

    const boundaries = [];
    for (const [value, expected] of [[0, 'caught'], [0.19999999999999998, 'caught'], [0.2, 'safe'], [0.20000000000000004, 'safe'], [0.9999999999999999, 'safe']]) {
      let calls = 0;
      const fixture = make(() => { calls += 1; return value; }, true);
      scene.input.keyboard.emit('keydown-Y', key(true));
      ensure(calls === 0 && fixture.encounter.stage === 'choice', 'held-key repeat must not make a decision');
      scene.input.keyboard.emit('keydown-Y', key(false));
      fixture.tap(pointer);
      fixture.tap(pointer);
      scene.input.keyboard.emit('keydown-Y', key(false));
      fixture.encounter.chooseSteal();
      fixture.encounter.chooseLeave();
      ensure(calls === 1 && fixture.callbacks.thought === 1, 'keyboard, stale tap and reentrant attempts must roll and consume exactly once');
      ensure(outcome(fixture) === expected, `threshold ${value} must be ${expected}`);
      ensure(fixture.parcel.state === 'delivered' && fixture.parcel.workerId === null && fixture.model.workers[1].heldId === null,
        'one theft must consume exactly its parcel and release the held item');
      boundaries.push({ value, outcome: outcome(fixture), calls });
      fixture.dispose();
    }

    let leaveRolls = 0;
    const leave = make(() => { leaveRolls += 1; return 0; });
    scene.input.keyboard.emit('keydown-N', key(false));
    leave.tap(pointer);
    leave.encounter.chooseSteal();
    ensure(leaveRolls === 0 && leave.encounter.stage === 'done' && leave.callbacks.finish === 1, 'Leave must resume without rolling');
    ensure(leave.parcel.state === 'held' && leave.model.workers[1].heldId === leave.parcel.id && !leave.model.paused,
      'Leave must preserve the held parcel');
    leave.dispose();

    let freshRolls = 0;
    const freshOutcomes = [];
    for (const value of [0.1, 0.9, 0.1]) {
      const fixture = make(() => { freshRolls += 1; return value; });
      fixture.tap(pointer);
      freshOutcomes.push(outcome(fixture));
      fixture.dispose();
    }
    ensure(freshRolls === 3 && freshOutcomes.join(',') === 'caught,safe,caught', 'every new attempt must roll independently without a cached outcome');

    let deterministicCaught = 0;
    let deterministicRolls = 0;
    for (let index = 0; index < 1000; index++) {
      const fixture = make(() => { deterministicRolls += 1; return (index + 0.5) / 1000; });
      fixture.encounter.chooseSteal();
      deterministicCaught += Number(outcome(fixture) === 'caught');
      fixture.dispose();
    }
    ensure(deterministicCaught === 200 && deterministicRolls === 1000, '1000 evenly spaced inputs must yield exactly 200 caught outcomes and 1000 rolls');

    // Sample the unmodified default generator, without asserting a random
    // percentage that could intermittently fail a correct implementation.
    const randomAttempts = 1000;
    let randomCaught = 0;
    for (let index = 0; index < randomAttempts; index++) {
      const fixture = make();
      ensure(fixture.encounter.roll === nativeRandom, 'omitted roll argument must select the real native Math.random');
      fixture.encounter.chooseSteal();
      randomCaught += Number(outcome(fixture) === 'caught');
      fixture.dispose();
    }
    const listenersAfter = [scene.input.keyboard.listenerCount('keydown-Y'), scene.input.keyboard.listenerCount('keydown-N'),
      scene.events.listenerCount('mesa-dream-finished'), scene.events.listenerCount(Phaser.Scenes.Events.SHUTDOWN)];
    ensure(JSON.stringify(listenersAfter) === JSON.stringify(listenersBefore), 'isolated fixtures must clean up every input and lifecycle subscription');
    ensure(Math.random === nativeRandom, 'the suite must leave the browser random generator unchanged');
    ensure(JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }) === storageBefore, 'risk checks must not persist fixture state');
    return { boundaries, leaveRolls, freshRolls, freshOutcomes, deterministicCaught, deterministicRolls, randomAttempts, randomCaught };
  });
  assert.equal(report.deterministicCaught, 200);
  assert.equal(report.deterministicRolls, 1000);
  assert.deepEqual(errors, []);
  console.log(`Mesa risk: exact 20% threshold; one roll per accepted theft; no roll on Leave; clean restart. Native random observation: ${report.randomCaught}/${report.randomAttempts} caught (${(report.randomCaught / report.randomAttempts * 100).toFixed(1)}%).`);
  console.log('PASS threshold boundaries, key repeat, duplicate and stale taps, reentrant input, fresh decisions, 1000 deterministic cases, native random sample and fixture cleanup; no script errors');
  await context.close();
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
