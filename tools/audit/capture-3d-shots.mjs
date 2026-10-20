// Captures the 3D depot's audit baseline screenshots at fixed, repeatable
// camera positions, so the same shots can be retaken after a change.
//
// Run from the repository root against a fresh production build:
//
//   npm run build
//   BELT_BROWSER_EXECUTABLE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
//   BELT_3D_GPU=1 node tools/audit/capture-3d-shots.mjs [outputDir]
//
// Output: <outputDir>/<shot>.jpg and <outputDir>/shots.json (camera position,
// look-at, field of view, the game clock and the subject's pose for each shot).
// The default output directory is docs/images/audit-2026-10.
//
// The game needs a real GPU (quality "high") so that the imported character,
// prop and parcel models load; on a software renderer the script stops.
// Once a scene is reached the render loop is stopped, the page's
// performance.now() becomes a clock the script advances itself and
// Math.random is seeded, so every shot sees the same frame.
//
// This is a review tool, not a test and not part of the game bundle.

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { OPENERS } from '../../src/game/slice/StoryScript.ts';
import { HOME_DECISION } from '../../src/three/homeScript.ts';

const outputDir = resolve(process.argv[2] ?? 'docs/images/audit-2026-10');
const viewport = { width: 1280, height: 800 };

await mkdir(outputDir, { recursive: true });
const server = process.env.BELT_TEST_BASE_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const baseUrl = process.env.BELT_TEST_BASE_URL ?? server.resolvedUrls.local[0];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  args: process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/** Installed before the game loads: a clock the script can take over, a seeded random and the app hook. */
const prepare = () => {
  const realNow = performance.now.bind(performance);
  window.__clock = null; // null: real time; a number: the script's own clock
  performance.now = () => window.__clock ?? realNow();
  let seed = 0x9e3779b9;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.addEventListener('belt3d:ready', (event) => { window.fixtureApp = event.detail; event.detail.playPrologue = false; });
};

/** Page-side helpers, installed once the app exists. */
const installHelpers = () => {
  const app = window.fixtureApp;
  const Vector3 = app.camera.position.constructor;
  const realUpdateCamera = app.updateCamera.bind(app);
  const round = (v) => ({ x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) });
  window.audit = {
    /** Stops the render loop and takes over the clock from the current moment. */
    freeze() {
      app.renderer.setAnimationLoop(null); window.clearInterval(app.tickTimer);
      window.__clock = performance.now(); app.lastFrame = window.__clock;
    },
    step(frames = 1, ms = 1000 / 60) { for (let i = 0; i < frames; i++) { window.__clock += ms; app.tick(); } },
    /** Steps frames until `predicate` holds; returns the frames stepped, or -1 if it never held. */
    stepUntil(predicate, maxFrames = 3600) { for (let i = 0; i < maxFrames; i++) { if (predicate()) return i; this.step(1); } return predicate() ? maxFrames : -1; },
    hold(...codes) { app.keys.clear(); for (const code of codes) app.keys.add(code); },
    release() { app.keys.clear(); },
    /** Puts a story scene at a beat and directs it once, as the game does each frame. */
    directAt(index, elapsedMs, time = index * 2 + elapsedMs / 1000) {
      app.cutscene.index = index; app.cutscene.elapsedMs = elapsedMs;
      app.stage.direct(app.cutscene, 1 / 60, time);
    },
    /** Draws one frame with `camera` at `position` looking at `look` (world metres); returns the record for shots.json. `extra` may be a function, read after the draw. */
    shoot(name, camera, position, look, extra = {}) {
      if (position) camera.position.set(position.x, position.y, position.z);
      if (look) camera.lookAt(look.x, look.y, look.z);
      camera.updateMatrixWorld(true);
      app.lastRender = -Infinity;
      app.draw();
      const direction = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const details = typeof extra === 'function' ? extra() : extra;
      return { name, state: app.state, scene: app.cutscene?.scene.id ?? null, gameTime: +app.time.toFixed(3),
        camera: { position: round(camera.position), look: look ? round(look) : null, direction: round(direction), fov: camera.fov, aspect: +camera.aspect.toFixed(4) }, ...details };
    },
    gameCamera(snap = true) { realUpdateCamera(1, snap); },
    stubCamera() { app.updateCamera = () => {}; },
    restoreCamera() { app.updateCamera = realUpdateCamera; },
    /** A point offset from an object's origin in that object's own frame (yaw only), in world metres. */
    around(object, dx, dy, dz) {
      const yaw = object.rotation.y;
      return { x: object.position.x + dx * Math.cos(yaw) + dz * Math.sin(yaw), y: object.position.y + dy, z: object.position.z - dx * Math.sin(yaw) + dz * Math.cos(yaw) };
    },
    above(object, dy) { return { x: object.position.x, y: object.position.y + dy, z: object.position.z }; },
    worker(id = app.model.activeWorker.id) { return app.workers[id]; },
    pose(character) {
      const r = (o) => ({ x: +o.rotation.x.toFixed(3), y: +o.rotation.y.toFixed(3), z: +o.rotation.z.toFixed(3) });
      return { position: round(character.root.position), facing: +character.root.rotation.y.toFixed(3), walkPhase: +character.walkPhase.toFixed(3), action: character.action?.kind ?? null,
        body: r(character.body), leftArm: r(character.leftArm), leftForearm: r(character.leftForearm), leftLeg: r(character.leftLeg), leftShin: r(character.leftShin), head: r(character.head),
        importedModel: character.root.children.some((child) => child.name === 'character-model') };
    },
    car(car) {
      return { position: round(car.position), yaw: +car.rotation.y.toFixed(3), importedModel: car.children.some((child) => child.name === 'vehicle-model') };
    },
    truck() {
      const view = app.drivingView; const d = app.driving;
      return { x: +d.x.toFixed(3), z: +d.z.toFixed(3), heading: +d.heading.toFixed(3), speed: +d.speed.toFixed(3), modelReady: !!view.truck.userData.modelReady,
        children: view.truck.children.map((child) => child.name).filter(Boolean) };
    },
  };
};

const shots = [];
const skipped = [];
const errors = [];
try {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  await page.addInitScript(prepare);

  const settle = async (ms = 1200) => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(ms); };
  /** Runs `fn` in the page (it must end with one audit.shoot) and saves that frame. */
  const take = async (fn, arg) => {
    const record = await page.evaluate(fn, arg);
    if (record?.error) { skipped.push({ name: record.name, reason: record.error }); console.log(`SKIP ${record.name}: ${record.error}`); return; }
    await page.screenshot({ path: join(outputDir, `${record.name}.jpg`), type: 'jpeg', quality: 88 });
    shots.push(record);
    console.log(`shot ${record.name}: ${JSON.stringify(record.camera.position)} -> ${JSON.stringify(record.camera.look ?? record.camera.direction)}`);
  };
  const open = async (query) => {
    await page.goto(`${baseUrl}${query}`);
    await page.waitForFunction(() => window.fixtureApp?.state === 'briefing', null, { timeout: 90_000 });
    const quality = await page.evaluate(() => window.fixtureApp.quality);
    if (quality !== 'high') throw new Error(`The renderer runs at quality "${quality}"; the models only load on a GPU (set BELT_3D_GPU=1 and a hardware browser).`);
    await page.evaluate(installHelpers);
  };

  // ---------------------------------------------------------------- arrival lot: sedans and passengers
  await open('/?mode=3d');
  await page.evaluate(() => window.audit.freeze());
  await page.keyboard.press('Enter');
  await page.evaluate((scene) => { const { audit } = window; audit.stepUntil(() => window.fixtureApp.cutscene?.scene.id.startsWith('opener')); window.fixtureApp.playScene(scene); }, OPENERS[0]);
  await settle();
  // Beat 0 of opener-1 (LOCKED OUT): everyone waits in their cars at the chained gate.
  await take(() => { const { audit } = window; audit.directAt(0, 0); return audit.shoot('lot-game-camera', window.fixtureApp.stage.camera, null, null, { subject: 'opener-1 beat 0 from the scene\'s own camera' }); });
  const carShot = (name, from, to, subject) => page.evaluate(([name, from, to, subject]) => {
    const app = window.fixtureApp; const { audit } = window;
    audit.directAt(0, 0);
    const stage = app.stage.stages.lot; const car = stage.props['car-skanky'];
    // The car's own frame: +x is its nose, +z its right side (yaw applied).
    return audit.shoot(name, app.stage.camera, audit.around(car, ...from), audit.around(car, ...to),
      () => ({ subject, car: audit.car(car), passengers: { skanky: audit.pose(stage.actors.get('skanky').character), termite: audit.pose(stage.actors.get('termite').character) } }));
  }, [name, from, to, subject]);
  for (const [name, from, to, subject] of [
    ['sedan-exterior-front-left', [2.6, 1.3, -4.6], [0, 0.75, 0], 'car-skanky, front three-quarter from its left'],
    ['sedan-exterior-front-right', [2.6, 1.3, 4.6], [0, 0.75, 0], 'car-skanky, front three-quarter from its right'],
    ['sedan-exterior-rear', [-5.5, 1.6, -4.0], [0, 0.75, 0], 'car-skanky, rear three-quarter'],
    ['sedan-window-passengers', [-0.3, 1.25, 2.8], [-0.3, 1.0, 0], 'car-skanky through the right-side windows: Skanky driving, Termite beside'],
    ['sedan-interior-over-shoulder', [-1.6, 1.3, 0.45], [2.5, 0.8, 0], 'inside car-skanky, from behind the seats through the windscreen'],
  ]) {
    const record = await carShot(name, from, to, subject);
    await page.screenshot({ path: join(outputDir, `${record.name}.jpg`), type: 'jpeg', quality: 88 });
    shots.push(record); console.log(`shot ${record.name}: ${JSON.stringify(record.camera.position)} -> ${JSON.stringify(record.camera.look)}`);
  }

  // ---------------------------------------------------------------- the house: seated on the couch
  await page.evaluate((scene) => { window.fixtureApp.playScene(scene); }, HOME_DECISION);
  await settle();
  // A loaded model is attached during a draw; a few draws after the downloads settle put the house actors' models on.
  await page.evaluate(() => { const app = window.fixtureApp; for (let i = 0; i < 3; i++) { app.lastRender = -Infinity; app.draw(); } });
  await take(() => {
    const app = window.fixtureApp; const { audit } = window;
    if (app.cutscene?.scene.id !== 'home-decision') return { name: 'house-game-camera', error: `scene is ${app.cutscene?.scene.id}` };
    audit.directAt(0, 0);
    const stage = app.stage.stages.house;
    return audit.shoot('house-game-camera', app.stage.camera, null, null, () => ({ subject: 'home-decision beat 0 from the scene\'s own camera',
      poses: { termite: audit.pose(stage.actors.get('termite').character), skanky: audit.pose(stage.actors.get('skanky').character) } }));
  });
  await take(() => {
    const app = window.fixtureApp; const { audit } = window;
    if (app.cutscene?.scene.id !== 'home-decision') return { name: 'crew-seated-couch', error: `scene is ${app.cutscene?.scene.id}` };
    audit.directAt(0, 0);
    const stage = app.stage.stages.house; const skanky = stage.actors.get('skanky'); const termite = stage.actors.get('termite');
    const mid = { x: (skanky.root.position.x + termite.root.position.x) / 2, y: 0.85, z: (skanky.root.position.z + termite.root.position.z) / 2 };
    return audit.shoot('crew-seated-couch', app.stage.camera, { x: mid.x - 1.2, y: 1.55, z: mid.z + 3.0 }, mid,
      () => ({ subject: 'Skanky and Termite on the couch', poses: { termite: audit.pose(termite.character), skanky: audit.pose(skanky.character) } }));
  });

  // ---------------------------------------------------------------- the shift: walking, grabbing, carrying, close-up, depot cameras
  await open('/?mode=3d');
  // From here the clock is the script's: the opener, the scrum, the countdown and the first parcels run deterministically.
  await page.evaluate(() => { window.fixtureApp.forceStory({ breakAtMs: 1e12 }); window.audit.freeze(); });
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.audit.stepUntil(() => window.fixtureApp.cutscene?.scene.id.startsWith('opener')));
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.audit.stepUntil(() => window.fixtureApp.cutscene?.scene.id === 'scrum'));
  await page.keyboard.press('Enter');
  const reached = await page.evaluate(() => window.audit.stepUntil(() => window.fixtureApp.state === 'playing'));
  if (reached < 0) throw new Error('the shift did not start on the stepped clock');
  await page.evaluate(() => window.audit.stubCamera());
  await settle();
  await page.evaluate(() => { const { audit } = window; while (window.fixtureApp.model.elapsedMs < 6200) audit.step(1); });

  await take(() => {
    const app = window.fixtureApp; const { audit } = window;
    audit.hold('KeyW');
    // Walk until the hips are at full swing (sin(phase) near 1): mid-stride.
    const worker = audit.worker();
    let frames = 0;
    for (; frames < 240; frames++) { audit.step(1); if (frames > 20 && Math.sin(worker.walkPhase) > 0.98) break; }
    const record = audit.shoot('crew-walking', app.camera, audit.around(worker.root, 2.6, 1.6, 3.4), audit.above(worker.root, 1.0),
      { subject: app.model.activeWorker.id, framesWalked: frames + 1, elapsedMs: app.model.elapsedMs, pose: audit.pose(worker) });
    audit.release();
    return record;
  });
  await take(() => {
    const app = window.fixtureApp; const { audit } = window;
    audit.step(45); // stand still: the walk eases out within half a second
    const worker = audit.worker();
    return audit.shoot('crew-close-face', app.camera, audit.around(worker.root, 0.9, 1.65, 1.4), audit.above(worker.root, 1.55),
      { subject: app.model.activeWorker.id, pose: audit.pose(worker) });
  });
  // Walk the active worker to the nearest belt parcel with real key input, then grab it.
  const grabbed = await page.evaluate(() => {
    const app = window.fixtureApp; const { audit } = window;
    const m = app.model;
    for (let frame = 0; frame < 60 * 40; frame++) {
      const me = m.activeWorker;
      const parcels = m.packages.filter((parcel) => parcel.state === 'belt');
      if (!parcels.length) { audit.release(); audit.step(1); continue; }
      const nearest = parcels.reduce((best, parcel) => (Math.hypot(parcel.x - me.x, parcel.y - me.y) < Math.hypot(best.x - me.x, best.y - me.y) ? parcel : best));
      const dx = nearest.x - me.x, dy = nearest.y - me.y;
      const keys = [];
      if (Math.abs(dx) > 8) keys.push(dx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(dy) > 8) keys.push(dy > 0 ? 'KeyS' : 'KeyW');
      audit.hold(...keys);
      audit.step(1);
      if (frame % 3 === 0 && me.heldId === null) {
        m.action();
        audit.step(1);
        if (me.heldId !== null) { audit.release(); return { frame, elapsedMs: m.elapsedMs, heldId: me.heldId }; }
      }
    }
    audit.release();
    return null;
  });
  if (!grabbed) {
    for (const name of ['crew-grabbing', 'crew-carrying']) { skipped.push({ name, reason: 'no belt parcel came within reach in 40 s of walking' }); console.log(`SKIP ${name}`); }
  } else {
    await take((grabbed) => {
      const app = window.fixtureApp; const { audit } = window;
      // The lift envelope lasts 0.42 s and peaks at 0.21 s: 12 frames after the grab frame (one already stepped).
      audit.step(11);
      const worker = audit.worker();
      return audit.shoot('crew-grabbing', app.camera, audit.around(worker.root, 2.4, 1.3, 3.0), audit.above(worker.root, 0.9),
        { subject: app.model.activeWorker.id, grabbed, framesAfterGrab: 12, pose: audit.pose(worker) });
    }, grabbed);
    await take(() => {
      const app = window.fixtureApp; const { audit } = window;
      audit.step(40);
      audit.hold('KeyW');
      const worker = audit.worker();
      let frames = 0;
      for (; frames < 240; frames++) { audit.step(1); if (frames > 20 && Math.sin(worker.walkPhase) > 0.98) break; }
      const record = audit.shoot('crew-carrying', app.camera, audit.around(worker.root, 2.6, 1.6, 3.4), audit.above(worker.root, 1.0),
        { subject: app.model.activeWorker.id, framesWalked: frames + 1, heldId: app.model.activeWorker.heldId, pose: audit.pose(worker) });
      audit.release();
      return record;
    });
  }
  await take(() => {
    const app = window.fixtureApp; const { audit } = window;
    audit.step(30);
    audit.restoreCamera();
    app.overview = false; audit.gameCamera(true);
    return audit.shoot('depot-follow', app.camera, null, null, { subject: 'the game\'s follow camera on the active worker', worker: audit.pose(audit.worker()) });
  });
  await take(() => {
    const app = window.fixtureApp; const { audit } = window;
    app.overview = true; audit.gameCamera(true);
    const record = audit.shoot('depot-overview', app.camera, null, null, { subject: 'the game\'s overview (V) camera' });
    app.overview = false; audit.stubCamera();
    return record;
  });
  await take(() => {
    const app = window.fixtureApp; const { audit } = window;
    const john = app.crew.actor('john');
    // John's own scripted squats start about 13 s into the shift; wait for one, then catch it 0.6 s in.
    let waited = 0;
    while (john.pose !== 'squat' && waited < 60 * 60) { audit.step(1); waited++; }
    if (john.pose !== 'squat') return { name: 'crew-pose-squat', error: 'John did not squat within 60 s of the shift' };
    audit.step(36);
    return audit.shoot('crew-pose-squat', app.camera, audit.around(john.root, 2.6, 1.2, 3.4), audit.above(john.root, 0.7),
      { subject: 'john, his scripted squat 0.6 s in', elapsedMs: app.model.elapsedMs, pose: audit.pose(john.character) });
  });

  // ---------------------------------------------------------------- the drive: the five-ton and the city
  await open('/?mode=3d&drive=mall');
  await page.evaluate(() => window.audit.freeze());
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.audit.stepUntil(() => window.fixtureApp.state === 'driving'));
  await page.evaluate(() => window.fixtureApp.drivingView.ready);
  await settle();
  await take(() => {
    const { audit } = window; const view = window.fixtureApp.drivingView;
    audit.hold('KeyW'); audit.step(180); // three seconds of full throttle
    return audit.shoot('truck-drive-chase', view.camera, null, null, { subject: 'the game\'s chase camera after 3 s of throttle', truck: audit.truck() });
  });
  await take(() => {
    const { audit } = window; const app = window.fixtureApp; const view = app.drivingView; const t = view.truck; const { tx, tz } = app.driving.pose;
    const front = { x: t.position.x + tx * 7, y: t.position.y + 2.2, z: t.position.z + tz * 7 };
    return audit.shoot('truck-drive-front', view.camera, front, audit.above(t, 1.4), { subject: 'the five-ton head on, same moment', truck: audit.truck() });
  });
  await take(() => {
    const { audit } = window; const app = window.fixtureApp; const view = app.drivingView; const t = view.truck; const { tx, tz } = app.driving.pose;
    // The right-hand side of the heading (y up): (-tz, tx).
    const side = { x: t.position.x - tz * 7 + tx * 1.5, y: t.position.y + 2.2, z: t.position.z + tx * 7 + tz * 1.5 };
    return audit.shoot('truck-drive-side', view.camera, side, audit.above(t, 1.4), { subject: 'the five-ton from its right side, same moment', truck: audit.truck() });
  });
  await take(() => {
    const { audit } = window; const view = window.fixtureApp.drivingView; const t = view.truck;
    audit.step(180); // six seconds in: out on the street
    return audit.shoot('city-game-camera', view.camera, null, null, { subject: 'the game\'s chase camera after 6 s of throttle', truck: audit.truck() });
  });
  await take(() => {
    const { audit } = window; const app = window.fixtureApp; const view = app.drivingView; const t = view.truck; const { tx, tz } = app.driving.pose;
    const record = audit.shoot('city-street', view.camera, { x: t.position.x - tx * 14, y: t.position.y + 4.5, z: t.position.z - tz * 14 },
      { x: t.position.x + tx * 30, y: 2, z: t.position.z + tz * 30 }, { subject: 'the street ahead of the five-ton, same moment', truck: audit.truck() });
    audit.release();
    return record;
  });

  const renderer = await page.evaluate(() => {
    const gl = window.fixtureApp.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), quality: window.fixtureApp.quality, pixelRatio: window.fixtureApp.renderer.getPixelRatio() };
  });
  await writeFile(join(outputDir, 'shots.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), viewport, renderer, shots, skipped, pageErrors: errors }, null, 2)}\n`);
  console.log(`${shots.length} shots written to ${outputDir}${skipped.length ? `, ${skipped.length} skipped` : ''}${errors.length ? `, ${errors.length} page errors` : ''}`);
} finally {
  await browser.close();
  await server?.close();
}
