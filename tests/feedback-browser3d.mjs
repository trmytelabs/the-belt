import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { CHARACTER_MODELS } from '../src/three/characterModels.ts';

const server = process.env.BELT_TEST_BASE_URL ? null : await preview({ preview: { host:'127.0.0.1', port:0 }, logLevel:'silent' });
const browser = await chromium.launch({ headless:true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath:process.env.BELT_BROWSER_EXECUTABLE } : { channel:'chromium' }),
  args:process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport:{ width:1280, height:800 } }), errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**', route=>route.fulfill({body:''}));
  await page.addInitScript(()=>window.addEventListener('belt3d:ready',event=>{window.fixtureApp=event.detail;event.detail.playPrologue=false;}));
  await page.goto(process.env.BELT_TEST_BASE_URL ?? server.resolvedUrls.local[0]);
  const read=(fn,arg)=>page.evaluate(fn,arg), wait=(fn,arg)=>page.waitForFunction(fn,arg,{polling:10,timeout:90_000});
  await wait(()=>window.fixtureApp?.state==='briefing');
  await read(()=>{const app=window.fixtureApp;app.forceStory({breakAtMs:1e12});app.benStarted=true;app.model.autonomousCoworker=false;app.overlay.clearCenter();app.state='playing';app.model.eventStopped=true;});

  for(const side of [0,1]) {
    await read(side=>{
      const app=window.fixtureApp,m=app.model;m.activeIndex=side;
      const p=m.packages[0];Object.assign(p,{route:side?'S':'T',kind:'smallbox',size:'normal',state:'held',workerId:side?'skanky':'termite'});
      for(const worker of m.workers)worker.heldId=null;
      Object.assign(m.activeWorker,{heldId:p.id,x:side?630:330,y:1000});
    },side);
    const down=side?'KeyD':'KeyA',up=side?'KeyA':'KeyD';
    await page.keyboard.down('KeyS');
    await wait(()=>window.fixtureApp.model.activeWorker.y>=1142);
    await page.keyboard.up('KeyS');
    await page.keyboard.down(down);
    await wait(side=>side?window.fixtureApp.model.activeWorker.x>735:window.fixtureApp.model.activeWorker.x<225,side);
    await page.keyboard.up(down);
    await page.keyboard.down(up);
    await wait(side=>side?window.fixtureApp.model.activeWorker.x<=630:window.fixtureApp.model.activeWorker.x>=330,side);
    await page.keyboard.up(up);
  }
  const floor=await read(()=>{
    const app=window.fixtureApp;app.state='paused';
    return {numbers:app.world.scene.children.filter(child=>child.name==='floor-street-range').map(child=>({x:child.position.x,y:child.position.y,angle:child.rotation.x})),
      signs:app.world.trucks.filter(truck=>truck.route).map(truck=>Boolean(truck.group.getObjectByName('truck-roof-sign')))};
  });
  assert.equal(floor.numbers.length,8);
  assert.ok(floor.numbers.every(mark=>Math.abs(mark.angle+Math.PI/2)<1e-8 && (mark.y<0.02 || Math.abs(mark.y-1.112)<0.001)));
  assert.ok(floor.signs.every(sign=>!sign));
  console.log('PASS real keys descend and climb both stairs from an offset approach; eight flat street-number markings replace floating locations');

  const engines=await read(()=>{
    const app=window.fixtureApp,m=app.model,c=app.crew;c.reset();
    const sample=t=>{m.elapsedMs=t;c.update(.1,m,t/1000);return {running:c.runningEngines(t),lit:app.world.trucks.filter(truck=>truck.group.userData.engineRunning).length};};
    const before=sample(119999),first=sample(120000),all=sample(125500);
    const puffsBefore=app.world.puffs.puffs.length;c.emitExhaust(1,125500);
    const exhaust=app.world.puffs.puffs.length-puffsBefore;
    c.emitExhaust(.19,125500);
    const repeat=app.world.puffs.puffs.length-puffsBefore-exhaust;
    app.world.update(.1,125.5,m.beltTravel,false);
    const shake=app.world.trucks.map(truck=>truck.group.rotation.z);
    app.world.update(.1,125.6,m.beltTravel,false);
    const vibrates=app.world.trucks.every((truck,index)=>Math.abs(truck.group.rotation.z-shake[index])>.00001&&Math.abs(truck.group.rotation.z)<=.003);
    app.world.update(.1,125.7,m.beltTravel,true);
    const reduced=app.world.trucks.every(truck=>truck.group.rotation.z===0&&truck.group.rotation.x===0);
    m.elapsedMs=129500;m.beltTravel=185*.7;c.updateReceiving(m,.01,129.5);
    const cough=c.unloaders[0].pose;
    m.elapsedMs=131000;c.updateReceiving(m,.01,131);
    const resumed=c.unloaders[0].pose;
    const headlights=app.world.trucks.map(truck=>{let lights=0;truck.group.traverse(child=>{if(child.name==='truck-headlight'&&child.material.emissiveIntensity>2)lights++;});return lights;});
    c.reset();return {before,first,all,exhaust,repeat,vibrates,reduced,cough,resumed,headlights,reset:app.world.trucks.every(truck=>!truck.group.userData.engineRunning&&truck.group.rotation.x===0&&truck.group.rotation.z===0)};
  });
  assert.deepEqual(engines.before,{running:0,lit:0});assert.deepEqual(engines.first,{running:1,lit:1});
  assert.deepEqual(engines.all,{running:12,lit:12});assert.equal(engines.exhaust,12);
  assert.equal(engines.repeat,12);assert.ok(engines.vibrates&&engines.reduced);
  assert.ok(engines.headlights.every(count=>count===2));assert.equal(engines.cough,'cough');assert.equal(engines.resumed,'none');assert.ok(engines.reset);
  console.log('PASS trucks start with one minute left, illuminate headlights, emit denser exhaust and visibly idle; reduced motion disables shaking, replay clears engines, loaders cough and resume');

  await read(()=>{const app=window.fixtureApp;app.model.elapsedMs=80000;app.beginBreak();});
  await page.locator('.b3d-lunch-alert').waitFor({state:'visible'});
  assert.equal(await page.locator('.b3d-lunch-alert').innerText(),'15 MINUTE LUNCH BREAK!');
  assert.deepEqual(await read(()=>({state:window.fixtureApp.state,stage:window.fixtureApp.stage.active,cutscene:window.fixtureApp.cutscene})),{state:'break-alert',stage:null,cutscene:null},'the warning stays in the warehouse');
  const frozen=await read(()=>({elapsed:window.fixtureApp.model.elapsedMs,travel:window.fixtureApp.model.beltTravel,held:window.fixtureApp.model.activeWorker.heldId}));
  await page.waitForTimeout(1100);assert.ok(await page.locator('.b3d-lunch-alert').isVisible());
  await page.keyboard.press('Escape');await wait(()=>window.fixtureApp.state==='paused');
  assert.equal(await page.locator('.b3d-lunch-alert').isVisible(),false);
  await page.keyboard.press('Enter');await wait(()=>window.fixtureApp.state==='break-alert');
  await page.locator('.b3d-lunch-alert').waitFor({state:'hidden'});
  assert.deepEqual(await read(()=>({elapsed:window.fixtureApp.model.elapsedMs,travel:window.fixtureApp.model.beltTravel,held:window.fixtureApp.model.activeWorker.heldId})),frozen);
  assert.ok(await read(()=>window.fixtureApp.state==='story'&&window.fixtureApp.cutscene!==null),'the alert finishes before starting the existing lunch destination');
  console.log('PASS lunch has a multi-second 15 MINUTE LUNCH BREAK alert; pause/resume preserves the alert, shift clock and held freight');

  const patrols = await read(() => {
    const app = window.fixtureApp; app.restart(); app.state = 'paused';
    const crew = app.crew, samples = { left: 0, right: 0, squats: 0, shanMin: 2000, shanMax: 0, vicMin: 2000, vicMax: 0, crossings: 0 };
    for (let time = 0; time < 180000; time += 100) {
      app.model.elapsedMs = time; crew.update(.1, app.model, time / 1000); app.clearCrewFootprints();
      const john = crew.actor('john'), x = john.root.position.x * 32 + 480, y = john.root.position.z * 32 + 340;
      if (x < 428) samples.left++; if (x > 532) samples.right++;
      if (john.pose === 'squat') samples.squats++;
      if (x >= 428 && x <= 532) { if (y > 134) throw new Error('John crosses the running belt'); samples.crossings++; }
      const shanY = crew.actor('shan').root.position.z * 32 + 340;
      samples.shanMin = Math.min(samples.shanMin, shanY); samples.shanMax = Math.max(samples.shanMax, shanY);
      if (time < 21000 || time > 33500) {
        const vicY = crew.actor('vic').root.position.z * 32 + 340;
        samples.vicMin = Math.min(samples.vicMin, vicY); samples.vicMax = Math.max(samples.vicMax, vicY);
      }
    }
    return samples;
  });
  assert.ok(patrols.left > 100 && patrols.right > 100 && patrols.crossings > 5 && patrols.squats > 50);
  assert.ok(patrols.shanMin < 260 && patrols.shanMax > 980 && patrols.vicMin < 250 && patrols.vicMax > 980);
  console.log('PASS John visibly patrols both belt lanes and performs squat sets; Shan and Vic walk up and down between their scenes');

  await read(() => {
    const app = window.fixtureApp; app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true;
    app.model.autonomousCoworker = false; app.model.eventStopped = true;
    app.overlay.clearCenter(); app.state = 'playing';
    Object.assign(app.model.packages[0], { y: 400, beltOffset: 400, route: 'A', state: 'belt' });
    Object.assign(app.model.activeWorker, { x: 400, y: 400 });
    window.interactionSounds = [];
    for (const [method, kind] of [['createOscillator', 'oscillator'], ['createBufferSource', 'recording']]) {
      const original = AudioContext.prototype[method];
      AudioContext.prototype[method] = function (...args) {
        const source = original.apply(this, args), start = source.start;
        source.start = function (...times) {
          window.interactionSounds.push({ kind, duration: this.buffer?.duration ?? 0, loop: this.loop === true });
          return start.apply(this, times);
        };
        return source;
      };
    }
  });
  await wait(() => window.fixtureApp.pickupHalo.visible && window.fixtureApp.parcels.get(window.fixtureApp.model.packages[0].id)?.root.userData.pickable);
  assert.ok(await read(() => window.fixtureApp.pickupPrompt.visible));
  await page.keyboard.press('Space'); await wait(() => window.fixtureApp.model.heldPackage !== null);
  await wait(() => !window.fixtureApp.pickupHalo.visible);
  await read(() => {
    const app = window.fixtureApp;
    app.model.activeWorker.heldId = null;
    for (const p of app.model.packages) p.state = 'delivered';
    window.interactionSounds = [];
  });
  await page.keyboard.press('Space'); await page.waitForTimeout(100);
  assert.deepEqual(await read(() => window.interactionSounds), [], 'an empty grab emits no sound');
  await read(() => {
    const m = window.fixtureApp.model, p = m.packages[0];
    Object.assign(p, { route: 'D', state: 'held', workerId: 'termite' });
    Object.assign(m.activeWorker, { x: 264, y: m.layout.dockA.y, heldId: p.id });
    m.score = 100; window.interactionSounds = [];
  });
  await page.keyboard.press('Space'); await wait(() => window.fixtureApp.model.score === 90);
  await wait(() => window.interactionSounds.some(sound => sound.kind === 'recording' && !sound.loop && sound.duration > 0 && sound.duration < 2));
  assert.equal(await read(() => window.interactionSounds.some(sound => sound.kind === 'oscillator')), false, 'wrong drops use the recorded cue');
  console.log('PASS the pickable package has a halo and Space prompt; empty grabs stay quiet, while the wrong truck deducts ten points and plays the short recorded error cue');

  // Priority freight: a gold ring and countdown label ride the parcel, run down to red, hide while carried,
  // and a real Space load inside the window pays the bonus with its own pop and a results line.
  await read(() => {
    const app = window.fixtureApp; app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true;
    app.model.autonomousCoworker = false; app.model.eventStopped = true;
    app.overlay.clearCenter(); app.state = 'playing';
    const m = app.model, p = m.packages[0];
    Object.assign(p, { y: 400, beltOffset: 400, route: 'A', kind: 'smallbox', size: 'normal', state: 'belt' });
    Object.assign(m.activeWorker, { x: 300, y: 600 });
    m.priorityDue.set(p.id, m.elapsedMs + 15_000); m.priorityCount = 1;
  });
  const priorityMarker = () => read(() => {
    const app = window.fixtureApp, id = app.model.packages[0].id, marker = app.priorityMarkers.get(id);
    return marker ? { attached: marker.root.parent === app.parcels.get(id)?.root, draw: marker.ring.geometry.drawRange.count,
      color: marker.ring.material.color.getHexString(), seconds: marker.seconds, ring: marker.ring.visible, label: !!marker.label.material.map } : null;
  });
  await wait(() => { const app = window.fixtureApp; return app.priorityMarkers.get(app.model.packages[0].id)?.seconds >= 14; });
  const fresh = await priorityMarker();
  assert.ok(fresh.attached && fresh.draw >= 46 * 6 && fresh.color === 'ffc23a' && fresh.seconds >= 14 && fresh.ring && fresh.label, `a nearly full gold ring and a label on a fresh priority parcel: ${JSON.stringify(fresh)}`);
  await read(() => { window.fixtureApp.model.elapsedMs += 11_000; });
  await wait(() => { const app = window.fixtureApp; const seconds = app.priorityMarkers.get(app.model.packages[0].id)?.seconds; return seconds > 0 && seconds <= 4; });
  const urgent = await priorityMarker();
  assert.ok(urgent.draw > 0 && urgent.draw < fresh.draw * 0.35 && urgent.color === 'ff5a36', `the ring runs down to red: ${JSON.stringify(urgent)}`);
  const scoreBefore = await read(() => {
    const app = window.fixtureApp, m = app.model, p = m.packages[0];
    // Load with time to spare however slowly the renderer runs: the window is reset to ten seconds.
    m.priorityDue.set(p.id, m.elapsedMs + 10_000);
    Object.assign(p, { state: 'held', workerId: m.activeWorker.id });
    Object.assign(m.activeWorker, { x: m.layout.dropAreas.A.x, y: m.layout.dropAreas.A.y, heldId: p.id });
    window.priorityPops = [];
    const pop = app.overlay.pop.bind(app.overlay);
    app.overlay.pop = (text, ...rest) => { window.priorityPops.push(text); return pop(text, ...rest); };
    return m.score;
  });
  await wait(() => { const app = window.fixtureApp; return app.priorityMarkers.get(app.model.packages[0].id)?.ring.visible === false; });
  await page.keyboard.press('Space');
  await wait(() => window.fixtureApp.model.priorityOnTime === 1);
  await wait(() => window.fixtureApp.priorityMarkers.size === 0);
  const paid = await read(() => ({ score: window.fixtureApp.model.score, pops: window.priorityPops }));
  assert.equal(paid.score - scoreBefore, 200, 'the load scores its points and the priority bonus');
  assert.ok(paid.pops.includes('PRIORITY +100'), `the bonus pops: ${JSON.stringify(paid.pops)}`);
  await read(() => { const app = window.fixtureApp; Object.assign(app.model, { ended: true, won: true }); app.state = 'celebrating'; app.showResults(); });
  { const results = await page.locator('.b3d-panel').innerText(); assert.ok(results.includes('1 of 1 priority parcels on time · +100'), results); }
  console.log('PASS a priority parcel wears a gold countdown ring and label that run down to red and hide while carried; a real Space load in time pays +100 with its own pop and a results line');

  await read(() => { const app = window.fixtureApp; app.restart(); app.overlay.clearCenter(); app.beginMall(); });
  await page.keyboard.press('Space'); await wait(() => window.fixtureApp.mall.cart.pushed);
  await page.keyboard.press('Space'); await wait(() => !window.fixtureApp.mall.cart.pushed);
  await read(() => { const m = window.fixtureApp.mall; Object.assign(m.skanky, { x: 75, y: 400 }); Object.assign(m.cart, { x: 130, y: 400 }); });
  for (let stop = 0; stop < 2; stop++) {
    await wait(() => window.fixtureApp.stage.stages.mall.props[`slot-${window.fixtureApp.mall.interaction.slot}`]?.userData.pickable);
    await page.keyboard.press('Space'); await wait(() => window.fixtureApp.mall.carrying !== null);
    await page.keyboard.press('Space'); await wait(() => window.fixtureApp.mall.carrying === null);
  }
  await wait(() => window.fixtureApp.mall.cart.load.every((id, index) => {
    const bundle = window.fixtureApp.stage.stages.mall.props[`cart-${index}`];
    return bundle.visible && bundle.userData.boxes === window.fixtureApp.mall.store(id).boxes;
  }));
  const load = await read(() => {
    const app = window.fixtureApp, m = app.mall, props = app.stage.stages.mall.props;
    return m.cart.load.map((id, index) => ({ expected: m.store(id).boxes,
      visible: props[`cart-${index}`].visible,
      boxes: props[`cart-${index}`].children.filter(child => child.name === 'delivery-box' && child.visible).length }));
  });
  assert.equal(load.length, 2);
  assert.ok(load.every(stop => stop.visible && stop.expected >= 6 && stop.expected === stop.boxes), JSON.stringify(load));
  if (process.env.BELT_SCREENSHOT_DIR) {
    await read(() => { const app = window.fixtureApp; app.lastRender = -Infinity; app.draw(); });
    await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'mall-full-cart.png') });
  }
  console.log('PASS real Space grabs and parks the cart, highlights available truck freight, skips emptied slots and loads two full bundles matching their store box counts');

  // A controller (a stand-in for navigator.getGamepads): Start pauses and A resumes, the stick walks,
  // Y switches workers, X stops the belt, and the triggers drive and brake the five-ton.
  await read(() => {
    window.fakePads = [{ connected: true, axes: [0, 0, 0, 0], buttons: [] }];
    window.padSet = (over = {}) => {
      const pad = window.fakePads[0];
      pad.axes = over.axes ?? [0, 0, 0, 0];
      pad.buttons = Array.from({ length: 17 }, (_, index) => { const value = over.buttons?.[index] ?? 0; return { pressed: value > 0.5, value }; });
    };
    window.padSet();
    navigator.getGamepads = () => window.fakePads;
    const app = window.fixtureApp; app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true;
    app.model.autonomousCoworker = false; app.model.eventStopped = true; app.overlay.clearCenter(); app.state = 'playing';
  });
  await wait(() => window.fixtureApp.pad.connected);
  assert.deepEqual(await read(() => ({ pad: !document.querySelector('[data-f=padhints]').hidden, keys: !document.querySelector('[data-f=keyhints]').hidden })), { pad: true, keys: false }, 'the HUD names the controller buttons');
  const tap = async (index, until, arg) => {
    await read((i) => window.padSet({ buttons: { [i]: 1 } }), index);
    await wait(until, arg);
    await read(() => window.padSet());
    await page.waitForTimeout(60);
  };
  await tap(9, () => window.fixtureApp.state === 'paused');
  await tap(0, () => window.fixtureApp.state === 'playing');
  const startY = await read(() => window.fixtureApp.model.activeWorker.y);
  await read(() => window.padSet({ axes: [0, 1] }));
  await wait((y) => window.fixtureApp.model.activeWorker.y > y + 20, startY);
  await read(() => window.padSet());
  const onDuty = await read(() => window.fixtureApp.model.activeWorker.id);
  await tap(3, (id) => window.fixtureApp.model.activeWorker.id !== id, onDuty);
  await read(() => { window.fixtureApp.model.eventStopped = false; });
  await tap(2, () => window.fixtureApp.model.beltStopsRemaining === 2);
  await read(() => window.fixtureApp.beginDriving('mall'));
  await wait(() => window.fixtureApp.state === 'driving' && window.fixtureApp.driving);
  await read(() => window.padSet({ buttons: { 7: 1 } }));
  await wait(() => window.fixtureApp.driving.speed > 3);
  await read(() => window.padSet({ buttons: { 6: 1 } }));
  await wait(() => Math.abs(window.fixtureApp.driving.speed) < 0.5);
  await read(() => { window.padSet(); window.fakePads = []; window.fixtureApp.restart(); });
  await wait(() => !window.fixtureApp.pad.connected);
  assert.equal(await read(() => document.querySelector('[data-f=keyhints]').hidden), false, 'and the keyboard keys again once it is gone');
  console.log('PASS a controller pauses and resumes, walks the worker, switches workers, stops the belt, and drives and brakes the five-ton with its triggers; the HUD names its buttons while it is connected');

  await read(async list=>{
    const app=window.fixtureApp;app.state='paused';app.pausedFrom='playing';app.stage.end();app.overlay.setMode('shift');app.overlay.clearSpeech();app.overlay.setLunchAlert(false);app.overlay.clearCenter();
    await app.useCharacterModels(list);
    for(const [id,actor] of app.crew.actors)actor.root.visible=id==='aj'||id==='kylie';
    for(const [index,id] of ['kylie','aj'].entries()){
      const actor=app.crew.actor(id);actor.root.visible=true;actor.root.position.set(index?0.55:-0.55,1.1,0);actor.root.rotation.set(0,0,0);actor.faceAngle=0;actor.carrying=false;actor.pose='none';actor.animate(.1,0,false);
    }
    app.updateCamera=()=>{};app.camera.position.set(0,2.45,3.2);app.camera.lookAt(0,1.9,0);app.overlay.hud.style.display='none';
  },CHARACTER_MODELS.filter(entry=>entry.names.includes('KYLIE')||entry.names.includes('AJ')));
  await wait(()=>['aj','kylie'].every(id=>window.fixtureApp.crew.actor(id).root.getObjectByName('character-model')));
  const cast=await read(()=>{
    const c=window.fixtureApp.crew;const glasses=c.actor('aj').character.head.getObjectByName('glasses');
    return {kylieScale:c.actor('kylie').root.scale.x,ajScale:c.actor('aj').root.scale.x,glasses:glasses.visible,frames:glasses.children.filter(child=>child.isMesh&&child.visible).length};
  });
  assert.equal(cast.kylieScale,.86);assert.equal(cast.ajScale,1);assert.ok(cast.glasses&&cast.frames>=3);
  if(process.env.BELT_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.BELT_SCREENSHOT_DIR,'kylie-and-aj.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS recast Kylie is shorter; clothed bald AJ keeps visible glasses with the actual imported models');
} finally {await browser.close();await server?.httpServer.close();}
