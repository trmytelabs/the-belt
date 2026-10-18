import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
import { chromium } from 'playwright';

// Render the actual audio implementation through Chromium's Web Audio engine.
// A clock proxy only schedules offline events; no sound-generation code is
// duplicated here. Exported WAVs are optional local review artifacts, not assets.
const source = await readFile(new URL('../src/game/systems/AudioSystem.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
// Extract only the public SoundEffect union; music modes overlap two cue names.
const effectNames = [...source.slice(source.indexOf('export type SoundEffect'), source.indexOf('type AudioWindow')).matchAll(/'([^']+)'/g)].map(match => match[1]);
// The original 24 cues plus the overnight story's engine, cough, throw, smash, sign, horn, gate, register and splash.
assert.equal(effectNames.length, 33);
const browser = await chromium.launch({ headless: true,
  ...(process.env.BELT_BROWSER_EXECUTABLE ? { executablePath: process.env.BELT_BROWSER_EXECUTABLE } : { channel: 'chromium' }),
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const report = await page.evaluate(async ({ compiled, effectNames, exportAudition }) => {
    const module = await import(`data:text/javascript;base64,${btoa(compiled)}`);
    const System = module.audioSystem.constructor;
    const sampleRate = 44100;
    const ensure = (condition, message) => { if (!condition) throw new Error(message); };
    const fixtures = [];
    const make = duration => {
      const offline = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);
      const clock = { now: 0, state: 'running' };
      const allocations = { oscillators: 0, sources: 0, buffers: 0 };
      const context = new Proxy(offline, { get(target, property) {
        if (property === 'currentTime') return clock.now;
        if (property === 'state') return clock.state;
        if (property === 'resume') return () => Promise.resolve();
        const value = Reflect.get(target, property, target);
        const allocation = { createOscillator: 'oscillators', createBufferSource: 'sources', createBuffer: 'buffers' }[property];
        if (allocation) return (...args) => { allocations[allocation] += 1; return value.apply(target, args); };
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      window.AudioContext = function () { return context; };
      const system = new System();
      system.getContext();
      const fixture = { offline, clock, system, allocations };
      fixtures.push(fixture);
      return fixture;
    };
    const metrics = (data, from = 0, to = data.length / sampleRate) => {
      let peak = 0, energy = 0, slope = 0, finite = true;
      const start = Math.floor(from * sampleRate), end = Math.min(data.length, Math.floor(to * sampleRate));
      for (let index = start; index < end; index++) {
        const value = data[index];
        finite &&= Number.isFinite(value);
        peak = Math.max(peak, Math.abs(value));
        energy += value * value;
        if (index > start) slope = Math.max(slope, Math.abs(value - data[index - 1]));
      }
      return { peak, rms: Math.sqrt(energy / Math.max(1, end - start)), slope, finite };
    };
    const cueMetrics = [];
    for (const effect of effectNames) {
      const { system, offline } = make(2);
      const noise = system.noiseBuffer;
      system.play(effect);
      ensure(system.noiseBuffer === noise, `${effect} must reuse the shared noise buffer`);
      const buffer = await offline.startRendering();
      const data = buffer.getChannelData(0);
      const measured = metrics(data);
      ensure(measured.finite && measured.peak < 0.65, `${effect} must be finite with substantial headroom: ${JSON.stringify(measured)}`);
      ensure(measured.rms > 0.00015, `${effect} must contain audible signal, not a silent placeholder`);
      ensure(measured.slope < 0.06, `${effect} must not introduce an abrupt full-scale transient`);
      ensure(metrics(data, 1.7).peak < 0.000001, `${effect} must finish cleanly without a hanging voice`);
      cueMetrics.push({ effect, ...measured });
    }

    const stress = make(2);
    effectNames.forEach(effect => stress.system.play(effect));
    const firstAllocation = JSON.stringify(stress.allocations);
    for (let repeat = 0; repeat < 50; repeat++) effectNames.forEach(effect => stress.system.play(effect));
    ensure(JSON.stringify(stress.allocations) === firstAllocation, 'same-frame spam must not allocate duplicate voices');
    ensure(stress.allocations.buffers === 1, 'all noise layers must share one cached buffer');
    const stressMetrics = metrics((await stress.offline.startRendering()).getChannelData(0));
    ensure(stress.system.lastPlayed.size === effectNames.length && stressMetrics.peak < 0.85 && stressMetrics.finite,
      `a simultaneous event burst must retain headroom: ${JSON.stringify(stressMetrics)}`);

    const musicMetrics = [];
    for (const mode of ['title', 'game', 'danger', 'results']) {
      const fixture = make(7);
      fixture.system.startMusic(mode);
      window.clearInterval(fixture.system.musicTimer);
      for (let now = 0; now < 5; now += 0.05) { fixture.clock.now = now; fixture.system.scheduleMusic(); }
      fixture.clock.now = 5;
      fixture.system.stopMusic();
      const data = (await fixture.offline.startRendering()).getChannelData(0);
      const measured = metrics(data, 0.15, 4.9);
      ensure(measured.finite && measured.rms > 0.001 && measured.peak < 0.2, `${mode} score must be present and restrained: ${JSON.stringify(measured)}`);
      ensure(metrics(data, 5.2).peak < 0.000001, `${mode} music must fade and stop, including scheduled notes`);
      musicMetrics.push({ mode, ...measured });
    }

    const muted = make(3);
    muted.system.startMusic('game');
    window.clearInterval(muted.system.musicTimer);
    for (let now = 0; now < 0.8; now += 0.05) { muted.clock.now = now; muted.system.scheduleMusic(); }
    muted.clock.now = 0.8;
    muted.system.setMuted(true);
    effectNames.forEach(effect => muted.system.play(effect));
    muted.clock.now = 1.8;
    muted.system.setMuted(false);
    muted.system.play('correct');
    const muteData = (await muted.offline.startRendering()).getChannelData(0);
    ensure(metrics(muteData, 0.95, 1.75).peak < 0.000001, 'mute must silence existing voices and suppress new cues');
    ensure(metrics(muteData, 1.85, 2.3).rms > 0.001, 'unmute must restore sound without needing a new AudioContext');

    // Real scheduler, synthetic context clock: a long stalled tab must schedule
    // only the next beat, never catch up an entire minute at once.
    const stalled = make(1);
    stalled.system.startMusic('game');
    window.clearInterval(stalled.system.musicTimer);
    const notes = [];
    stalled.system.playMusicStep = (step, time) => notes.push({ step, time });
    stalled.system.scheduleMusic();
    const firstCount = notes.length;
    stalled.clock.now = 120;
    stalled.system.scheduleMusic();
    const afterStall = notes.slice(firstCount);
    ensure(afterStall.length > 0 && afterStall.length <= 2 && afterStall.every(note => note.time >= 120),
      'a stalled tab must not schedule notes in the past or create a catch-up burst');
    stalled.clock.state = 'suspended';
    stalled.clock.now = 240;
    const beforePause = notes.length;
    stalled.system.scheduleMusic();
    ensure(notes.length === beforePause, 'a suspended context must not accumulate scheduled notes');
    stalled.clock.state = 'running';
    stalled.system.scheduleMusic();
    ensure(notes.slice(beforePause).every(note => note.time >= 240), 'context resume must reset the music clock');
    stalled.system.stopMusic();
    const beforeStop = notes.length;
    stalled.system.scheduleMusic();
    ensure(notes.length === beforeStop && stalled.system.musicTimer === null, 'stopping must cancel the scheduler');

    let audition = null;
    if (exportAudition) {
      const fixture = make(21);
      fixture.system.startMusic('game');
      window.clearInterval(fixture.system.musicTimer);
      const events = [[1, 'grab'], [1.6, 'drop'], [2.5, 'grab'], [3.15, 'correct'], [4.2, 'switch'], [5.1, 'bulk'],
        [6.1, 'belt-stop'], [7.1, 'belt-start'], [8.3, 'wrong'], [9.4, 'missed'], [10.5, 'warning'], [11.7, 'truck'],
        [13, 'gunshot'], [13.26, 'gunshot'], [13.68, 'gunshot'], [14, 'gunshot'], [14.52, 'gunshot'],
        [15.6, 'npc-talk'], [16.4, 'correct'], [17.7, 'shift-end']];
      for (let now = 0; now < 19; now += 0.025) {
        fixture.clock.now = now;
        fixture.system.scheduleMusic();
        while (events.length && events[0][0] <= now) fixture.system.play(events.shift()[1]);
      }
      fixture.clock.now = 19;
      fixture.system.stopMusic();
      const data = (await fixture.offline.startRendering()).getChannelData(0);
      const bytes = new Uint8Array(44 + data.length * 2);
      const view = new DataView(bytes.buffer);
      const text = (offset, value) => { for (let index = 0; index < value.length; index++) bytes[offset + index] = value.charCodeAt(index); };
      text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, data.length * 2, true);
      for (let index = 0; index < data.length; index++) view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, data[index])) * 32767), true);
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      audition = btoa(binary);
    }
    fixtures.forEach(({ system }) => { if (system.musicTimer !== null) window.clearInterval(system.musicTimer); });
    return { cueMetrics, stressMetrics, musicMetrics, audition };
  }, { compiled, effectNames, exportAudition: Boolean(process.env.BELT_AUDIO_OUTPUT_DIR) });
  assert.deepEqual(errors, []);
  if (report.audition) {
    const path = join(process.env.BELT_AUDIO_OUTPUT_DIR, 'warehouse-audio-audition.wav');
    await writeFile(path, Buffer.from(report.audition, 'base64'));
    console.log(`WAV audition: ${path}`);
  }
  console.log(JSON.stringify({ cues: report.cueMetrics.map(({ effect, peak, rms }) => ({ effect, peak: +peak.toFixed(4), rms: +rms.toFixed(5) })),
    stressPeak: report.stressMetrics.peak, music: report.musicMetrics.map(({ mode, peak, rms }) => ({ mode, peak, rms })) }, null, 2));
  console.log(`PASS all ${effectNames.length} cue renders, 4 music modes, finite output/headroom/energy, quiet tails, overlapping event stress, reused noise, mute/unmute and pause/stall scheduling. Physical listening remains a manual check.`);
} finally {
  await browser.close();
}
