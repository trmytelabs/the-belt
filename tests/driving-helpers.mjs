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
  const m = window.fixtureApp.driving, s = m.nextSignal, t = window.fixtureApp.touch;
  return { x: m.x, z: m.z, heading: m.heading, speed: m.speed, goal: m.goal, canPark: m.canPark, elapsed: m.elapsed,
    signal: s ? { color: m.signalColor(s), remaining: m.signalDistance(s) } : null,
    touch: { x: t.move.x, y: t.move.y, throttle: t.pedals.throttle, brake: t.pedals.brake } };
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
 * stick is held at its rim on the steering side, as an arrow key gives full
 * lock. The earlier proportional push left small corrections inside the
 * stick's 18 % dead zone and larger ones short of the keyboard's lock, and
 * CI's software-rendered runner, where every correction already lands late,
 * kept missing turns that the keyboard drive in the same job made. Every
 * contact is now a press and a release, never a drag, and each read checks
 * what the page registered for the held contacts, pressing again any the
 * page has lost; a failure reports those re-presses and a trace of the
 * drive. Each touch event waits on the page's main thread, so a contact only
 * changes when its state changes, as the keyboard driver only presses a key
 * that changes.
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
  const active = () => [...(gasHeld ? [gasPoint] : []), ...(lock ? [steerPoint] : []), ...(braking ? [brakePoint] : [])];
  // Touch events are sent without waiting for the page to handle them. On CI's
  // software renderer each handled touch waited a frame or more, which held every
  // decision back a second or two of driving (the trace showed the page a full
  // decision behind the driver); the browser still delivers them in order.
  let sent = Promise.resolve();
  const touch = (type, touchPoints) => {
    sent = cdp.send('Input.dispatchTouchEvent', { type, touchPoints: touchPoints.map(point => ({ ...point })) }).catch(() => {});
  };
  // What the page registered for each contact, so a contact the page has lost is pressed again,
  // and a trace of the drive for the failure message.
  const lost = { gas: 0, brake: 0, steer: 0 }, repressed = { gas: 0, brake: 0, steer: 0 }, trace = [];
  let settled = 0;
  const deadline = Date.now() + WALL_CAP_MS;
  try {
    for (let d = initial; withinBudget(initial, d, deadline);) {
      d = await readDrive(page);
      if (d.canPark) return;
      const input = driver(d);
      const wantGas = input.throttle > 0 && !input.reverse, wantBrake = input.brake > 0;
      const wantLock = Math.abs(input.steer) > STEER_THRESHOLD ? Math.sign(input.steer) : 0;
      // A held contact the page still fails to report after the contacts have been
      // steady for several reads is pressed again (a late page is not a lost contact).
      const steady = wantGas === gasHeld && wantBrake === braking && wantLock === lock;
      settled = steady ? settled + 1 : 0;
      lost.gas = settled > 3 && gasHeld && d.touch.throttle !== 1 ? lost.gas + 1 : 0;
      lost.brake = settled > 3 && braking && d.touch.brake !== 1 ? lost.brake + 1 : 0;
      lost.steer = settled > 3 && lock && Math.sign(d.touch.x) !== lock ? lost.steer + 1 : 0;
      if (lost.gas > 3) { gasHeld = false; lost.gas = 0; repressed.gas++; touch('touchEnd', [gasPoint]); }
      if (lost.brake > 3) { braking = false; lost.brake = 0; repressed.brake++; touch('touchEnd', [brakePoint]); }
      if (lost.steer > 3) { lock = 0; lost.steer = 0; repressed.steer++; touch('touchEnd', [steerPoint]); }
      if (wantGas !== gasHeld) {
        gasHeld = wantGas;
        touch(wantGas ? 'touchStart' : 'touchEnd', wantGas ? active() : [gasPoint]);
      }
      if (wantBrake !== braking) {
        braking = wantBrake;
        touch(wantBrake ? 'touchStart' : 'touchEnd', wantBrake ? active() : [brakePoint]);
      }
      if (wantLock !== lock) {
        // A held contact lifts before one lands on the other side, so the stick is never dragged.
        if (lock) { lock = 0; touch('touchEnd', [steerPoint]); }
        if (wantLock) {
          lock = wantLock;
          // Just inside the rim: a press at the edge of the stick reads as full lock.
          steerPoint.x = centreX + lock * radius * 0.97;
          touch('touchStart', active());
        }
      }
      if (!trace.length || d.elapsed - trace[trace.length - 1].t >= 2) {
        trace.push({ t: +d.elapsed.toFixed(1), x: +d.x.toFixed(1), z: +d.z.toFixed(1), h: +d.heading.toFixed(2), v: +d.speed.toFixed(1),
          steer: +input.steer.toFixed(2), gas: wantGas ? 1 : 0, brake: wantBrake ? 1 : 0, page: { x: +d.touch.x.toFixed(2), gas: d.touch.throttle, brake: d.touch.brake } });
      }
      await page.waitForTimeout(55);
    }
    throw new Error(`The touch driver did not reach the bay: ${JSON.stringify(await readDrive(page))}\nre-pressed ${JSON.stringify(repressed)}\ntrace ${JSON.stringify(trace.slice(-80))}`);
  } finally {
    await sent;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
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
