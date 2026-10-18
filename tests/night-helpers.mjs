// Shared steps for the 2D depot suites, which check the preserved warehouse
// shift. The night now opens with two story scenes and closes with Skanky's
// mall run; these helpers get through them with the game's own controls.
const scene = 'window.fixtureGame.scene.getScene("DepotScene")';

/** Keeps the random mid-shift break out of a suite that checks other timed events. */
export async function holdBreak(page) {
  await page.evaluate(`${scene}.forceStory({ breakAtMs: 1e12 })`);
}

/** From the briefing's start, skips the arrival and the scrum with real ENTER presses. */
export async function skipOpening(page, { touch = false } = {}) {
  await page.waitForFunction(`${scene}.state === 'story'`);
  for (let guard = 0; guard < 6; guard += 1) {
    const state = await page.evaluate(`${scene}.state`);
    if (state !== 'story') break;
    const id = await page.evaluate(`${scene}.cutscene?.scene.id`);
    if (touch) await page.getByRole('button', { name: 'SKIP', exact: true }).tap();
    else await page.keyboard.press('Enter', { delay: 40 });
    await page.waitForFunction(`${scene}.state !== 'story' || ${scene}.cutscene?.scene.id !== ${JSON.stringify(id)}`);
  }
  await page.waitForFunction(`${scene}.state === 'countdown' || ${scene}.state === 'playing'`);
  await page.waitForFunction(`${scene}.state === 'playing'`, null, { timeout: 30_000 });
}

/**
 * From a won shift's celebration to the results: the clock-out, Skanky's mall
 * run (completed through the mall's own rules, with Skanky carried between
 * stops), the five-ton's keys and the trip home.
 */
export async function finishNight(page) {
  const skipTo = async (id) => {
    await page.waitForFunction(`${scene}.cutscene?.scene.id === ${JSON.stringify(id)}`, null, { timeout: 60_000 });
    await page.keyboard.press('Enter', { delay: 40 });
  };
  if (await page.evaluate(`${scene}.state === 'celebrating'`)) await page.keyboard.press('Enter', { delay: 40 });
  await skipTo('mall-assignment');
  await skipTo('drive-to-mall');
  await skipTo('mall-intro');
  await page.waitForFunction(`${scene}.state === 'mall'`);
  await page.evaluate(() => {
    const mall = window.fixtureGame.scene.getScene('DepotScene').mall;
    const deliver = (store) => {
      const y = store.side === 'north' ? 322 : 478;
      Object.assign(mall.cart, { x: store.door.x + 30, y, pushed: true });
      Object.assign(mall.skanky, { x: store.door.x, y });
      mall.action(); mall.action();
    };
    for (let run = 0; run < 3; run += 1) {
      mall.cart.pushed = false;
      Object.assign(mall.cart, { x: 150, y: 400 });
      for (const store of mall.stores.filter((item) => item.run === run)) {
        Object.assign(mall.skanky, { x: 70, y: mall.slotPosition(mall.truckBundles.indexOf(store.id)).y });
        mall.action();
        Object.assign(mall.skanky, { x: mall.cart.x + 40, y: mall.cart.y });
        mall.action();
      }
      for (const store of mall.stores.filter((item) => item.run === run)) deliver(store);
    }
    mall.cart.pushed = false;
    Object.assign(mall.cart, { x: 150, y: 400 });
    Object.assign(mall.skanky, { x: 80, y: 465 });
  });
  await page.keyboard.press('Space', { delay: 40 });
  await skipTo('drive-to-ups');
  await page.waitForFunction(`${scene}.state === 'lot'`);
  await page.evaluate(() => Object.assign(window.fixtureGame.scene.getScene('DepotScene').lot.skanky, { x: 830, y: 180 }));
  await page.keyboard.press('Space', { delay: 40 });
  await skipTo('go-home');
  await page.waitForFunction(`${scene}.state === 'results'`);
}
