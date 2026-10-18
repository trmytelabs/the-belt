import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

const mode = process.argv[2] ?? '3d';
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
    args: mode === '3d' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : process.env.BELT_BROWSER_RENDERER === 'canvas' ? ['--disable-webgl'] : [],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.addEventListener('belt3d:ready', event => { window.fixtureApp = event.detail; });
    let phaser;
    Object.defineProperty(window, 'Phaser', { configurable: true, get: () => phaser, set: value => {
      phaser = value;
      const boot = value.Game.prototype.boot;
      value.Game.prototype.boot = function (...args) { window.fixtureGame = this; return boot.apply(this,args); };
    } });
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({body:''}));
  await page.goto(`${server.resolvedUrls.local[0]}?mode=${mode}`);
  const read = (fn, arg = mode) => page.evaluate(fn, arg);
  const wait = (fn, options = {}) => page.waitForFunction(fn, mode, { polling: 10, timeout: 90_000, ...options });
  if(mode === '2d') await page.waitForFunction(() => window.fixtureGame?.scene.isActive('DepotScene'));
  await wait(mode => (mode === '3d' ? window.fixtureApp : window.fixtureGame?.scene.getScene('DepotScene'))?.state === 'briefing');
  if(mode === '2d') await page.waitForFunction(() => window.fixtureGame.loop.frame >= 3);
  await read(mode => (mode === '3d' ? window.fixtureApp : window.fixtureGame.scene.getScene('DepotScene')).forceStory({breakAtMs:1e12}));
  if(mode === '2d') {
    const bounds=await page.locator('#app canvas').boundingBox();
    await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height*495/720);
  } else await page.getByRole('button',{name:'START THE NIGHT  ↵'}).click();
  await wait(mode => (mode === '3d' ? window.fixtureApp : window.fixtureGame.scene.getScene('DepotScene')).state === 'story', {timeout:15_000});
  await page.keyboard.press('Enter', {delay:40});
  await wait(mode => (mode === '3d' ? window.fixtureApp : window.fixtureGame.scene.getScene('DepotScene')).cutscene?.scene.id === 'scrum');
  await page.keyboard.press('Enter', {delay:40});
  await wait(mode => (mode === '3d' ? window.fixtureApp : window.fixtureGame.scene.getScene('DepotScene')).state === 'playing');
  await read(mode => {
    const app = mode === '3d' ? window.fixtureApp : window.fixtureGame.scene.getScene('DepotScene');
    window.flowSample = null;
    const timer = setInterval(() => {
      const m = app.model;
      if (m.elapsedMs >= 4000 && !window.flowSample) window.flowSample = { count:m.packages.length, elapsed:m.elapsedMs, auto:m.autonomousCoworker };
      if (window.flowSample) clearInterval(timer);
    },10);
  });
  await wait(() => window.flowSample !== null);
  assert.equal(await read(() => window.flowSample.count), mode === '3d' ? 2 : 3, '3D arrivals now run at half the previous triple-intake rate');
  assert.equal(await read(() => window.flowSample.auto), true);
  await wait(mode => {
    const m = (mode === '3d' ? window.fixtureApp : window.fixtureGame.scene.getScene('DepotScene')).model;
    return m.workers[1].moving || m.workers[1].heldId !== null;
  });
  assert.deepEqual(await read(mode => {
    const w = (mode === '3d' ? window.fixtureApp : window.fixtureGame.scene.getScene('DepotScene')).model.workers[0];
    return {x:w.x,y:w.y};
  }), {x:382,y:500}, 'coworker autonomy never moves the player-controlled worker');
  console.log(`PASS ${mode} default intake and autonomous coworker with real start inputs`);

  const visual = await read(mode => {
    const app = mode === '3d' ? window.fixtureApp : window.fixtureGame.scene.getScene('DepotScene');
    app.state = 'paused';
    const m = app.model;
    m.autonomousCoworker = false;
    for (const worker of m.workers) worker.heldId = null;
    const template = {...m.packages[0]};
    if(mode === '2d') {
      const texts=[];
      const visit = item => { if(item.type === 'Text') texts.push(item.text); if(item.list) item.list.forEach(visit); };
      app.children.list.forEach(visit);
      return {millwoods:texts.includes('MILL WOODS'), ranges:texts.filter(copy=>/^\d+–\d+ ST$/.test(copy)).length};
    }
    const samples=[];
    let id=1000;
    for(const side of [0,1]) for(const kind of ['envelope','smallbox','standard','bigbox','longbox','mallwood','goji','lobsters','duck','makeup','mesa','panchetters','atv','snakes']) for(const facing of ['up','down','left','right']) {
      const worker=m.workers[side];
      const parcel={...template,id:id++,kind,state:'held',workerId:worker.id};
      m.packages.splice(0,m.packages.length,parcel);
      m.workers[1-side].heldId=null;
      Object.assign(worker,{heldId:parcel.id,facing});
      app.syncWorkers(1);
      app.syncParcels(0);
      const character=app.workers[worker.id];
      const view=app.parcels.get(parcel.id);
      character.root.updateMatrixWorld(true);
      view.root.updateMatrixWorld(true);
      const inverse=character.root.matrixWorld.clone().invert();
      let rear=Infinity;
      view.body.traverseVisible(object => {
        const positions=object.geometry?.attributes.position;
        if(!positions) return;
        for(let vertex=0;vertex<positions.count;vertex++) {
          const point=view.root.position.clone().fromBufferAttribute(positions,vertex).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
          rear=Math.min(rear,point.z);
        }
      });
      samples.push({kind,side,facing,clearance:rear});
    }
    return {samples};
  });
  if(mode === '3d') {
    assert.equal(visual.samples.length,112);
    for(const sample of visual.samples) assert.ok(sample.clearance>=0.319,JSON.stringify(sample));
  } else {
    assert.equal(visual.millwoods,true);
    assert.ok(visual.ranges>=10, 'truck and floor signs display street ranges');
  }

  if (mode === '3d') {
    await read(() => {
      const app = window.fixtureApp, m = app.model;
      m.truckLoads.clear(); m.eventStopped = true; m.activeIndex = 0; m.score = 100;
      const parcel = { ...m.packages[0], id: 9100, route: 'A', label: 'BOOKS', kind: 'smallbox', street: 27,
        address: '2417 27 ST', size: 'normal', state: 'held', workerId: 'termite', flight: null };
      m.packages.splice(0, m.packages.length, parcel);
      Object.assign(m.workers[0], { x: 330, y: 532, facing: 'left', heldId: parcel.id });
      m.workers[1].heldId = null; app.state = 'playing'; m.paused = false;
    });
    await page.keyboard.press('Space');
    assert.equal(await read(() => window.fixtureApp.model.heldPackage?.id), 9100, 'platform delivery is no longer accepted');
    await page.keyboard.down('KeyA');
    await wait(() => window.fixtureApp.model.activeWorker.x < 302);
    await page.keyboard.up('KeyA');
    await wait(() => window.fixtureApp.world.trucks.find(truck => truck.route === 'A').group.getObjectByName('truck-roof').material.opacity < 0.2);
    assert.equal(await read(() => window.fixtureApp.world.trucks.find(truck => truck.route === 'A').group.getObjectByName('truck-roof-sign').visible), false, 'the roof sign must not hide the shelves');
    const carriedView = await read(() => window.fixtureApp.parcels.get(9100).root.uuid);
    await page.keyboard.press('Space');
    await wait(() => window.fixtureApp.model.truckLoads.has(9100));
    await wait(() => window.fixtureApp.parcels.get(9100)?.root.parent === window.fixtureApp.world.trucks.find(truck => truck.route === 'A').group);
    assert.equal(await read(() => window.fixtureApp.parcels.get(9100).root.uuid), carriedView, 'the actual carried parcel persists on the shelf');
    await read(() => {
      const app = window.fixtureApp, m = app.model, original = m.packages[0];
      // Synthetic late-load fixtures exercise all shelf slots and overflow.
      for (let id = 9101; id < 9120; id++) {
        m.packages.push({ ...original, id, state: 'held', workerId: 'termite' });
        Object.assign(m.activeWorker, { x: id === 9101 ? 236 : 292, facing: id === 9101 ? 'up' : 'down', heldId: id });
        m.action();
      }
      m.packages.push({ ...original, id: 9121, route: 'D', street: 99, address: '2417 99 ST', state: 'held', workerId: 'termite' });
      m.activeWorker.heldId = 9121; m.score = 100;
    });
    await page.keyboard.press('Space');
    assert.equal(await read(() => window.fixtureApp.model.score), 90, 'a wrong truck costs ten points through real input');
    await wait(() => window.fixtureApp.world.trucks.find(truck => truck.route === 'A').group.children.filter(child => child.name === 'loaded-parcel').length === 20);
    const cargo = await read(() => {
      const app = window.fixtureApp, truck = app.world.trucks.find(truck => truck.route === 'A');
      return {
        loaded: truck.group.children.filter(child => child.name === 'loaded-parcel').length,
        overflow: [...app.model.truckLoads.values()].filter(load => load.overflow).length,
        front: app.model.truckLoads.get(9101).column,
        shelves: truck.group.getObjectByName('truck-shelves').children.length,
        floorNumbers: app.world.scene.children.filter(child => child.name === 'floor-street-range').length,
        lights: app.world.scene.children.find(child => child.isHemisphereLight).intensity,
        arc: Boolean(app.throwArc), treads: app.world.stairTreads.length,
      };
    });
    assert.equal(cargo.loaded, 20); assert.equal(cargo.overflow, 2); assert.equal(cargo.front, 0);
    assert.equal(cargo.shelves, 10); assert.equal(cargo.floorNumbers, 6); assert.equal(cargo.arc, false);
    assert.equal(cargo.treads, 12); assert.ok(cargo.lights >= 0.9);
    await read(() => {
      const app = window.fixtureApp, m = app.model;
      m.activeWorker.heldId = null;
      m.packages.splice(m.packages.findIndex(parcel => parcel.id === 9121), 1);
      app.syncParcels(0); app.updateHud();
    });
    if (process.env.BELT_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BELT_SCREENSHOT_DIR, 'truck-shelves-3d.png') });
    await page.keyboard.down('KeyD');
    await wait(() => window.fixtureApp.model.activeWorker.x > 330);
    await page.keyboard.up('KeyD');
    await wait(() => window.fixtureApp.world.trucks.find(truck => truck.route === 'A').group.getObjectByName('truck-roof').material.opacity === 1);
    assert.equal(await read(() => window.fixtureApp.model.truckLoads.size), 20, 'leaving restores the roof without clearing cargo');
    await read(() => window.fixtureApp.restart());
    assert.equal(await read(() => window.fixtureApp.model.truckLoads.size), 0);
    assert.equal(await read(() => window.fixtureApp.world.trucks.reduce((count, truck) => count + truck.group.children.filter(child => child.name === 'loaded-parcel').length, 0)), 0,
      'restart removes persistent cargo from the trucks themselves');
    console.log('PASS 3D truck entry, transparent roof, shelf placement, persistent real parcels, full shelves and rear overflow, floor numbers and ten-point wrong drop');
  }

  // A real F press at the stair top: one break penalty, an actual Shan visit,
  // no result screen, with the production scene continuing to update.
  await read(mode => {
    const app = mode === '3d' ? window.fixtureApp : window.fixtureGame.scene.getScene('DepotScene');
    const m=app.model;
    const parcel={...m.packages[0],id:9001,kind:'smallbox',label:'BOOKS',route:'T',street:119,address:'2417 119 ST',size:'normal',state:'held',workerId:'termite',flight:null};
    m.packages.splice(0,m.packages.length,parcel);
    Object.assign(m.workers[0],mode === '3d' ? {x:330,y:830,heldId:parcel.id,facing:'left'} : {x:380,y:784,heldId:parcel.id,facing:'down'});
    m.workers[1].heldId=null;
    m.activeIndex=0; m.score=1000; m.damaged=0; m.breakagePenalty=0; m.paused=false; m.random=()=>0.299999; m.spawnElapsedMs=0; m.nextSpawnIntervalMs=2000; m.pendingIntake=null;
    app.state='playing';
  });
  await page.keyboard.press('KeyF');
  await wait(mode => (mode==='3d'?window.fixtureApp:window.fixtureGame.scene.getScene('DepotScene')).model.damaged===1);
  assert.equal(await read(mode=>(mode==='3d'?window.fixtureApp:window.fixtureGame.scene.getScene('DepotScene')).model.score),850);
  await wait(mode => {
    const app=mode==='3d'?window.fixtureApp:window.fixtureGame.scene.getScene('DepotScene');
    return (mode==='3d'?app.overlay.history:app.life.history).some(line=>line.startsWith("SHAN O'MAC: WHAT DID I SAY"));
  });
  assert.equal(await read(mode=>(mode==='3d'?window.fixtureApp:window.fixtureGame.scene.getScene('DepotScene')).state),'playing');
  if(process.env.BELT_SCREENSHOT_DIR) await page.screenshot({path:join(process.env.BELT_SCREENSHOT_DIR,`address-stairs-${mode}.png`)});
  assert.deepEqual(errors,[]);
  console.log(`PASS ${mode} address signs, carrying clearance, stair throw and single penalty with Shan yelling; no script errors`);
} finally {
  await browser?.close();
  await new Promise(resolve=>server.httpServer.close(resolve));
}
