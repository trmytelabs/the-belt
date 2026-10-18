import assert from 'node:assert/strict';

/** Drive the whole road with actual held keys, then explicitly park. */
export async function driveJourney(page, destination) {
  await page.waitForFunction(() => window.fixtureApp.state === 'driving', null, { polling: 10, timeout: 90_000 });
  assert.equal(await page.evaluate(() => window.fixtureApp.driving.destination), destination);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.fixtureApp.driving.canPark, null, { polling: 10, timeout: 90_000 });
  await page.keyboard.up('ArrowUp');
  const elapsed = await page.evaluate(() => window.fixtureApp.driving.elapsed);
  assert.ok(elapsed >= 20 && elapsed <= 30, `drive to ${destination}: ${elapsed.toFixed(2)} simulation seconds`);
  await page.keyboard.press('Space');
  await page.waitForFunction(target => target === 'mall' ? window.fixtureApp.cutscene?.scene.id === 'mall-intro' : window.fixtureApp.state === 'lot', destination, { polling: 10, timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.fixtureApp.driving.parked), true);
}
