import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { driveToBay } from './driving-helpers.mjs';
import { QUIT_ENDING, QUIT_NIGHT } from '../src/three/homeScript.ts';

// The 3D night's prologue at home: the decision, the quit ending, and the
// drive in to work that hands over to the original arrival scenes.
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const browser = await chromium.launch({ headless: true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => window.addEventListener('belt3d:ready', e => { window.fixtureApp = e.detail; }));
  await page.goto(`${server.resolvedUrls.local[0]}?mode=3d`);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 90_000 });
  const wait = (fn, arg) => page.waitForFunction(fn, arg, { polling: 10, timeout: 30_000 });

  // The night starts at home.
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'home-decision');
  assert.deepEqual(await page.evaluate(() => [window.fixtureApp.story.chapter, window.fixtureApp.stage.active]), ['prologue', 'house']);
  await page.keyboard.press('Space');
  await wait(() => window.fixtureApp.cutscene?.index === 1);
  assert.ok(await page.evaluate(() => {
    const actors = window.fixtureApp.stage.geometrySnapshot().actors.map(actor => actor.id);
    return actors.includes('termite') && actors.includes('skanky');
  }), 'Termite and Skanky are both on the house set');

  // Skipping the scene still waits for the choice.
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'decision');
  assert.ok(await page.getByRole('button', { name: 'GO IN', exact: true }).isVisible());
  assert.ok(await page.getByRole('button', { name: 'QUIT UPS', exact: true }).isVisible());
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.fixtureApp.state), 'decision', 'Enter does not make the choice');

  // Quit: the night at home, Shan's call in the morning and the quit ending.
  await page.keyboard.press('KeyQ');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'quit-night');
  assert.equal(await page.evaluate(() => window.fixtureApp.story.chapter), 'quit');
  const quitLine = QUIT_NIGHT.beats.findIndex(beat => beat.cue === 'quit-line');
  for (let i = 0; i < quitLine; i += 1) {
    await page.keyboard.press('Space');
    await wait(n => window.fixtureApp.cutscene?.index >= n, i + 1);
  }
  // The beat's subtitle and bubble appear on the next frame.
  await wait(() => document.body.textContent.includes('We no longer work for UPS.'));
  const call = await page.evaluate(() => ({
    clock: document.body.innerText.includes('8:15 AM'),
    line: window.fixtureApp.cutscene.beat.speaker === 'termite',
    puddle: window.fixtureApp.stage.geometrySnapshot().props.some(prop => prop.id === 'puddle'),
  }));
  assert.deepEqual(call, { clock: true, line: true, puddle: true }, 'morning clock, the vomit and Termite answering Shan');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'ended');
  assert.ok((await page.locator('.b3d-panel').innerText()).includes(QUIT_ENDING.title));
  assert.deepEqual(await page.evaluate(() => window.fixtureApp.story.visited), ['briefing', 'prologue', 'quit', 'results']);

  // Another night: go in this time.
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'briefing');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'home-decision');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'decision');
  await page.getByRole('button', { name: 'GO IN', exact: true }).click();
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'leave-house');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'driving');
  await page.evaluate(() => window.fixtureApp.drivingView.ready);
  assert.deepEqual(await page.evaluate(() => {
    const app = window.fixtureApp, view = app.drivingView;
    return { origin: app.driving.origin, destination: app.driving.destination, chapter: app.story.chapter, car: view.car.visible, truck: view.truck.visible };
  }), { origin: 'home', destination: 'ups', chapter: 'commute', car: true, truck: false }, "Skanky's car drives from home to UPS");
  // Skanky is at the wheel with Termite beside him, sat on the car's contract: hands on the
  // rim and the lap, feet on the pedals and the floor, nothing outside the cabin.
  await wait(() => window.fixtureApp.drivingView.car.userData.contract);
  const seated = await page.evaluate(() => {
    const app = window.fixtureApp, view = app.drivingView, car = view.car, contract = car.userData.contract;
    view.update(app.driving, 1 / 60);
    car.updateWorldMatrix(true, true);
    const vector = (x = 0, y = 0, z = 0) => car.position.clone().set(x, y, z);
    const world = object => object.getWorldPosition(vector());
    const ankle = shin => shin.localToWorld(vector(0, -0.4, 0));
    return view.occupantReport().map(({ name, seat, character: c }) => {
      const targets = contract.seats[seat];
      const local = p => car.worldToLocal(p.clone()).toArray().map(v => +v.toFixed(2));
      return { name, seat, visible: c.root.visible, tag: c.nameTag.visible,
        hands: [world(c.leftHand).distanceTo(world(targets.hands.left)), world(c.rightHand).distanceTo(world(targets.hands.right))].map(d => +d.toFixed(3)),
        feet: [ankle(c.leftShin).distanceTo(world(targets.feet.left)), ankle(c.rightShin).distanceTo(world(targets.feet.right))].map(d => +d.toFixed(3)),
        head: local(world(c.head)), hips: local(world(c.leftLeg)), handsLocal: [local(world(c.leftHand)), local(world(c.rightHand))] };
    });
  });
  assert.equal(seated.length, 2, JSON.stringify(seated));
  for (const person of seated) {
    assert.ok(person.visible && !person.tag, `${person.name} rides without a floating name: ${JSON.stringify(person)}`);
    // The driver holds the wheel exactly; a passenger on a seated idle clip rests the hands where the clip puts
    // them, within reach of the lap targets and inside the cabin.
    assert.ok(person.hands.every(d => d <= (person.seat === 'driver' ? 0.02 : 0.45)) && person.feet.every(d => d <= 0.02), `${person.name}'s hands and feet on the ${person.seat} targets: ${JSON.stringify(person)}`);
    assert.ok(person.handsLocal.every(([x, y, z]) => x > -1.32 && x < 0.9 && y > 0.4 && y < 1.45 && Math.abs(z) < 0.78), `${person.name}'s hands inside the cabin: ${JSON.stringify(person.handsLocal)}`);
    assert.ok(person.head[1] < 1.45 - 0.14 && person.head[1] > 1.0 && Math.abs(person.head[2]) < 0.76 && person.hips[1] > 0.5, `${person.name} sits inside the cabin: ${JSON.stringify(person)}`);
  }
  assert.equal(seated[0].seat, 'driver'); assert.equal(seated[0].name, 'SKANKY'); assert.equal(seated[1].name, 'TERMITE');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.fixtureApp.state), 'driving', 'Enter cannot skip the drive');
  const keys = await driveToBay(page);
  assert.ok(keys.has('ArrowUp'), 'real keyboard driving reaches the UPS yard');
  await page.keyboard.press('Space');
  await wait(() => window.fixtureApp.cutscene?.scene.id.startsWith('opener'));
  assert.deepEqual(await page.evaluate(() => window.fixtureApp.story.visited), ['briefing', 'prologue', 'commute', 'arrival']);
  assert.equal(await page.evaluate(() => window.fixtureApp.stage.active), 'lot', 'the original arrival scene plays at the UPS lot');
  assert.deepEqual(errors, []);
  console.log('PASS 3D prologue: home decision, quit night with Shan\'s morning call, quit ending, replay, drive in from home in Skanky\'s car, original arrival; no script errors');
} finally {
  await browser.close();
  await server.close();
}
