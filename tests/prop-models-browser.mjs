import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { MALL_LAYOUT } from '../src/game/slice/MallModel.ts';
import { SHIFT_LAYOUT } from '../src/game/slice/ShiftModel.ts';
import { DEPOT_DRESSING } from '../src/three/depotDressing.ts';

// Prop models load only on GPU renderers. The app here (software WebGL on CI)
// must request none. A GPU-quality depot and mall, built in the same page,
// then load the committed models from the production bundle and are checked
// in place: every code-built stand-in hidden, the dressing clear of play.
const server = process.env.BELT_TEST_BASE_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
    args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.url().includes('/models/props/')) requests.push(request.url()); });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  await page.addInitScript(() => window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; }));
  await page.goto(process.env.BELT_TEST_BASE_URL ?? server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 90_000 });

  const quality = await page.evaluate(() => window.fixtureApp.quality);
  const placed = (scene) => {
    const names = [];
    scene.traverse((object) => { if (object.name.startsWith('prop-')) names.push(object.name); });
    return names;
  };
  if (quality === 'low') {
    assert.deepEqual(requests, [], 'software renderers request no prop models');
    assert.deepEqual(await page.evaluate(`(${placed})(window.fixtureApp.world.scene)`), [], 'software renderers keep the code-built props');
    console.log('PASS software renderers keep the code-built props and download no models');
  }

  // 16 wall lamps, the husband's desk and chair, and the dressing; the mall's bin.
  const expected = 16 + 2 + DEPOT_DRESSING.length;
  await page.evaluate(() => {
    const app = window.fixtureApp;
    window.gpuWorld = new app.world.constructor('high');
    window.gpuMall = new app.stage.constructor('high').stage('mall');
  });
  await page.waitForFunction(([placedSource, count]) => {
    const placedIn = eval(placedSource);
    return placedIn(window.gpuWorld.scene).length === count && placedIn(window.gpuMall.scene).includes('prop-trash-can');
  }, [String(placed), expected], { timeout: 60_000 });
  assert.ok(requests.length > 0 && requests.every((url) => /\/models\/props\/[a-z0-9-]+\.glb$/.test(url)), 'only prop models are requested');
  assert.equal(new Set(requests).size, requests.length, 'each model downloads once, however many copies stand');
  console.log(`PASS a GPU-quality depot places all ${expected} prop models and the mall its bin`);

  const report = await page.evaluate(() => {
    const world = window.gpuWorld;
    const box = (object) => { const b = world.physicalBounds(object); return { min: b.min.toArray(), max: b.max.toArray() }; };
    let hidden = 0;
    world.scene.traverse((object) => { if (object.userData.keep === true && !object.visible) hidden += 1; });
    const dressing = [];
    world.scene.traverse((object) => { if (object.name.startsWith('dressing-')) dressing.push({ name: object.name, bounds: box(object) }); });
    const snapshot = world.geometrySnapshot();
    const bin = window.gpuMall.scene.getObjectByName('prop-trash-can');
    return {
      lampsHidden: world.lamps.every((lamp) => !lamp.visible),
      hidden,
      dressing,
      platform: { min: snapshot.platform.min.toArray(), max: snapshot.platform.max.toArray() },
      trucks: snapshot.trucks.map((truck) => ({ min: truck.bounds.min.toArray(), max: truck.bounds.max.toArray() })),
      rearWall: snapshot.rearWall.max.toArray(),
      scene: box(world.scene),
      bin: box(bin),
    };
  });
  assert.ok(report.lampsHidden, 'the code-built wall fixtures hide behind their lamps');
  assert.ok(report.hidden >= 18, `the lamps, desk and chair stand-ins are hidden (${report.hidden})`);
  assert.ok(report.scene.max[2] <= report.rearWall[2] + 1e-5, 'no prop reaches behind the final wall');

  const frontWall = (SHIFT_LAYOUT.worldTop - 340) / 32;
  const firstTruckRow = Math.min(...report.trucks.map((truck) => truck.min[2]));
  const overlaps = (a, b) => [0, 1, 2].every((axis) => a.min[axis] < b.max[axis] && b.min[axis] < a.max[axis]);
  assert.equal(report.dressing.length, DEPOT_DRESSING.length);
  for (const { name, bounds } of report.dressing) {
    assert.ok(bounds.min[0] >= -15.14 && bounds.max[0] <= 15.14, `${name}: inside the side walls`);
    assert.ok(bounds.min[2] >= frontWall - 1e-3, `${name}: in front of the receiving wall`);
    assert.ok(bounds.max[2] < firstTruckRow - 0.75, `${name}: a worker's width before the first truck row`);
    assert.ok(!overlaps(bounds, report.platform), `${name}: off the raised platform`);
    assert.ok(Math.abs(bounds.min[1]) < 0.02, `${name}: stands on the floor`);
  }
  console.log('PASS the dressing stands in the front corners, off the platform and clear of the trucks');

  const bench = MALL_LAYOUT.obstacles.find((item) => item.label === 'BENCH');
  const [x0, z0, x1, z1] = [(bench.x - 640) / 32, (bench.y - 400) / 32, (bench.x + bench.w - 640) / 32, (bench.y + bench.h - 400) / 32];
  assert.ok(report.bin.min[0] >= x0 && report.bin.max[0] <= x1 && report.bin.min[2] >= z0 && report.bin.max[2] <= z1,
    'the mall bin stays inside the bench pod, where the cart cannot go');
  assert.deepEqual(errors, []);
  console.log('PASS the mall bin stands inside the bench pod');
} finally {
  await browser?.close();
  await server?.close();
}
