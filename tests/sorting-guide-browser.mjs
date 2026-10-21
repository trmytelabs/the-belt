import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';

const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const browser = await chromium.launch({ headless: true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const shots = process.env.BELT_SORTING_REVIEW_DIR;
if (shots) await mkdir(shots, { recursive: true });
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const touch = viewport.width !== 1280;
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => window.addEventListener('belt3d:ready', event => { window.fixtureApp = event.detail; event.detail.playPrologue = false; }));
    await page.goto(server.resolvedUrls.local[0]);
    const wait = (fn, arg) => page.waitForFunction(fn, arg, { polling: 10, timeout: 90000 });
    await wait(() => window.fixtureApp?.state === 'briefing');
    assert.equal(await page.locator('.b3d-steps li').count(), 3);
    assert.equal(await page.evaluate(() => document.querySelector('.b3d-howto').open), true, 'a first briefing shows HOW TO PLAY open');
    assert.match(await page.locator('.b3d-panel').innerText(), /ends at 7 packages in recovery/);
    if (shots) await page.screenshot({ path: join(shots, `briefing-${viewport.width}.png`) });
    await page.evaluate(() => window.fixtureApp.forceStory({ breakAtMs: 1e12 }));
    await page.getByRole('button', { name: 'START THE NIGHT  ↵' }).click();
    await wait(() => window.fixtureApp.state === 'story');
    await page.keyboard.press('Enter', { delay: 40 });
    await wait(() => window.fixtureApp.cutscene?.scene.id === 'scrum');
    await page.keyboard.press('Enter', { delay: 40 });
    await wait(() => window.fixtureApp.state === 'playing');
    await page.evaluate(() => {
      const app = window.fixtureApp, m = app.model;
      m.eventStopped = true; m.autonomousCoworker = false; app.benStarted = true;
      Object.assign(m.packages[0], { y: 788, beltOffset: 788 - m.beltTravel });
      Object.assign(m.activeWorker, { x: 400, y: 788 });
      const streets = { A: 27, B: 67, C: null, D: 99, E: 140, T: 119, S: 180 };
      for (const [index, route] of ['A', 'B', 'C', 'D', 'E', 'T', 'S'].entries()) {
        const street = streets[route];
        m.packages.push({ ...m.packages[0], id: 9900 + index, route, street: street ?? undefined,
          address: street ? `${4000 + index} ${street} ST` : 'OVERSIZE · BULK', kind: 'smallbox', label: 'PARCEL', size: 'normal',
          y: 220 + index * 70, beltOffset: 220 + index * 70 - m.beltTravel });
      }
    });
    await wait(() => window.fixtureApp.parcels.has(9906));
    const rings = () => page.evaluate(() => ['A', 'B', 'C', 'D', 'E', 'T', 'S'].filter((route, index) => window.fixtureApp.parcels.get(9900 + index).highlight.visible));
    assert.deepEqual(await rings(), ['A', 'C', 'D', 'T'], 'all active-worker freight stands out even beyond grabbing range');
    if (shots) {
      await page.evaluate(() => {
        const app = window.fixtureApp; app.model.activeWorker.y = 500;
        app.syncWorkers(0); app.snapCamera(); app.lastRender = -Infinity; app.draw();
      });
      await page.screenshot({ path: join(shots, `assigned-packages-${viewport.width}.png`) });
      await page.evaluate(() => { const app = window.fixtureApp; app.model.activeWorker.y = 788; app.syncWorkers(0); });
    }
    await page.keyboard.press('Tab');
    await wait(() => window.fixtureApp.parcels.get(9901).highlight.visible && !window.fixtureApp.parcels.get(9900).highlight.visible);
    assert.deepEqual(await rings(), ['B', 'C', 'E', 'S'], 'switching workers immediately changes the marked packages');
    assert.ok(await page.evaluate(() => [...window.fixtureApp.crew.crewFreight.values()].every(view => !view.highlight.visible)), 'resident crew boxes remain unmarked');
    await page.keyboard.press('Tab');
    await page.evaluate(() => window.fixtureApp.model.packages.splice(1));
    await wait(() => document.querySelector('[data-f="guide-title"]').textContent === '27 ST → MILL WOODS');
    const action = page.getByRole('button', { name: 'Grab or deliver', exact: true });
    if (touch) await action.tap(); else await page.keyboard.press('Space');
    await wait(() => window.fixtureApp.model.heldPackage !== null && window.fixtureApp.deliveryHalo.visible);
    assert.match(await page.locator('[data-f="guide-detail"]').innerText(), /TERMITE'S TRUCK 1/);
    assert.doesNotMatch(await page.locator('[data-f="guide-detail"]').innerText(), /enter/i);
    assert.equal(await page.evaluate(() => window.fixtureApp.deliveryHalo.userData.route), 'A');
    assert.equal(await page.evaluate(() => window.fixtureApp.deliveryPrompt), undefined, 'the destination uses only a circle');
    const tag = await page.evaluate(() => {
      const app = window.fixtureApp, tag = app.parcels.get(app.model.heldPackage.id).tag;
      return { street: tag.userData.street, height: tag.scale.y };
    });
    assert.equal(tag.street, '27 ST'); assert.ok(tag.height >= 0.9);
    const box = await page.locator('.b3d-guide').boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
    assert.ok(await page.locator('[data-f="guide-detail"]').evaluate(el => el.scrollWidth <= el.clientWidth), 'guidance wraps instead of truncating');
    if (shots) {
      // Settle the camera after the fixture's position jump before visual review.
      await page.evaluate(() => { const app = window.fixtureApp; app.snapCamera(); app.lastRender = -Infinity; app.draw(); });
      await page.screenshot({ path: join(shots, `carrying-${viewport.width}.png`) });
    }
    await page.keyboard.down('KeyA');
    await wait(() => window.fixtureApp.model.currentDock() === 'A');
    await page.keyboard.up('KeyA');
    await wait(() => document.querySelector('[data-f="guide-detail"]').textContent.startsWith('3 ·'));
    assert.equal(await page.evaluate(() => window.fixtureApp.deliveryHalo.visible), true, 'the loading circle remains visible inside');
    if (touch) await action.tap(); else await page.keyboard.press('Space');
    await wait(() => window.fixtureApp.model.sorted === 1 && !window.fixtureApp.deliveryHalo.visible);
    await page.keyboard.press('Escape');
    await wait(() => window.fixtureApp.state === 'paused');
    await page.locator('.b3d-guide').waitFor({ state: 'hidden' });
    await page.keyboard.press('Enter'); await wait(() => window.fixtureApp.state === 'playing');

    await page.evaluate(() => {
      const app = window.fixtureApp, m = app.model, template = { ...m.packages[0] };
      m.packages.splice(0, m.packages.length, ...Array.from({ length: 6 }, (_, i) => ({ ...template, id: 900 + i, state: 'missed', route: 'C', x: 480, y: 918, workerId: null })));
    });
    await wait(() => document.querySelector('[data-f="backlog"]').textContent === '6 / 7');
    assert.equal(await page.evaluate(() => window.fixtureApp.model.ended), false);
    await page.evaluate(() => {
      const app = window.fixtureApp, m = app.model;
      m.packages.push({ ...m.packages[0], id: 906 });
    });
    await wait(() => window.fixtureApp.state === 'ended');
    assert.match(await page.locator('.b3d-panel').innerText(), /PILE-UP OVERFLOW/);
    await page.getByRole('button', { name: 'ANOTHER NIGHT  ↵' }).click();
    await wait(() => window.fixtureApp.state === 'briefing');
    assert.equal(await page.evaluate(() => window.fixtureApp.model.capacity), 7);
    await page.locator('.b3d-guide').waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}×${viewport.height}: all assigned packages marked, switching updates rings, circle-only destination, real pickup/load, pause, seven-parcel failure and restart`);
    await context.close();
  }
} finally {
  await browser.close(); await new Promise(resolve => server.httpServer.close(resolve));
}
