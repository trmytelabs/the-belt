import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { OPENERS } from '../src/game/slice/StoryScript.ts';

// Authored arrivals run under deterministic clock fixtures. Local solid bounds
// are transformed as oriented rectangles; rotated cars do not get the false
// corner collisions caused by broad world-axis-aligned boxes.
const server = process.env.BELT_TEST_BASE_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
    args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => window.addEventListener('belt3d:ready', event => { window.fixtureApp = event.detail; }));
  await page.goto(process.env.BELT_TEST_BASE_URL ?? server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 90_000 });
  for (const scene of OPENERS) {
    const result = await page.evaluate(scene => {
      const app = window.fixtureApp;
      app.renderer.setAnimationLoop(null); window.clearInterval(app.tickTimer);
      app.playScene(scene);
      const stage = app.stage.stages.lot;
      const failures = [];
      let samples = 0;
      let vehiclePairs = 0;
      let standingSamples = 0;
      let passengerSamples = 0;
      const localCache = new Map();
      const shape = (object, animatedBody) => {
        let bounds = !animatedBody && localCache.get(object);
        if (!bounds) {
          const position = object.position.clone(); const rotation = object.rotation.clone(); const scale = object.scale.clone();
          object.position.set(0, 0, 0); object.rotation.set(0, 0, 0); object.scale.set(1, 1, 1);
          bounds = app.world.physicalBounds(animatedBody ?? object);
          object.position.copy(position); object.rotation.copy(rotation); object.scale.copy(scale);
          if (!animatedBody) localCache.set(object, bounds);
        }
        object.updateWorldMatrix(true, true);
        if (bounds.isEmpty()) return null;
        const points = [[bounds.min.x, bounds.min.z], [bounds.max.x, bounds.min.z], [bounds.max.x, bounds.max.z], [bounds.min.x, bounds.max.z]];
        // A fence plane has zero thickness; its physical posts/track require a
        // small clearance band rather than an empty polygon.
        if (bounds.max.z - bounds.min.z < 0.05) { points[0][1] -= 0.025; points[1][1] -= 0.025; points[2][1] += 0.025; points[3][1] += 0.025; }
        return points.map(([x, z]) => { const p = object.position.clone().set(x, 0, z).applyMatrix4(object.matrixWorld); return { x: p.x, z: p.z }; });
      };
      const overlaps = (a, b) => {
        if (!a || !b) return false;
        for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
          const from = polygon[i]; const to = polygon[(i + 1) % polygon.length];
          const length = Math.hypot(to.x - from.x, to.z - from.z);
          if (length < 1e-7) continue;
          const nx = -(to.z - from.z) / length; const nz = (to.x - from.x) / length;
          const pa = a.map(p => p.x * nx + p.z * nz); const pb = b.map(p => p.x * nx + p.z * nz);
          if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= 0.015) return false;
        }
        return true;
      };
      for (let beat = 0; beat < scene.beats.length; beat++) for (let fraction = 0; fraction <= 20; fraction++) {
        app.cutscene.index = beat; app.cutscene.elapsedMs = app.cutscene.beat.ms * fraction / 20;
        app.stage.direct(app.cutscene, 0.05, beat * 2 + fraction / 20);
        const vehicles = Object.entries(stage.props).filter(([name, prop]) => prop.visible && /^(car-|park-)/.test(name)).map(([name, prop]) => ({ name, prop, shape: shape(prop) }));
        const walls = ['gate', 'fence-west', 'fence-east', 'lotBuilding'].map(name => ({ name, shape: shape(stage.props[name]) }));
        const people = [...stage.actors].filter(([, actor]) => actor.root.visible && !actor.seatedIn).map(([name, actor]) => ({ name, shape: shape(actor.root, actor.character.body) }));
        for (const [name, actor] of stage.actors) if (actor.root.visible && actor.seatedIn) {
          passengerSamples++;
          const bounds = app.world.physicalBounds(actor.character.body);
          // The roof slab begins at 1.52 m. Gestures must retain the seated hip
          // and leg pose instead of standing the passenger through the roof.
          if (bounds.max.y > actor.seatedIn.position.y + 1.52 + 0.015 && failures.length < 50) failures.push(`${scene.id} beat ${beat} at ${fraction}/20: seated ${name} rises through roof`);
        }
        const check = (a, b) => {
          samples++;
          if (overlaps(a.shape, b.shape) && failures.length < 50) failures.push(`${scene.id} beat ${beat} at ${fraction}/20: ${a.name} intersects ${b.name}`);
        };
        for (let i = 0; i < vehicles.length; i++) {
          for (let j = i + 1; j < vehicles.length; j++) { vehiclePairs++; check(vehicles[i], vehicles[j]); }
          for (const wall of walls) check(vehicles[i], wall);
        }
        for (let i = 0; i < people.length; i++) {
          standingSamples++;
          for (let j = i + 1; j < people.length; j++) check(people[i], people[j]);
          for (const solid of [...vehicles, ...walls]) check(people[i], solid);
        }
      }
      return { failures, samples, vehiclePairs, standingSamples, passengerSamples };
    }, scene);
    assert.ok(result.vehiclePairs > 500 && result.standingSamples > 20, `${scene.id}: sample real vehicle pairs and standing people`);
    assert.deepEqual(result.failures, []);
    console.log(`PASS ${scene.id}: ${result.samples} oriented solid checks, ${result.standingSamples} standing and ${result.passengerSamples} seated actor samples`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server?.close();
}
