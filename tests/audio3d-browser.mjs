import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { chromium } from 'playwright';
import { preview } from 'vite';

const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const base=compile(await readFile(new URL('../src/game/systems/AudioSystem.ts',import.meta.url),'utf8'));
const baseUrl=`data:text/javascript;base64,${Buffer.from(base).toString('base64')}`;
const depot=compile(await readFile(new URL('../src/three/audio.ts',import.meta.url),'utf8')).replaceAll("'../game/systems/AudioSystem'",JSON.stringify(baseUrl));
const server=await preview({preview:{host:'127.0.0.1',port:0},logLevel:'silent'});
const browser=await chromium.launch({headless:true,...(process.env.BELT_BROWSER_EXECUTABLE?{executablePath:process.env.BELT_BROWSER_EXECUTABLE}:{channel:'chromium'})});
try {
  const page=await browser.newPage();
  // A blank same-origin document gives the real music asset its production URL.
  await page.route('**/audio-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>3D sound check</title>'}));
  await page.goto(server.resolvedUrls.local[0]+'audio-fixture');
  const report=await page.evaluate(async compiled=>{
    const {DepotAudio}=await import(`data:text/javascript;base64,${btoa(compiled)}`);
    const ensure=(condition,message)=>{if(!condition)throw new Error(message);};
    const sampleRate=24000;
    const make=seconds=>{
      const offline=new OfflineAudioContext(2,Math.ceil(seconds*sampleRate),sampleRate),clock={now:0,state:'running'};
      const context=new Proxy(offline,{get(target,key){if(key==='currentTime')return clock.now;if(key==='state')return clock.state;if(key==='resume')return()=>Promise.resolve();const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
      window.AudioContext=function(){return context;};
      const system=new DepotAudio();system.getContext();return{offline,clock,system};
    };
    const metrics=(buffer,from=0,to=buffer.duration)=>{
      const data=buffer.getChannelData(0);let peak=0,sum=0,count=0;
      for(let i=Math.floor(from*sampleRate);i<Math.min(data.length,Math.floor(to*sampleRate));i++){const x=data[i];ensure(Number.isFinite(x),'finite audio');peak=Math.max(peak,Math.abs(x));sum+=x*x;count++;}
      return{peak,rms:Math.sqrt(sum/Math.max(1,count))};
    };
    const music=make(140),s=music.system;
    s.startMusic('game');await s.trackLoad;window.clearInterval(s.trackTimer);
    ensure(s.trackBuffer?.numberOfChannels===2 && s.trackBuffer.duration>60,'decode the actual stereo lo-fi recording');
    ensure(s.recordings.size===1,'start one recording');
    const first=[...s.recordings.keys()][0],join=s.nextTrackAt;
    s.startMusic('danger');s.startMusic('results');window.clearInterval(s.trackTimer);
    ensure(s.recordings.size===1 && [...s.recordings.keys()][0]===first,'changing music modes never restarts the song or layers duplicates');
    music.clock.now=join-.3;s.scheduleTrack();ensure(s.recordings.size===2,'schedule a second recording for the crossfade');
    const after=s.nextTrackAt;music.clock.now=after+.1;s.stopMusic();
    ensure(s.recordings.size===0 && s.trackTimer===null,'stop releases every recording and scheduler');
    const rendered=await music.offline.startRendering(),level=metrics(rendered,3,join-2),seam=metrics(rendered,join,join+1.6);
    ensure(level.rms>.002 && level.peak<.5,'music is audible with headroom');
    ensure(seam.rms>.001,'the loop crossfade has no silent gap');
    ensure(metrics(rendered,after+.5).peak<.000001,'music stops cleanly after the fade');

    const cues=[];
    for(const effect of ['grab','drop','correct','wrong','package-spawn','dig','whistle','drive-brake','drive-collision','footstep-deck','footstep-floor','near-grab']){
      const f=make(2);await f.system.preloadFoley();ensure(f.system.foleyBuffers.size===24,'all bundled recorded foley decodes');
      if(effect==='whistle')f.system.lunchWhistle();else if(effect.startsWith('drive-'))f.system.drivingCue(effect.slice(6));else if(effect.startsWith('footstep-'))f.system.footstep(0.6,effect.slice(9));else if(effect==='near-grab')f.system.playNear('grab',0.5);else f.system.play(effect);
      const rendered=await f.offline.startRendering(),level=metrics(rendered);
      ensure(level.peak<.65 && level.rms>.0001,`${effect}: audible soft cue, no clipping`);
      ensure(metrics(rendered,1.8).peak<.000001,`${effect}: no hanging voice`);cues.push({effect,...level});
    }
    // The conveyor: audible and clean while it runs, louder with freight on it, silent soon after it stops.
    const belt=make(4),b=belt.system;
    b.setBelt(50,0);
    const beltLoaded=belt.offline.suspend(1.5).then(async()=>{belt.clock.now=belt.offline.currentTime;b.setBelt(60,6);await belt.offline.resume();});
    const beltStopped=belt.offline.suspend(2.8).then(async()=>{belt.clock.now=belt.offline.currentTime;b.setBelt(null);await belt.offline.resume();});
    const beltRender=await belt.offline.startRendering();await beltLoaded;await beltStopped;
    const empty=metrics(beltRender,0.8,1.5),full=metrics(beltRender,2,2.8),quiet=metrics(beltRender,3.4,4);
    ensure(empty.rms>.0005 && empty.peak<.3,`the empty belt hums quietly: ${JSON.stringify(empty)}`);
    ensure(full.rms>empty.rms*1.15 && full.peak<.35,`freight on a faster belt rattles louder: ${JSON.stringify({empty,full})}`);
    ensure(quiet.peak<.000001,'a stopped belt falls silent');
    cues.push({effect:'belt',...full});
    // The player's levels: effects at a quarter play a cue about a quarter as loud; music at zero is silent.
    const levelCue=async effects=>{const f=make(2);f.system.setLevels(1,effects);await f.system.preloadFoley();
      const played=f.offline.suspend(.5).then(async()=>{f.clock.now=f.offline.currentTime;f.system.play('drop');await f.offline.resume();});
      const rendered=await f.offline.startRendering();await played;return metrics(rendered,.5,2);};
    const fullCue=await levelCue(1),quarterCue=await levelCue(.25);
    ensure(quarterCue.rms>fullCue.rms*.15 && quarterCue.rms<fullCue.rms*.4,`effects at 25% play about a quarter as loud: ${JSON.stringify({fullCue,quarterCue})}`);
    const hushed=make(8),h=hushed.system;h.setLevels(0,1);h.startMusic('game');await h.trackLoad;window.clearInterval(h.trackTimer);
    ensure(metrics(await hushed.offline.startRendering(),1,7).peak<.000001,'music at zero is silent');
    ensure(h.levels.music===0 && h.levels.effects===1,'the levels read back');
    // The depot's distant sounds: each audible, quiet and clean, and the scheduler spaces them out.
    for(const kind of ['forklift','chime','clank']){
      const f=make(3);f.system.ambience(kind);
      const rendered=await f.offline.startRendering(),level=metrics(rendered);
      ensure(level.rms>.00005 && level.peak<.12,`ambience ${kind}: distant and clean: ${JSON.stringify(level)}`);
      ensure(metrics(rendered,2.6).peak<.000001,`ambience ${kind}: no hanging voice`);cues.push({effect:`ambience-${kind}`,...level});
    }
    // The results' fanfare for a promotion or medal, and its longer form for a new best: bright, clean and over in about a second.
    for(const best of [false,true]){
      const f=make(2);f.system.fanfare(best);
      const rendered=await f.offline.startRendering(),level=metrics(rendered);
      ensure(level.rms>.0005 && level.peak<.5,`fanfare${best?' for a best':''}: audible with headroom: ${JSON.stringify(level)}`);
      ensure(metrics(rendered,1.4).peak<.000001,`fanfare${best?' for a best':''}: no hanging voice`);cues.push({effect:best?'fanfare-best':'fanfare',...level});
    }
    const far=make(1).system;let seconds=0;
    while(seconds<60){far.updateAmbience(.1,true);seconds+=.1;}
    ensure(far.ambiencePlayed>=3 && far.ambiencePlayed<=6,`a distant sound every 11 to 19 seconds: ${far.ambiencePlayed} in a minute`);
    const before=far.ambiencePlayed;for(let i=0;i<600;i++)far.updateAmbience(.1,false);
    ensure(far.ambiencePlayed===before,'none while sorting is stopped');
    const mute=make(6),m=mute.system;m.startMusic('game');await m.trackLoad;window.clearInterval(m.trackTimer);
    // Advance the audio renderer itself before holding an in-progress gain ramp.
    // A future-only fake clock cannot report an AudioParam's live value correctly.
    const muted=mute.offline.suspend(2).then(async()=>{mute.clock.now=mute.offline.currentTime;m.setMuted(true);m.play('correct');m.lunchWhistle();await mute.offline.resume();});
    const unmuted=mute.offline.suspend(3).then(async()=>{mute.clock.now=mute.offline.currentTime;m.setMuted(false);m.play('correct');await mute.offline.resume();});
    const stopped=mute.offline.suspend(4).then(async()=>{mute.clock.now=mute.offline.currentTime;m.stopMusic();await mute.offline.resume();});
    const silent=await mute.offline.startRendering();await Promise.all([muted,unmuted,stopped]);
    ensure(metrics(silent,2.2,2.9).peak<.000001,`mute silences recording and all new cues: ${JSON.stringify(metrics(silent,2.2,2.9))}`);
    ensure(metrics(silent,3.2,3.9).rms>.001,'unmute resumes the recording');
    const idle=make(4);idle.system.setTruckIdle(true);idle.system.setTruckIdle(true);
    ensure(idle.system.idleSources.length===2,'one diesel bed, without duplicate sources');
    idle.clock.now=2;idle.system.stopMusic();ensure(idle.system.idleSources.length===0,'pause/lunch/replay stop the idle bed');
    const engine=await idle.offline.startRendering(),idleLevel=metrics(engine,1,1.9);
    ensure(idleLevel.rms>.0002&&idleLevel.rms<.004,`diesel idle stays audible and quiet below music: ${JSON.stringify(idleLevel)}`);ensure(metrics(engine,2.3).peak<.000001,'diesel fades to silence');
    const drive=make(5),d=drive.system;d.setDriving(0);const firstHum=d.drivingHum;d.setDriving(13.5);
    ensure(d.drivingHum===firstHum,'speed changes reuse one engine source');
    const driveMute=drive.offline.suspend(2).then(async()=>{drive.clock.now=drive.offline.currentTime;d.setMuted(true);d.drivingCue('collision');await drive.offline.resume();});
    const driveResume=drive.offline.suspend(3).then(async()=>{drive.clock.now=drive.offline.currentTime;d.setMuted(false);d.setDriving(8);await drive.offline.resume();});
    const driveStop=drive.offline.suspend(4).then(async()=>{drive.clock.now=drive.offline.currentTime;d.stopMusic();ensure(d.drivingHum===null,'pause/replay releases engine');await drive.offline.resume();});
    const road=await drive.offline.startRendering();await Promise.all([driveMute,driveResume,driveStop]);
    const driveLevel=metrics(road,1,1.9);ensure(driveLevel.rms>.0002&&driveLevel.rms<.02,'driving engine is quiet and audible');
    ensure(metrics(road,2.3,2.9).peak<.000001,'mute stops the driving engine and bump cue');
    ensure(metrics(road,3.3,3.9).rms>.0002,'unmute resumes a single engine');
    ensure(metrics(road,4.3).peak<.000001,'road engine stops without a hanging voice');
    return{duration:s.trackBuffer.duration,music:level,seam,cues,idle:idleLevel,driving:driveLevel};
  },depot);
  console.log(JSON.stringify(report));
  await page.route('**/audio/music/after-hours.mp3',route=>route.abort());
  const fallback=await page.evaluate(async compiled=>{const {DepotAudio}=await import(`data:text/javascript;base64,${btoa(compiled)}`);const s=new DepotAudio();s.startMusic('game');await s.trackLoad;s.stopMusic();return{recordings:s.recordings.size,timer:s.trackTimer,buffer:s.trackBuffer,oldTimer:s.musicTimer};},depot);
  assert.deepEqual(fallback,{recordings:0,timer:null,buffer:null,oldTimer:null});
  console.log('PASS actual lo-fi decode, crossfade, soft foley, belt hum and rattle, player music and effects levels, distant depot ambience, the results fanfare, driving engine/brake/bump headroom, mute/resume, pause/replay cleanup and failed-download fallback');
}finally{await browser.close();await server.httpServer.close();}
