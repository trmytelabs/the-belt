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
  // However long the briefing, START THE NIGHT stays in view.
  const startButton = await page.getByRole('button', { name: /START THE NIGHT/ }).boundingBox();
  assert.ok(startButton && startButton.y >= 0 && startButton.y + startButton.height <= 800, `START THE NIGHT is on screen: ${JSON.stringify(startButton)}`);
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
  assert.deepEqual(engines.all,{running:12,lit:12});assert.equal(engines.exhaust,12*2);
  assert.equal(engines.repeat,12*2);assert.ok(engines.vibrates&&engines.reduced);
  assert.ok(engines.headlights.every(count=>count===2));assert.equal(engines.cough,'cough');assert.equal(engines.resumed,'none');assert.ok(engines.reset);
  console.log('PASS trucks start with one minute left, illuminate headlights, billow thick exhaust and visibly idle; reduced motion disables shaking, replay clears engines, loaders cough and resume');

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

  // Settings: from the pause screen, the music slider takes real arrow keys and the shake switch a real click;
  // each change applies at once and is kept on this device, and the arrows never reach the game.
  await read(() => {
    const app = window.fixtureApp; app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true;
    app.model.autonomousCoworker = false; app.model.eventStopped = true; app.overlay.clearCenter(); app.state = 'playing';
  });
  await page.keyboard.press('Escape');
  await wait(() => window.fixtureApp.state === 'paused');
  const pauseDialog = await read(() => {
    const panel = document.querySelector('.b3d-panel'), toast = document.querySelector('.b3d-toast');
    return { role: panel.getAttribute('role'), name: document.getElementById(panel.getAttribute('aria-labelledby'))?.textContent,
      toast: [toast.getAttribute('role'), toast.getAttribute('aria-live')] };
  });
  assert.deepEqual(pauseDialog, { role: 'dialog', name: 'GAME PAUSED.', toast: ['status', 'polite'] }, 'panels are named dialogs and toasts a polite status');
  await page.getByRole('button', { name: 'SETTINGS' }).click();
  await page.locator('[data-setting="music"]').focus();
  const workerBefore = await read(() => ({ x: window.fixtureApp.model.activeWorker.x, y: window.fixtureApp.model.activeWorker.y }));
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
  // The resolution slider redraws at a share of the usual pixel ratio, down to half.
  const ratioBefore = await read(() => window.fixtureApp.renderer.getPixelRatio());
  await page.locator('[data-setting="resolution"]').focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
  const ratioAfter = await read(() => window.fixtureApp.renderer.getPixelRatio());
  assert.ok(Math.abs(ratioAfter - ratioBefore / 2) < 1e-9, `half resolution halves the pixel ratio: ${ratioBefore} to ${ratioAfter}`);
  await page.locator('[data-setting="shake"]').click();
  const saved = await read(() => ({ settings: window.fixtureApp.settings, stored: JSON.parse(localStorage.getItem('the-belt:3d-settings:v1')),
    output: document.querySelector('[data-setting="music"]').nextElementSibling.textContent, state: window.fixtureApp.state,
    worker: { x: window.fixtureApp.model.activeWorker.x, y: window.fixtureApp.model.activeWorker.y } }));
  assert.deepEqual(saved.settings, { music: 0.4, effects: 1, shake: false, resolution: 0.5, twoPlayers: false });
  assert.deepEqual(saved.stored, saved.settings, 'kept on this device');
  assert.equal(saved.output, '40%');
  assert.equal(saved.state, 'paused', 'arrow keys on a slider do not resume');
  assert.deepEqual(saved.worker, workerBefore, 'arrow keys on a slider do not walk the worker');
  await page.getByRole('button', { name: 'BACK' }).click();
  // HOW TO PLAY lists the rules and controls, and BACK returns to the pause screen.
  await page.getByRole('button', { name: 'HOW TO PLAY' }).click();
  const help = await read(() => [...document.querySelectorAll('.b3d-help dt')].map((term) => [term.textContent, term.nextElementSibling.textContent]));
  assert.deepEqual(help.map(([term]) => term), ['SORT', 'RECOVERY', 'STOP THE BELT', 'THROW', 'PRIORITY', 'SURPRISES', 'INSPECTIONS', 'STREAKS', 'GOALS', 'PERKS', 'DAILY CHALLENGE', 'GHOST DRIVES', 'TIMMIES RUN', 'THE RALPH RUN', 'ENDLESS SHIFT', 'CONTROLS']);
  assert.match(help[2][1], /^E holds the belt for two seconds, three times a night/);
  assert.match(help.at(-1)[1], /^WASD or arrows move/);
  await page.getByRole('button', { name: 'BACK' }).click();
  // END NIGHT asks first; BACK returns to the pause screen with the night intact.
  await page.getByRole('button', { name: 'END NIGHT' }).click();
  assert.match(await page.locator('.b3d-panel h1').innerText(), /END THIS NIGHT\?/);
  await page.getByRole('button', { name: 'BACK' }).click();
  assert.match(await page.locator('.b3d-panel h1').innerText(), /GAME PAUSED/);
  await page.getByRole('button', { name: /RESUME/ }).click();
  await wait(() => window.fixtureApp.state === 'playing');
  // With the switch off, a breakage shake is dropped at once instead of decaying over half a second.
  await read(() => { window.fixtureApp.shake = 0.3; });
  await page.waitForTimeout(120);
  assert.equal(await read(() => window.fixtureApp.shake), 0, 'no camera shake with the switch off');
  await read(() => { const app = window.fixtureApp; app.settings = { music: 1, effects: 1, shake: true, resolution: 1 }; app.applySettings(); localStorage.removeItem('the-belt:3d-settings:v1'); });
  console.log('PASS settings from the pause screen: real-key music and resolution sliders and a shake switch apply at once, are kept on this device, and never move the worker; HOW TO PLAY lists the rules and controls');

  // END NIGHT from the pause screen drops the night unrecorded and brings back the briefing.
  const recordBefore = await read(() => {
    const app = window.fixtureApp; app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true;
    app.model.autonomousCoworker = false; app.model.eventStopped = true; app.overlay.clearCenter(); app.state = 'playing';
    app.model.elapsedMs = 60_000; app.model.score = 420;
    return localStorage.getItem('the-belt:3d-record:v1');
  });
  await page.keyboard.press('Escape');
  await wait(() => window.fixtureApp.state === 'paused');
  await page.getByRole('button', { name: 'END NIGHT' }).click();
  await page.locator('.b3d-panel').getByRole('button', { name: 'END NIGHT' }).click();
  await wait(() => window.fixtureApp.state === 'briefing');
  const ended = await read(() => ({ elapsed: window.fixtureApp.model.elapsedMs, score: window.fixtureApp.model.score,
    record: localStorage.getItem('the-belt:3d-record:v1'), briefing: document.querySelector('.b3d-panel').innerText }));
  assert.deepEqual([ended.elapsed, ended.score], [0, 0], 'a fresh shift waits');
  assert.equal(ended.record, recordBefore, 'the dropped night is not recorded');
  assert.match(ended.briefing, /ANOTHER NIGHT ON THE BELT/);
  console.log('PASS END NIGHT on the pause screen asks first, then drops the night unrecorded and returns to the briefing');

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

  // HUD feedback: the score rolls up to a gain with a jump, a streak warms up and catches fire,
  // a broken streak says so, a loss shakes, and the last half minute ticks red.
  await read(() => {
    const app = window.fixtureApp; app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true;
    app.model.autonomousCoworker = false; app.model.eventStopped = true; app.overlay.clearCenter(); app.state = 'playing';
  });
  const hud = () => read(() => {
    const score = document.querySelector('[data-f="score"]'), combo = document.querySelector('[data-f="combo"]'), time = document.querySelector('[data-f="time"]');
    return { score: score.textContent, scoreClass: score.className, combo: combo.textContent, comboClass: combo.className, urgent: time.parentElement.classList.contains('urgent') };
  });
  await wait(() => document.querySelector('[data-f="score"]').textContent === '00000');
  // Every number the HUD shows on the way is recorded as it changes, however slowly frames come.
  await read(() => {
    const m = window.fixtureApp.model, score = document.querySelector('[data-f="score"]');
    window.scoreSeen = [];
    window.scoreWatch = new MutationObserver(() => window.scoreSeen.push(score.textContent));
    window.scoreWatch.observe(score, { childList: true, characterData: true, subtree: true });
    Object.assign(m, { score: 450, combo: 6, sorted: 6 });
  });
  await wait(() => document.querySelector('[data-f="score"]').textContent === '00450');
  const rolling = await read(() => {
    window.scoreWatch.disconnect();
    return { final: document.querySelector('[data-f="score"]').textContent, steps: window.scoreSeen.filter((text) => text !== '00000' && text !== '00450').length };
  });
  assert.equal(rolling.final, '00450', `the score reaches the real one: ${JSON.stringify(rolling)}`);
  assert.ok(rolling.steps >= 1, `it rolls up through numbers on the way: ${JSON.stringify(rolling)}`);
  await wait(() => document.querySelector('[data-f="combo"]').classList.contains('hot'));
  assert.match((await hud()).combo, /^ON A ROLL · 6 IN A ROW/);
  await read(() => Object.assign(window.fixtureApp.model, { combo: 12, sorted: 12 }));
  await wait(() => document.querySelector('[data-f="combo"]').classList.contains('blazing'));
  assert.match((await hud()).combo, /^ON FIRE · 12 IN A ROW/);
  // On fire, the ring under the worker you control burns orange; it cools when the streak breaks.
  await wait(() => window.fixtureApp.activeRing.material.color.getHexString() === "ff8a3c");
  await read(() => Object.assign(window.fixtureApp.model, { combo: 0, score: 440 }));
  await wait(() => window.fixtureApp.activeRing.material.color.getHexString() === "f3e6c6");
  await wait(() => document.querySelector('[data-f="combo"]').classList.contains('lost'));
  const lost = await hud();
  assert.ok(lost.combo.startsWith('STREAK LOST') && lost.combo.includes('12 IN A ROW') && lost.score === '00440' && lost.scoreClass.includes('loss'), `a broken streak and a loss show at once: ${JSON.stringify(lost)}`);
  await wait(() => !document.querySelector('[data-f="combo"]').classList.contains('lost') && document.querySelector('[data-f="combo"]').textContent.startsWith('TARGET'));
  assert.equal((await hud()).urgent, false);
  await read(() => { const m = window.fixtureApp.model; m.elapsedMs = m.durationMs - 20_000; });
  await wait(() => document.querySelector('[data-f="time"]').parentElement.classList.contains('urgent'));
  // Racing your best: with a best night's notes on record, the HUD shows the gap to its pace at the same moment of the shift.
  const recordKept = await read(() => {
    const app = window.fixtureApp, kept = app.record;
    app.record = { ...kept, best: { total: 5000, grade: 'A', sorted: 40, date: '', pace: [0, 100, 200, 300] } };
    Object.assign(app.model, { paused: true, elapsedMs: 10_000, score: 400 });
    return kept;
  });
  await wait(() => document.querySelector('[data-f="pace"]')?.textContent === '+200 VS BEST' && !document.querySelector('[data-f="pace"]').hidden);
  await read(() => { window.fixtureApp.model.score = 150; });
  await wait(() => document.querySelector('[data-f="pace"]').textContent === '−50 VS BEST' && document.querySelector('[data-f="pace"]').classList.contains('behind'));
  await read((kept) => { const app = window.fixtureApp; app.record = kept; app.model.paused = false; }, recordKept);
  await wait(() => document.querySelector('[data-f="pace"]').hidden === (window.fixtureApp.record.best?.pace === undefined));
  // An endless run that reaches level 5 with 60 dispatched earns both endless medals on its results, kept with the record.
  const endlessMedals = await read(() => {
    const app = window.fixtureApp, kept = app.record, Model = app.model.constructor;
    app.model = new Model({ endless: true }); app.state = 'playing';
    Object.assign(app.model, { elapsedMs: 306_000, sorted: 60, paused: true });
    app.showResults();
    const result = { text: document.querySelector('.b3d-panel').innerText, medals: app.record.medals, stored: JSON.parse(localStorage.getItem('the-belt:3d-record:v1')).medals };
    app.record = kept; localStorage.setItem('the-belt:3d-record:v1', JSON.stringify(kept)); app.restart();
    return result;
  });
  assert.ok(endlessMedals.text.includes('MEDAL · LONG HAUL') && endlessMedals.text.includes('MEDAL · BELT MARATHON'), endlessMedals.text);
  assert.ok(['long-haul', 'marathon'].every((id) => endlessMedals.medals.includes(id) && endlessMedals.stored.includes(id)), JSON.stringify(endlessMedals));
  // Eight seconds of sorting below 30 frames a second on a GPU suggests a lower resolution, once a visit.
  const slowHint = await read(() => {
    const app = window.fixtureApp, quality = app.quality, toasts = [], show = app.overlay.showToast.bind(app.overlay);
    app.overlay.showToast = (text, ms) => { toasts.push(text); return show(text, ms); };
    app.quality = 'high'; app.slowFrames.hinted = false; app.slowFrames.seconds = app.slowFrames.frames = 0;
    for (let i = 0; i < 500; i++) app.watchFrameRate(1 / 60);
    const fast = toasts.length;
    for (let i = 0; i < 90; i++) app.watchFrameRate(0.1);
    for (let i = 0; i < 90; i++) app.watchFrameRate(0.1);
    app.quality = quality; app.overlay.showToast = show;
    return { fast, toasts };
  });
  assert.equal(slowHint.fast, 0, 'a smooth game gets no hint');
  assert.deepEqual(slowHint.toasts, ['RUNNING SLOWLY? A LOWER RESOLUTION IN SETTINGS (ESC) CAN HELP'], 'a slow one gets it once');
  // Ben's big moment is a story scene: an endless shift sorts straight past it.
  await read(() => {
    const app = window.fixtureApp, Model = app.model.constructor;
    app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.mesa.seen = true;
    app.model = new Model({ endless: true, autonomousCoworker: false }); app.overlay.clearCenter(); app.state = 'playing';
    Object.assign(app.model, { elapsedMs: 70_000, eventStopped: true });
  });
  await wait(() => window.fixtureApp.model.elapsedMs > 70_300);
  assert.deepEqual(await read(() => [window.fixtureApp.state, window.fixtureApp.benStarted]), ['playing', false], 'no interlude in the endless shift');
  await read(() => { const app = window.fixtureApp; app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true; app.model.autonomousCoworker = false; app.model.eventStopped = true; app.overlay.clearCenter(); app.state = 'playing'; });
  // An endless shift names the endless best to beat.
  const endlessKept = await read(() => {
    const app = window.fixtureApp, kept = app.record, Model = app.model.constructor;
    app.record = { ...kept, endless: { sorted: 42, seconds: 300, score: 4000, date: '' } };
    app.model = new Model({ endless: true }); app.model.paused = true; app.state = 'playing';
    return kept;
  });
  await wait(() => document.querySelector('[data-f=phase]').textContent.startsWith('ENDLESS  /  LEVEL 1  /  BEST 42'));
  await read((kept) => { const app = window.fixtureApp; app.record = kept; app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true; app.model.autonomousCoworker = false; app.model.eventStopped = true; app.overlay.clearCenter(); app.state = 'playing'; }, endlessKept);
  // A results panel stamps its grade and raises its lines in turn, with every line's text there from the start.
  const resultsMotion = await read(() => {
    window.fixtureApp.overlay.showPanel('<div class="grade">S</div><div class="kicker">K</div><h1>H</h1><p>first</p><p>second</p><button type="button">B</button>');
    const panel = document.querySelector('.b3d-panel'), lines = [...panel.querySelectorAll('p')];
    const motion = { grade: getComputedStyle(panel.querySelector('.grade')).animationName, delays: lines.map((line) => getComputedStyle(line).animationDelay), text: panel.innerText };
    window.fixtureApp.overlay.clearCenter();
    return motion;
  });
  assert.equal(resultsMotion.grade, 'b3d-stamp');
  assert.ok(parseFloat(resultsMotion.delays[1]) > parseFloat(resultsMotion.delays[0]), `the lines rise in turn: ${JSON.stringify(resultsMotion)}`);
  assert.ok(resultsMotion.text.includes('first') && resultsMotion.text.includes('second'), 'the text is readable from the start');
  console.log('PASS the HUD score rolls up to a gain and shakes on a loss; a streak goes ON A ROLL then ON FIRE, a broken one says STREAK LOST, and the last 30 seconds tick red; the results stamp the grade and raise their lines in turn');

  await read(() => {
    const app = window.fixtureApp; app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true;
    app.model.autonomousCoworker = false; app.model.eventStopped = true;
    app.overlay.clearCenter(); app.state = 'playing';
    Object.assign(app.model.packages[0], { y: 400, beltOffset: 400, route: 'A', state: 'belt' });
    Object.assign(app.model.activeWorker, { x: 400, y: 400 });
    window.interactionSounds = [];
    // The depot's distant sounds (a forklift's beeper, the PA chime) would mix into these checks; hold them off.
    app.audio.ambienceIn = Infinity;
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
    // The worker's own footsteps (a noise burst and a tone as a foot lands) are not interaction sounds: a step
    // landing inside these short windows failed them now and then. They are held off until the checks are done.
    app.footsteps = () => undefined;
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
  await read(() => { delete window.fixtureApp.footsteps; });
  console.log('PASS the pickable package has a halo and Space prompt; empty grabs stay quiet, while the wrong truck deducts ten points and plays the short recorded error cue');
  await read(() => { window.fixtureApp.audio.ambienceIn = 6; });

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
  // The countdown hangs in front of the parcel, below it on screen, clear of its address tag and the grab prompt.
  const placement = await read(() => {
    const app = window.fixtureApp, id = app.model.packages[0].id, view = app.parcels.get(id), marker = app.priorityMarkers.get(id);
    const Vec = app.camera.position.constructor, label = marker.label.getWorldPosition(new Vec()), parcel = view.root.getWorldPosition(new Vec()), tag = view.tag.getWorldPosition(new Vec());
    for (const point of [label, parcel, tag]) point.project(app.camera);
    return { label: label.y, parcel: parcel.y, tag: tag.y };
  });
  assert.ok(placement.label < placement.parcel && placement.parcel < placement.tag, `label below the parcel, tag above: ${JSON.stringify(placement)}`);
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

  // Night goals: tonight's are named in the briefing; a goal reached mid-shift is announced once with a toast,
  // and the results tick what was met and pay it into the night total.
  await read(() => { const app = window.fixtureApp; app.restart(); });
  await wait(() => window.fixtureApp.state === 'briefing');
  const briefingGoals = await read(() => ({ text: document.querySelector('.b3d-panel').innerText, goals: window.fixtureApp.goals.map((goal) => ({ label: goal.label, live: goal.live })) }));
  assert.ok(briefingGoals.goals.length === 3 && briefingGoals.goals.every((goal) => briefingGoals.text.includes(goal.label)), `the briefing names tonight's goals: ${JSON.stringify(briefingGoals)}`);
  await read(() => {
    const app = window.fixtureApp; app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true;
    app.model.autonomousCoworker = false; app.model.eventStopped = true; app.overlay.clearCenter(); app.state = 'playing';
    window.goalToasts = [];
    const toast = app.overlay.showToast.bind(app.overlay);
    app.overlay.showToast = (text, ms) => { window.goalToasts.push(text); return toast(text, ms); };
    // Every live goal's figure reached at once; the end-of-shift goals wait for the results.
    Object.assign(app.model, { bestCombo: 15, priorityOnTime: 3, thrownDeliveries: 3, bulkSorted: 8 });
  });
  const liveGoals = briefingGoals.goals.filter((goal) => goal.live);
  await wait((count) => window.goalToasts.filter((text) => text.startsWith('NIGHT GOAL MET')).length >= count, liveGoals.length);
  await page.waitForTimeout(300);
  const toasts = await read(() => window.goalToasts.filter((text) => text.startsWith('NIGHT GOAL MET')));
  assert.equal(toasts.length, liveGoals.length, `each live goal is announced once: ${JSON.stringify(toasts)}`);
  for (const goal of liveGoals) assert.ok(toasts.some((text) => text.includes(goal.label.toUpperCase())), `${goal.label} is announced`);
  // The HUD carries a chip per goal: the live ones ticked now, the clean-shift ones still open until the end.
  await wait((count) => document.querySelectorAll('.b3d-goal-chips span.met').length === count, liveGoals.length);
  const chips = await read(() => [...document.querySelectorAll('.b3d-goal-chips span')].map((chip) => ({ text: chip.textContent, state: chip.className })));
  assert.equal(chips.length, 3, `three goal chips: ${JSON.stringify(chips)}`);
  assert.equal(chips.filter((chip) => chip.state === 'open').length, 3 - liveGoals.length, `clean-shift goals stay open mid-shift: ${JSON.stringify(chips)}`);
  await read(() => { const app = window.fixtureApp; Object.assign(app.model, { ended: true, won: true }); app.state = 'celebrating'; app.showResults(); });
  const goalResults = await read(() => ({ text: document.querySelector('.b3d-panel').innerText, bonus: window.fixtureApp.goalBonus }));
  // A clean, finished synthetic shift with every live figure reached meets all three.
  assert.equal(goalResults.bonus, 450, goalResults.text);
  assert.ok(goalResults.text.includes('NIGHT GOALS · 3 OF 3') && goalResults.text.includes('+450'), goalResults.text);
  console.log('PASS the briefing names the three goals for the night; live goals are announced once as they are reached; the results tick all three and pay +450');

  // Inspections: Vic watches Termite's side with a WATCHING tag and a HUD countdown, and a real Space load pays +50.
  await read(() => {
    const app = window.fixtureApp; app.restart(); app.forceStory({ breakAtMs: 1e12 }); app.benStarted = true;
    app.model.autonomousCoworker = false; app.model.eventStopped = true; app.overlay.clearCenter(); app.state = 'playing';
    app.model.elapsedMs = 57_900;
    window.inspectionPops = [];
    const pop = app.overlay.pop.bind(app.overlay);
    app.overlay.pop = (text, ...rest) => { window.inspectionPops.push(text); return pop(text, ...rest); };
  });
  await wait(() => window.fixtureApp.model.inspection !== null && window.fixtureApp.crew.watcher === 'vic');
  await wait(() => window.fixtureApp.crew.actor('vic').root.getObjectByName('watching-tag')?.visible === true);
  await wait(() => document.querySelector('[data-f="phase"]').textContent.includes('VIC WATCHING'));
  const watchedBefore = await read(() => {
    const m = window.fixtureApp.model, p = m.packages.find((item) => item.state !== 'delivered');
    Object.assign(p, { route: 'A', kind: 'smallbox', size: 'normal', state: 'held', workerId: m.activeWorker.id, flight: null });
    Object.assign(m.activeWorker, { x: m.layout.dropAreas.A.x, y: m.layout.dropAreas.A.y, heldId: p.id });
    return m.score;
  });
  await page.keyboard.press('Space');
  await wait(() => window.fixtureApp.model.inspectionLoads === 1);
  // The load's events reach the overlay on the next frame, which can take a while without a GPU.
  await wait(() => window.inspectionPops.length > 0);
  const watched = await read(() => ({ score: window.fixtureApp.model.score, pops: window.inspectionPops, bonus: window.fixtureApp.model.inspectionBonus }));
  assert.equal(watched.bonus, 50);
  assert.ok(watched.score - watchedBefore >= 150 && watched.pops.includes('WATCHED +50'), `a watched load pays its points and +50: ${JSON.stringify({ watchedBefore, watched })}`);
  await read(() => { window.fixtureApp.model.elapsedMs += 20_100; });
  await wait(() => window.fixtureApp.model.inspection === null && window.fixtureApp.crew.watcher === null);
  await wait(() => window.fixtureApp.crew.actor('vic').root.getObjectByName('watching-tag')?.visible !== true);
  console.log('PASS an inspection puts a WATCHING tag on Vic over the left side with a HUD countdown; a real Space load pays +50, and it all clears when time is up');

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
  // While it is connected, HOW TO PLAY names the controller's buttons.
  const padHelp = await read(() => { window.fixtureApp.showHelp('PAUSED'); return [...document.querySelectorAll('.b3d-help dd')].map((row) => row.textContent); });
  assert.match(padHelp[2], /^X holds the belt/);
  assert.match(padHelp.at(-1), /^Left stick or d-pad moves · A grabs and delivers/);
  await read(() => window.fixtureApp.showPausePanel('PAUSED'));
  // On a panel the d-pad steps a highlight through the buttons and A presses it; left and right move a
  // highlighted slider, and B presses BACK.
  const padFocus = () => document.querySelector('.b3d-panel .pad-focus');
  await tap(13, () => document.querySelector('.b3d-panel .pad-focus')?.textContent.includes('RESUME'));
  await tap(13, () => document.querySelector('.b3d-panel .pad-focus')?.textContent.includes('SETTINGS'));
  await tap(0, () => document.querySelector('.b3d-panel h1')?.textContent.includes('SOUND AND CAMERA'));
  assert.equal(await read(padFocus), null, 'a new panel starts with nothing highlighted');
  await tap(13, () => document.querySelector('.b3d-panel .pad-focus')?.dataset.setting === 'music');
  const musicBefore = await read(() => window.fixtureApp.settings.music);
  await tap(14, (before) => Math.abs(window.fixtureApp.settings.music - (before - 0.05)) < 1e-9, musicBefore);
  await tap(1, () => document.querySelector('.b3d-panel h1')?.textContent.includes('GAME PAUSED'));
  await read(() => { const app = window.fixtureApp; app.settings = { ...app.settings, music: 1 }; app.applySettings(); localStorage.removeItem('the-belt:3d-settings:v1'); });
  await tap(0, () => window.fixtureApp.state === 'playing');
  const startY = await read(() => window.fixtureApp.model.activeWorker.y);
  await read(() => window.padSet({ axes: [0, 1] }));
  await wait((y) => window.fixtureApp.model.activeWorker.y > y + 20, startY);
  await read(() => window.padSet());
  const onDuty = await read(() => window.fixtureApp.model.activeWorker.id);
  await tap(3, (id) => window.fixtureApp.model.activeWorker.id !== id, onDuty);
  await read(() => { window.fixtureApp.model.eventStopped = false; });
  await tap(2, () => window.fixtureApp.model.beltStopsRemaining === 2);
  // A controller that drops out mid-play pauses the game; plugged back in, A resumes.
  await read(() => { window.fakePads = []; });
  await wait(() => window.fixtureApp.state === "paused");
  await read(() => { window.fakePads = [{ connected: true, axes: [0, 0, 0, 0], buttons: [] }]; window.padSet(); });
  await wait(() => window.fixtureApp.pad.connected);
  await tap(0, () => window.fixtureApp.state === "playing");
  await read(() => window.fixtureApp.beginDriving('mall'));
  await wait(() => window.fixtureApp.state === 'driving' && window.fixtureApp.driving);
  await read(() => window.padSet({ buttons: { 7: 1 } }));
  await wait(() => window.fixtureApp.driving.speed > 3);
  await read(() => window.padSet({ buttons: { 6: 1 } }));
  await wait(() => Math.abs(window.fixtureApp.driving.speed) < 0.5);
  await read(() => { window.padSet(); window.fakePads = []; window.fixtureApp.restart(); });
  await wait(() => !window.fixtureApp.pad.connected);
  assert.equal(await read(() => document.querySelector('[data-f=keyhints]').hidden), false, 'and the keyboard keys again once it is gone');
  console.log('PASS a controller pauses and resumes (and dropping out mid-play pauses), walks the worker, switches workers, stops the belt, and drives and brakes the five-ton with its triggers; the HUD and HOW TO PLAY name its buttons while it is connected, and the d-pad, A and B work the pause and settings panels');

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
