import assert from 'node:assert/strict';
import { ROAD_LENGTH, roadPoint } from '../src/three/DrivingModel.ts';
import { drivingInput } from './driving-input.mjs';

/** Read the road, steer with keys and stop at red signals. Never moves game state. */
export async function driveToBay(page) {
  const keys = new Set(), used = new Set();
  const set = async (key, held) => {
    if (held === keys.has(key)) return;
    if (held) { await page.keyboard.down(key); keys.add(key); used.add(key); }
    else { await page.keyboard.up(key); keys.delete(key); }
  };
  const deadline = Date.now() + 150_000;
  try {
    while (Date.now() < deadline) {
      const d = await page.evaluate(() => {
        const m = window.fixtureApp.driving, s = m.nextSignal;
        return { destination: m.destination, distance: m.distance, offset: m.offset, speed: m.speed,
          headingError: m.headingError, canPark: m.canPark, signal: s ? { color: m.signalColor(s), remaining: s.distance - m.distance } : null };
      });
      if (d.canPark) return used;
      const input = drivingInput(d, roadPoint(Math.min(ROAD_LENGTH, d.distance + 2), 0, d.destination).heading, roadPoint(d.distance, 0, d.destination).heading);
      await set('ArrowLeft', input.steer < -0.07);
      await set('ArrowRight', input.steer > 0.07);
      await set('ArrowUp', input.throttle > 0);
      await set('ArrowDown', input.brake > 0);
      await page.waitForTimeout(55);
    }
    throw new Error('The real-input driver did not reach the bay');
  } finally { for (const key of keys) await page.keyboard.up(key); }
}

/** Drive the whole road with actual held keys, then explicitly park. */
export async function driveJourney(page, destination) {
  await page.waitForFunction(() => window.fixtureApp.state === 'driving', null, { polling: 10, timeout: 90_000 });
  assert.equal(await page.evaluate(() => window.fixtureApp.driving.destination), destination);
  const keys = await driveToBay(page);
  assert.ok(keys.has('ArrowLeft') && keys.has('ArrowRight') && keys.has('ArrowDown'), 'both turns and red-light braking used real input');
  const elapsed = await page.evaluate(() => window.fixtureApp.driving.elapsed);
  assert.ok(elapsed >= 20 && elapsed <= 30, `drive to ${destination}: ${elapsed.toFixed(2)} simulation seconds`);
  await page.keyboard.press('Space');
  await page.waitForFunction(target => target === 'mall' ? window.fixtureApp.cutscene?.scene.id === 'mall-intro' : window.fixtureApp.state === 'lot', destination, { polling: 10, timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.fixtureApp.driving.parked), true);
}
