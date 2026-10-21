import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

const server = await preview({ preview:{host:'127.0.0.1',port:0},logLevel:'silent' });
const browser = await chromium.launch({ headless:true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? {executablePath:process.env.BELT_BROWSER_EXECUTABLE} : {channel:'chromium'}),
  args:process.env.BELT_3D_GPU ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({viewport:{width:1280,height:800}}), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.addInitScript(()=>window.addEventListener('belt3d:ready',event=>{window.fixtureApp=event.detail;event.detail.playPrologue=false;}));
  await page.goto(server.resolvedUrls.local[0]);
  const read=(fn,arg)=>page.evaluate(fn,arg);
  const wait=fn=>page.waitForFunction(fn,null,{polling:10,timeout:90_000});
  await wait(()=>window.fixtureApp?.state==='briefing');
  assert.equal(await read(()=>window.fixtureApp.setPieces.devilModel.ready),true);
  assert.equal(await read(()=>window.fixtureApp.world.shoulderDevil.ready),true);
  assert.equal(await read(()=>Boolean(window.fixtureApp.world.residents.get('ben').character.body.getObjectByName('shoulder-devil').getObjectByName('devil-model'))),true,
    'Ben carries a miniature version of the same detailed devil');
  await read(()=>{const app=window.fixtureApp;app.state='paused';app.pausedFrom='playing';app.stage.stage('lot');});
  await wait(()=>Object.entries(window.fixtureApp.stage.stage('lot').props).filter(([name])=>name.startsWith('car-')||name.startsWith('park-')).every(([,car])=>car.getObjectByName('vehicle-model')));
  const cars=await read(()=>Object.entries(window.fixtureApp.stage.stage('lot').props).filter(([name])=>name.startsWith('car-')||name.startsWith('park-')).map(([name,car])=>{
    const model=car.getObjectByName('vehicle-model');
    let vertices=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    model.updateWorldMatrix(true,true);const inverse=car.matrixWorld.clone().invert();
    model.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      const position=mesh.geometry.attributes.position;vertices+=position.count;
      for(let vertex=0;vertex<position.count;vertex++){
        const point=car.position.clone().fromBufferAttribute(position,vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
        minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);minZ=Math.min(minZ,point.z);maxZ=Math.max(maxZ,point.z);
      }
    });
    const control=car.children.find(child=>child.name==='headlight');
    const light=model.getObjectByName('model-headlight');
    control.material.emissiveIntensity=0.15;
    const contract=car.userData.contract;
    return{name,vertices,length:maxX-minX,width:maxZ-minZ,height:maxY-minY,base:minY,
      sharedLight:light.material===control.material,blink:light.material.emissiveIntensity,
      fallbackHidden:car.children.filter(child=>child!==model).every(child=>!child.visible),
      contract:Boolean(contract&&contract.steeringWheel&&['driver','passenger','rearL','rearR'].every(seat=>contract.seats[seat]&&contract.seats[seat].hands&&contract.seats[seat].feet)),
      suspension:car.userData.suspension===model&&contract.suspension===model,
      wheelTurns:car.userData.wheels&&car.userData.wheels.steeringWheel===contract.steeringWheel};
  }));
  assert.ok(cars.length>=8);
  assert.ok(new Set(cars.map(car=>car.vertices)).size>=2,'use two different vehicle shapes');
  for(const car of cars){
    assert.ok(car.vertices>2000,`${car.name} has the detailed imported geometry`);
    assert.ok(Math.abs(car.length-4.2)<0.02 && Math.abs(car.width-1.8)<0.02 && Math.abs(car.height-1.5)<0.02,JSON.stringify(car));
    assert.ok(Math.abs(car.base)<0.02,'tyres meet the road');
    assert.equal(car.sharedLight,true);assert.equal(car.blink,0.15);assert.equal(car.fallbackHidden,true);
    assert.ok(car.contract&&car.suspension&&car.wheelTurns,`${car.name} carries the vehicle contract, its suspension pivot and a steering wheel on the wheel rig`);
  }
  console.log('PASS two detailed 3D car models fit existing driving roots, road height and Brian\'s working headlights, with the vehicle contract');

  const devil=await read(()=>{
    const app=window.fixtureApp,model=app.setPieces.demon.getObjectByName('devil-model'),samples=[];
    for(const time of [82000,83000,84000,84500,85050]){
      app.setPieces.updateBen(time,0.1,time/1000);
      // SkinnedMesh.updateMatrixWorld also refreshes its inverse bind matrix;
      // updateWorldMatrix alone would measure the old unplaced skin transform.
      app.world.scene.updateMatrixWorld(true);
      let minY=Infinity,maxY=-Infinity,vertices=0;
      model.traverseVisible(mesh=>{
        if(!mesh.isMesh)return;
        const positions=mesh.geometry.attributes.position;vertices+=positions.count;
        for(let vertex=0;vertex<positions.count;vertex++){
          const point=mesh.position.clone();
          if(mesh.isSkinnedMesh)mesh.getVertexPosition(vertex,point);else point.fromBufferAttribute(positions,vertex);
          const y=point.applyMatrix4(mesh.matrixWorld).z*32+340;
          minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        }
      });
      samples.push({time,stage:app.setPieces.benStage,vertices,minY,maxY,root:app.setPieces.demon.position.toArray(),modelScale:model.scale.toArray(),modelPosition:model.position.toArray()});
    }
    app.setPieces.reset();
    return{samples,copies:app.setPieces.demon.children.filter(child=>child.name==='devil-model').length,
      visible:app.setPieces.demon.visible,weapon:model.getObjectByName('Trident')?.visible??false};
  });
  for(const sample of devil.samples){
    assert.ok(sample.vertices>2000,'the story uses the imported skinned devil');
    assert.ok(sample.minY>504 && sample.maxY<592,`the animated devil fits between its neighboring trucks: ${JSON.stringify(sample)}`);
  }
  assert.equal(devil.copies,1);assert.equal(devil.visible,false);assert.equal(devil.weapon,false);
  if(process.env.BELT_SCREENSHOT_DIR){
    await read(()=>{const app=window.fixtureApp;app.overlay.clearCenter();app.overlay.clearSpeech();app.state='interlude';app.benClock=82900;app.setPieces.updateBen(82900,.1,83);app.updateCamera(1,true);app.lastRender=-Infinity;app.draw();});
    await page.screenshot({path:join(process.env.BELT_SCREENSHOT_DIR,'new-devil-in-scene.png')});
  }
  console.log('PASS the animated horned devil preserves emergence, drag, truck clearance and clean restart');
  assert.deepEqual(errors,[]);

  await page.close();
  const fallback=await browser.newPage();
  await fallback.route('**/models/vehicles/**',route=>route.abort());await fallback.route('**/models/creatures/**',route=>route.abort());
  await fallback.addInitScript(()=>window.addEventListener('belt3d:ready',event=>{window.fixtureApp=event.detail;event.detail.playPrologue=false;}));
  await fallback.goto(server.resolvedUrls.local[0]);
  await fallback.waitForFunction(()=>window.fixtureApp?.state==='briefing',null,{polling:10,timeout:90_000});
  const procedural=await fallback.evaluate(async()=>{
    const app=window.fixtureApp;const devil=await app.setPieces.devilModel.ready;
    const lot=app.stage.stage('lot');await new Promise(resolve=>setTimeout(resolve,300));
    const car=lot.props['car-skanky'];
    return{devil,devilFallback:app.setPieces.demon.children.some(child=>child.isMesh&&child.visible),
      carModel:Boolean(car.getObjectByName('vehicle-model')),carFallback:car.children.some(child=>child.isMesh&&child.visible)};
  });
  assert.deepEqual(procedural,{devil:false,devilFallback:true,carModel:false,carFallback:true});
  console.log('PASS blocked car/devil model downloads preserve both procedural fallbacks');
}finally{await browser.close();await server.httpServer.close();}
