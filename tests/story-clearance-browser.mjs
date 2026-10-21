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
  await page.addInitScript(() => window.addEventListener('belt3d:ready', event => { window.fixtureApp = event.detail; event.detail.playPrologue = false; }));
  await page.goto(process.env.BELT_TEST_BASE_URL ?? server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 90_000 });
  // The seated checks need the cars' models and their contracts, which download after the stage is built.
  await page.evaluate(() => { window.fixtureApp.stage.stage('lot'); });
  await page.waitForFunction(() => Object.entries(window.fixtureApp.stage.stages.lot.props).filter(([name]) => /^(car-|park-)/.test(name)).every(([, car]) => car.userData.contract), null, { timeout: 90_000 });
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
      let contractSamples = 0;
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
          const car = actor.seatedIn, c = actor.character;
          car.updateWorldMatrix(true, true);
          c.root.updateWorldMatrix(true, true);
          const contract = car.userData.contract, targets = contract && actor.seat ? contract.seats[actor.seat] : null;
          // Every joint, the head's top, the knees and the ankles stay inside the cabin, in the
          // car's own frame; with the model's contract the wrists are on the wheel (the driver,
          // unless a gesture owns the arms) or the lap and the ankles on their targets.
          // The bundle exposes no THREE global; a cloned position serves as a fresh vector.
          const vector = (x = 0, y = 0, z = 0) => car.position.clone().set(x, y, z);
          const joint = (object, y = 0) => car.worldToLocal(object.getWorldPosition(vector()).add(vector(0, y, 0)));
          const ankle = (shin) => car.worldToLocal(shin.localToWorld(vector(0, -0.4, 0)));
          const points = { head: joint(c.head, 0.14), handL: joint(c.leftHand), handR: joint(c.rightHand), kneeL: joint(c.leftShin), kneeR: joint(c.rightShin), ankleL: ankle(c.leftShin), ankleR: ankle(c.rightShin), hips: joint(c.leftLeg) };
          const cabin = contract ? { minX: -1.32, maxX: 0.88, halfWidth: 0.76, minY: 0.3, maxY: 1.45 } : { minX: -1.6, maxX: 1.2, halfWidth: 0.9, minY: -0.1, maxY: 1.52 };
          for (const [part, p] of Object.entries(points)) {
            if ((p.x < cabin.minX || p.x > cabin.maxX || Math.abs(p.z) > cabin.halfWidth || p.y < cabin.minY || p.y > cabin.maxY + 0.015) && failures.length < 50) failures.push(`${scene.id} beat ${beat} at ${fraction}/20: seated ${name}'s ${part} outside the cabin at ${p.toArray().map(v => v.toFixed(2))}`);
          }
          if (targets) {
            contractSamples++;
            const near = (object, target, limit) => object.getWorldPosition(vector()).distanceTo(target.getWorldPosition(vector())) <= limit;
            if (actor.pose === 'sit' && targets.hands && !(near(c.leftHand, targets.hands.left, 0.02) && near(c.rightHand, targets.hands.right, 0.02)) && failures.length < 50) failures.push(`${scene.id} beat ${beat} at ${fraction}/20: seated ${name}'s hands off their targets`);
            const ankleWorld = (shin) => ({ getWorldPosition: v => shin.localToWorld(v.set(0, -0.4, 0)) });
            if (targets.feet && !(near(ankleWorld(c.leftShin), targets.feet.left, 0.02) && near(ankleWorld(c.rightShin), targets.feet.right, 0.02)) && failures.length < 50) failures.push(`${scene.id} beat ${beat} at ${fraction}/20: seated ${name}'s feet off their targets`);
          }
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
      return { failures, samples, vehiclePairs, standingSamples, passengerSamples, contractSamples };
    }, scene);
    assert.ok(result.vehiclePairs > 500 && result.standingSamples > 20, `${scene.id}: sample real vehicle pairs and standing people`);
    assert.ok(result.contractSamples > 20, `${scene.id}: seated samples against the loaded cars' contracts (${result.contractSamples})`);
    assert.deepEqual(result.failures, []);
    console.log(`PASS ${scene.id}: ${result.samples} oriented solid checks, ${result.standingSamples} standing and ${result.passengerSamples} seated actor samples (${result.contractSamples} on the cars' contracts)`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server?.close();
}
