import assert from 'node:assert/strict';
import { makeDriver } from './driving-input.mjs';
import { separation } from '../src/three/drivingCity.ts';

/**
 * Drives are budgeted in simulated driving time, not wall-clock time: a slow
 * software-rendered runner advances the simulation more slowly and applies
 * each steering correction later, so a correct route takes longer there (a
 * CI touch drive needed ~160 s). 300 s still stops a driver going in circles;
 * the wall-clock cap stops a stuck page. Journeys assert their own times.
 */
const SIMULATED_BUDGET_S = 300;
const WALL_CAP_MS = 360_000;
const withinBudget = (start, d, wallDeadline) => d.elapsed - start.elapsed < SIMULATED_BUDGET_S && Date.now() < wallDeadline;

/**
 * The synthetic driver, recovering the way a person would. On a slow,
 * software-rendered runner each correction lands late, so the truck can clip
 * a building or drift off its planned streets. If it stalls while trying to
 * drive, it backs up (gas released, BRAKE held); if it stops gaining on the
 * bay, it plans a fresh route from where it is. An exploration route (`via`)
 * deliberately heads away from the bay, so only a stall replans that drive.
 */
function steadyDriver(initial, goal, via) {
  let driver = makeDriver(initial, goal, via), stalled = 0, reverseUntil = -1, last = initial.elapsed;
  let best = { at: initial.elapsed, distance: separation(initial, goal) };
  const replan = d => { driver = makeDriver(d, goal); best = { at: d.elapsed, distance: separation(d, goal) }; stalled = 0; };
  return d => {
    const dt = Math.max(0, d.elapsed - last);
    last = d.elapsed;
    if (d.elapsed < reverseUntil) return { steer: 0, throttle: 0, brake: 1, reverse: true };
    if (reverseUntil >= 0) { reverseUntil = -1; replan(d); }
    const input = driver(d);
    stalled = Math.abs(d.speed) < 0.4 && input.throttle > 0 ? stalled + dt : 0;
    if (stalled > 2.5) {
      reverseUntil = d.elapsed + 1.8;
      return { steer: 0, throttle: 0, brake: 1, reverse: true };
    }
    const distance = separation(d, goal);
    if (distance < best.distance - 12) best = { at: d.elapsed, distance };
    else if (!via && d.elapsed - best.at > 30) replan(d);
    return input;
  };
}

const readDrive = page => page.evaluate(() => {
  const m = window.fixtureApp.driving, s = m.nextSignal;
  return { x: m.x, z: m.z, heading: m.heading, speed: m.speed, goal: m.goal, canPark: m.canPark, elapsed: m.elapsed,
    signal: s ? { color: m.signalColor(s), remaining: m.signalDistance(s) } : null };
});

/** The keyboard driver's thresholds: a key is held for any steer past 0.08, throttle or brake past zero. */
const STEER_THRESHOLD = 0.08;

/** Read connected streets, use held keys and stop at red lights. Never moves game state. */
export async function driveToBay(page, via) {
  const keys = new Set(), used = new Set(), initial = await readDrive(page);
  const driver = steadyDriver(initial, initial.goal, via);
  const set = async (key, held) => {
    if (held === keys.has(key)) return;
    if (held) { await page.keyboard.down(key); keys.add(key); used.add(key); }
    else { await page.keyboard.up(key); keys.delete(key); }
  };
  const deadline = Date.now() + WALL_CAP_MS;
  try {
    for (let d = initial; withinBudget(initial, d, deadline);) {
      d = await readDrive(page);
      if (d.canPark) return used;
      const input = driver(d);
      await set('ArrowLeft', input.steer < -STEER_THRESHOLD);
      await set('ArrowRight', input.steer > STEER_THRESHOLD);
      await set('ArrowUp', input.throttle > 0);
      await set('ArrowDown', input.brake > 0);
      await page.waitForTimeout(55);
    }
    throw new Error(`The real-input driver did not reach the bay: ${JSON.stringify(await readDrive(page))}`);
  } finally { for (const key of keys) await page.keyboard.up(key); }
}

/**
 * Real simultaneous touch contacts, worked the way the keyboard driver works
 * its keys: GAS is held while the driver wants throttle, BRAKE while it wants
 * brake (alone while backing up, which is how the pedals reverse), and the
 * stick is pushed to its rim on the steering side, as an arrow key gives full
 * lock. The stick ignores deflections under 18 % of its radius, and a
 * proportional push left small corrections in that dead zone and larger ones
 * at a fraction of the keyboard's lock; on a software-rendered runner, where
 * every correction already lands late, that was enough to miss turns. Each
 * touch event also waits on the page's main thread, so a contact only moves
 * when its state changes, as the keyboard driver only presses a key that
 * changes.
 */
export async function touchDriveToBay(page, cdp) {
  const initial = await readDrive(page), driver = steadyDriver(initial, initial.goal);
  const gas = await page.getByRole('button', { name: 'Accelerate truck', exact: true }).boundingBox();
  const brake = await page.getByRole('button', { name: 'Brake truck', exact: true }).boundingBox();
  const stick = await page.getByLabel('Steer truck', { exact: true }).boundingBox();
  const radius = stick.width / 2, centreX = stick.x + radius;
  const gasPoint = { x: gas.x + gas.width / 2, y: gas.y + gas.height / 2, id: 11 };
  const brakePoint = { x: brake.x + brake.width / 2, y: brake.y + brake.height / 2, id: 13 };
  const steerPoint = { x: centreX, y: stick.y + stick.height / 2, id: 12 };
  let gasHeld = false, braking = false, lock = 0;
  const active = () => [...(gasHeld ? [gasPoint] : []), steerPoint, ...(braking ? [brakePoint] : [])];
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [steerPoint]);
  const deadline = Date.now() + WALL_CAP_MS;
  try {
    for (let d = initial; withinBudget(initial, d, deadline);) {
      d = await readDrive(page);
      if (d.canPark) return;
      const input = driver(d);
      const wantGas = input.throttle > 0 && !input.reverse, wantBrake = input.brake > 0;
      const wantLock = Math.abs(input.steer) > STEER_THRESHOLD ? Math.sign(input.steer) : 0;
      if (wantGas !== gasHeld) {
        gasHeld = wantGas;
        await touch(wantGas ? 'touchStart' : 'touchEnd', wantGas ? active() : [gasPoint]);
      }
      if (wantBrake !== braking) {
        braking = wantBrake;
        await touch(wantBrake ? 'touchStart' : 'touchEnd', wantBrake ? active() : [brakePoint]);
      }
      if (wantLock !== lock) {
        lock = wantLock;
        // Just inside the rim: a push to the edge of the stick reads as full lock.
        steerPoint.x = centreX + lock * radius * 0.97;
        await touch('touchMove', active());
      }
      await page.waitForTimeout(55);
    }
    throw new Error(`The touch driver did not reach the bay: ${JSON.stringify(await readDrive(page))}`);
  } finally { await touch('touchEnd', []); }
}

/** Drive a direct street route with actual keys, then explicitly park. */
export async function driveJourney(page, destination) {
  await page.waitForFunction(() => window.fixtureApp.state === 'driving', null, { polling: 10, timeout: 90_000 });
  assert.equal(await page.evaluate(() => window.fixtureApp.driving.destination), destination);
  const keys = await driveToBay(page);
  assert.ok((keys.has('ArrowLeft') || keys.has('ArrowRight')) && keys.has('ArrowDown'), 'real steering and braking reach the destination');
  const elapsed = await page.evaluate(() => window.fixtureApp.driving.elapsed);
  assert.ok(elapsed >= 35 && elapsed <= 70, `drive to ${destination}: ${elapsed.toFixed(2)} simulation seconds`);
  await page.keyboard.press('Space');
  await page.waitForFunction(target => target === 'mall' ? window.fixtureApp.cutscene?.scene.id === 'mall-intro' : window.fixtureApp.state === 'lot', destination, { polling: 10, timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.fixtureApp.driving.parked), true);
}
