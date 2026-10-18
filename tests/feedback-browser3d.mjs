import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { CHARACTER_MODELS } from '../src/three/characterModels.ts';

const server = await preview({ preview: { host:'127.0.0.1', port:0 }, logLevel:'silent' });
const browser = await chromium.launch({ headless:true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath:process.env.BELT_BROWSER_EXECUTABLE } : { channel:'chromium' }),
  args:process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport:{ width:1280, height:800 } }), errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**', route=>route.fulfill({body:''}));
  await page.addInitScript(()=>window.addEventListener('belt3d:ready',event=>{window.fixtureApp=event.detail;}));
  await page.goto(server.resolvedUrls.local[0]);
  const read=(fn,arg)=>page.evaluate(fn,arg), wait=(fn,arg)=>page.waitForFunction(fn,arg,{polling:10,timeout:90_000});
  await wait(()=>window.fixtureApp?.state==='briefing');
  await read(()=>{const app=window.fixtureApp;app.forceStory({breakAtMs:1e12});app.benStarted=true;app.model.autonomousCoworker=false;app.overlay.clearCenter();app.state='playing';app.model.eventStopped=true;});

  for(const side of [0,1]) {
    await read(side=>{
      const app=window.fixtureApp,m=app.model;m.activeIndex=side;
      const p=m.packages[0];Object.assign(p,{route:side?'S':'T',kind:'smallbox',size:'normal',state:'held',workerId:side?'skanky':'termite'});
      for(const worker of m.workers)worker.heldId=null;
      Object.assign(m.activeWorker,{heldId:p.id,x:side?578:382,y:1102});
    },side);
    const down=side?'KeyD':'KeyA',up=side?'KeyA':'KeyD';
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
    m.elapsedMs=129500;m.beltTravel=185*.7;c.updateReceiving(m,.01,129.5);
    const cough=c.unloaders[0].pose;
    m.elapsedMs=131000;c.updateReceiving(m,.01,131);
    const resumed=c.unloaders[0].pose;
    const headlights=app.world.trucks.map(truck=>{let lights=0;truck.group.traverse(child=>{if(child.name==='truck-headlight'&&child.material.emissiveIntensity>2)lights++;});return lights;});
    c.reset();return {before,first,all,exhaust,cough,resumed,headlights,reset:app.world.trucks.every(truck=>!truck.group.userData.engineRunning)};
  });
  assert.deepEqual(engines.before,{running:0,lit:0});assert.deepEqual(engines.first,{running:1,lit:1});
  assert.deepEqual(engines.all,{running:12,lit:12});assert.equal(engines.exhaust,12);
  assert.ok(engines.headlights.every(count=>count===2));assert.equal(engines.cough,'cough');assert.equal(engines.resumed,'none');assert.ok(engines.reset);
  console.log('PASS trucks start with one minute left, illuminate headlights and emit exhaust; a receiving loader coughs briefly and resumes; replay clears engines');

  await read(()=>{const app=window.fixtureApp;app.model.elapsedMs=80000;app.beginBreak();});
  await page.locator('.b3d-lunch-alert').waitFor({state:'visible'});
  assert.equal(await page.locator('.b3d-lunch-alert').innerText(),'15 MINUTE LUNCH BREAK!');
  const frozen=await read(()=>({elapsed:window.fixtureApp.model.elapsedMs,travel:window.fixtureApp.model.beltTravel,held:window.fixtureApp.model.activeWorker.heldId}));
  await page.waitForTimeout(1100);assert.ok(await page.locator('.b3d-lunch-alert').isVisible());
  await page.keyboard.press('Escape');await wait(()=>window.fixtureApp.state==='paused');
  assert.equal(await page.locator('.b3d-lunch-alert').isVisible(),false);
  await page.keyboard.press('Enter');await wait(()=>window.fixtureApp.state==='story');
  await page.locator('.b3d-lunch-alert').waitFor({state:'hidden'});
  assert.deepEqual(await read(()=>({elapsed:window.fixtureApp.model.elapsedMs,travel:window.fixtureApp.model.beltTravel,held:window.fixtureApp.model.activeWorker.heldId})),frozen);
  assert.ok(await read(()=>window.fixtureApp.cutscene.index>0),'the alert leads into the existing break scene');
  console.log('PASS lunch has a multi-second 15 MINUTE LUNCH BREAK alert; pause/resume preserves the alert, shift clock and held freight');

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
} finally {await browser.close();await server.httpServer.close();}
