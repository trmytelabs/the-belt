import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { writeFile } from 'node:fs/promises';

const server = process.env.BELT_TEST_BASE_URL ? null : await preview({ preview: { host:'127.0.0.1', port:0 }, logLevel:'silent' });
const browser = await chromium.launch({ headless:true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath:process.env.BELT_BROWSER_EXECUTABLE } : { channel:'chromium' }),
  args:process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text())) errors.push(message.text()); });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body:'' }));
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ body:'' }));
  await page.addInitScript(() => window.addEventListener('belt3d:ready', event => { window.fixtureApp = event.detail; event.detail.playPrologue = false; }));
  await page.goto(process.env.BELT_TEST_BASE_URL ?? server.resolvedUrls.local[0]);
  const read = (fn, arg) => page.evaluate(fn, arg);
  const wait = fn => page.waitForFunction(fn, null, { polling:10, timeout:90_000 });
  await wait(() => window.fixtureApp?.state === 'briefing');
  await read(() => {
    const app = window.fixtureApp;
    app.forceStory({ breakAtMs:1e12 }); app.model.autonomousCoworker = false;
    window.walkSamples = [];
    const begin = app.crew.beginWorkWalk.bind(app.crew);
    app.crew.beginWorkWalk = () => {
      const roots = [...app.world.residents.keys(), 'shan'].map(id => app.crew.actor(id).root);
      const before = roots.map(root => root.position.clone());
      begin();
      window.initialShiftJump = Math.max(...roots.map((root, index) => root.position.distanceTo(before[index])));
      const sample = () => {
        window.walkSamples.push({ time:app.time, roots:roots.map(root => ({ x:root.position.x,z:root.position.z,visible:root.visible })),
          workers:Object.values(app.workers).map(worker => ({ x:worker.root.position.x,z:worker.root.position.z })) });
      };
      sample();
      const timer = setInterval(() => { sample(); if (app.model.elapsedMs >= 6000) clearInterval(timer); }, 25);
    };
  });
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id.startsWith('opener'));
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.cutscene?.scene.id === 'scrum');
  await page.keyboard.press('Enter');
  await wait(() => window.fixtureApp.state === 'playing' && window.fixtureApp.model.elapsedMs >= 6200);
  const opening = await read(() => ({ jump:window.initialShiftJump, samples:window.walkSamples, remaining:window.fixtureApp.crew.workWalks.size }));
  assert.equal(opening.jump, 0, 'ending the scrum preserves the exact same crew roots and positions');
  assert.equal(opening.remaining, 0, 'everyone reaches their own work area');
  assert.ok(opening.samples.length > 10);
  for (let index = 1; index < opening.samples.length; index++) {
    const previous = opening.samples[index-1], current = opening.samples[index];
    for (let person = 0; person < current.roots.length; person++) {
      assert.equal(current.roots[person].visible, true, 'residents and Shan remain visible throughout the departure');
      assert.ok(Math.hypot(current.roots[person].x-previous.roots[person].x, current.roots[person].z-previous.roots[person].z)
        <= 4.3 * (current.time-previous.time) + 0.08, `crew leave by walking, without position jumps: ${JSON.stringify({ person,from:previous.roots[person],to:current.roots[person],elapsed:current.time-previous.time })}`);
    }
    for (let worker = 0; worker < current.workers.length; worker++) {
      assert.ok(Math.hypot(current.workers[worker].x-previous.workers[worker].x, current.workers[worker].z-previous.workers[worker].z)
        <= 7.5 * (current.time-previous.time) + 0.08, 'the playable pair also walk to their stations');
    }
  }
  console.log('PASS 3D scrum cast walks continuously to work; residents, Shan and playable workers remain present');

  // Attention: a line from Shan turns the heads of the crew in earshot toward him, by the look record and the head itself.
  const attention = await read(() => {
    const app = window.fixtureApp, crew = app.crew, shan = crew.actor('shan');
    // Shan stops a step in front of one of the crew, who waits at their station for the line, so someone is in earshot
    // wherever the shift had taken everyone before this check; the rest of the crew carry on with their freight.
    const listener = [...app.world.residents.keys()].find(id => {
      const actor = crew.actor(id);
      return actor.root.visible && actor.pose === 'none' && !crew.staged.has(id);
    });
    crew.crewTrips.delete(listener); crew.crewEpoch.set(listener, Infinity);
    const station = crew.workStation(listener);
    crew.staged.add('shan');
    shan.place(station.x + (station.x < 480 ? 48 : -48), station.y);
    shan.root.visible = true;
    crew.say('shan', 'HEADS UP', 4000);
    // The crew step by hand, so the check does not depend on the frame rate.
    for (let i = 0; i < 40; i++) crew.update(1 / 30, app.model, app.time + (i + 1) / 30);
    // A last, all but still step chooses the looks from where everyone now stands, as measured below; after a full
    // step someone walking across the edge of earshot could be measured inside it with a look chosen outside.
    crew.update(1e-4, app.model, app.time + 41 / 30);
    const head = { x: shan.root.position.x, y: shan.root.position.y + shan.character.headHeight * 0.92, z: shan.root.position.z };
    const report = [];
    for (const [id, actor] of crew.actors) {
      if (id === 'shan' || !actor.root.visible || actor.pose !== 'none' || crew.staged.has(id)) continue;
      const dx = head.x - actor.root.position.x, dz = head.z - actor.root.position.z, raw = Math.atan2(dx, dz) - actor.root.rotation.y;
      report.push({ id, distance: Math.hypot(dx, dz), bearing: Math.atan2(Math.sin(raw), Math.cos(raw)), look: actor.look, yaw: actor.character.head.rotation.y, head });
    }
    crew.staged.delete('shan');
    return report;
  });
  const listeners = attention.filter(a => a.distance < 8.95 && Math.abs(a.bearing) <= 1.74);
  assert.ok(listeners.length >= 1, `someone stands in earshot of Shan: ${JSON.stringify(attention.map(a => ({ id:a.id, d:+a.distance.toFixed(1), b:+a.bearing.toFixed(2) })))}`);
  for (const a of listeners) {
    assert.ok(a.look && Math.hypot(a.look.x - a.head.x, a.look.z - a.head.z) < 0.01, `${a.id} looks at Shan: ${JSON.stringify(a.look)}`);
    if (Math.abs(a.bearing) > 0.15) assert.ok(Math.sign(a.yaw) === Math.sign(a.bearing) && Math.abs(a.yaw) > 0.05, `${a.id}'s head turns his way: yaw ${a.yaw.toFixed(2)} for bearing ${a.bearing.toFixed(2)}`);
  }
  console.log(`PASS 3D crew in earshot look at the speaker (${listeners.map(a => a.id).join(', ')})`);

  const work = await read(() => {
    const app = window.fixtureApp, crew = app.crew;
    app.state = 'paused'; crew.reset();
    const totals = { samples:0, platform:0, carrying:0, working:0, hidden:0, belt:0, pickups:0 };
    const previous = new Map();
    const previousState = new Map();
    const previousFreight = new Map();
    app.model.beltTravel = 0; app.model.beltSpeed = 50;
    for (const parcel of app.model.packages) parcel.state = 'delivered';
    // The paused shift froze the countdown to the next player parcel at whatever it read; the crew at the head of the
    // belt lift freight only while none is due there, so the routine is measured with none due.
    Object.defineProperty(app.model, 'nextArrivalInMs', { configurable:true, value:60_000 });
    for (let time = 0; time < 20000; time += 100) {
      app.model.beltTravel += 5;
      app.model.elapsedMs = time; crew.update(0.1, app.model, time / 1000);
      for (const id of app.world.residents.keys()) {
        const actor = crew.actor(id), before = previous.get(id), root = actor.root;
        const freight = crew.crewFreight.get(id);
        if (freight.root.userData.state === 'belt' && freight.root.visible) {
          totals.belt++;
          if (freight.root.position.x !== 0) throw new Error('the actual resident box must ride on the belt');
          if (freight.highlight.visible) throw new Error('NPC freight must have no player ring');
        }
        if (previousState.get(id) === 'belt' && freight.root.userData.state === 'held') {
          if (previousFreight.get(id) !== freight.root.uuid) throw new Error('pickup must keep the same visible parcel');
          totals.pickups++;
        }
        previousState.set(id, freight.root.userData.state);
        previousFreight.set(id, freight.root.uuid);
        if (time < 10000) { previous.set(id, root.position.clone()); continue; }
        const x = root.position.x * 32 + 480;
        totals.samples++;
        if (x >= 318 && x <= 642) totals.platform++;
        if (!root.visible) totals.hidden++;
        if (actor.carrying && crew.crewFreight.get(id).root.visible) totals.carrying++;
        if (actor.carrying || (before && before.distanceTo(root.position) > 0.01)) totals.working++;
        previous.set(id, root.position.clone());
      }
    }
    delete app.model.nextArrivalInMs;
    return totals;
  });
  assert.equal(work.hidden, 0);
  assert.equal(work.platform, work.samples, 'ordinary loading routes stay on the platform and at the rear doors');
  assert.ok(work.carrying/work.samples > 0.28, 'the crew regularly carry visible parcels');
  assert.ok(work.working/work.samples > 0.72, 'handling freight occupies most of the ordinary routine');
  assert.ok(work.belt > 50 && work.pickups >= 8, 'visible belt freight transitions into crew pickups');
  console.log('PASS 3D crew handle visible belt parcels, pick up the same freight and carry it along their ordinary platform routine');

  // A synthetic camera/actor position measures the actual rendered window,
  // comparing an occluded torso with the same unobstructed reference pixels.
  const cutaway = await read(saveImages => {
    const app = window.fixtureApp, world = app.world, camera = app.camera;
    app.updateCamera = () => {};
    for (const actor of app.crew.actors.values()) actor.root.visible = false;
    for (const worker of Object.values(app.workers)) worker.root.visible = false;
    const actor = app.crew.actor('hussan');
    actor.place(244, 728); actor.root.visible = true; actor.root.rotation.y = 0;
    actor.pose = 'none'; actor.animate(0.1, 20, true);
    const centre = actor.root.position.clone().add({ x:0,y:1.05,z:0 });
    camera.position.copy(centre).add({ x:0,y:5.5,z:9 }); camera.lookAt(centre); camera.updateMatrixWorld();
    const gl = app.renderer.getContext(), width = app.renderer.domElement.width, height = app.renderer.domElement.height;
    const point = centre.clone().project(camera);
    const images = {};
    const capture = label => {
      app.renderer.render(world.scene, camera);
      const pixels = new Uint8Array(5*5*4);
      gl.readPixels(Math.round((point.x+1)*width/2)-2, Math.round((point.y+1)*height/2)-2, 5,5,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      if (saveImages && label) images[label] = app.renderer.domElement.toDataURL('image/png').split(',')[1];
      return [...pixels];
    };
    world.truckCutaway.update(camera, []);
    const solid = capture('solid');
    world.truckCutaway.update(camera, [actor.root]);
    const count = world.truckCutaway.activeCount, circle = world.truckCutaway.circles[0].toArray();
    const revealed = capture('revealed');
    const truckMaterials = new Set();
    for (const truck of world.trucks) truck.group.traverse(mesh => {
      if (mesh.isMesh) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) truckMaterials.add(material);
    });
    // Suppress colour only: keep identical truck shadows in the reference view.
    for (const material of truckMaterials) material.colorWrite = false;
    const unobstructed = capture('reference');
    for (const material of truckMaterials) material.colorWrite = true;
    world.truckCutaway.update(camera, []);
    const restored = capture();
    world.truckCutaway.update(camera, [actor.root]);
    capture();
    return { solid,revealed,unobstructed,restored,count,circle,images,
      programs:app.renderer.info.programs.map(program => program.diagnostics?.runnable).filter(value => value === false) };
  }, Boolean(process.env.BELT_SCREENSHOT_DIR));
  for (const [label,data] of Object.entries(cutaway.images)) await writeFile(join(process.env.BELT_SCREENSHOT_DIR, `cutaway-${label}.png`), Buffer.from(data,'base64'));
  const difference = (a,b) => a.reduce((sum,value,index) => sum+(index%4 === 3 ? 0 : Math.abs(value-b[index])),0);
  assert.equal(cutaway.count, 1);
  assert.ok(cutaway.circle[2] > 0 && cutaway.circle[3] > 0);
  assert.ok(difference(cutaway.solid, cutaway.unobstructed) > 400, 'the control truck genuinely hides the torso');
  assert.ok(difference(cutaway.revealed, cutaway.unobstructed) < difference(cutaway.solid, cutaway.unobstructed)*0.5,
    `the circular cutaway exposes the actual character pixels: ${difference(cutaway.revealed,cutaway.unobstructed)} vs ${difference(cutaway.solid,cutaway.unobstructed)}`);
  assert.equal(difference(cutaway.restored,cutaway.solid), 0, 'moving away restores the solid truck');
  assert.deepEqual(cutaway.programs, []);
  if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path:join(process.env.BELT_SCREENSHOT_DIR,'crew-truck-cutaway.png') });
  assert.deepEqual(errors, []);
  console.log('PASS 3D circular truck transparency reveals real character pixels and restores the solid shell; no shader or script errors');
} finally {
  await browser.close();
  await server?.httpServer.close();
}
