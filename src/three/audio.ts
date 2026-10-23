import { AudioSystem, type MusicMode, type SoundEffect } from '../game/systems/AudioSystem';
export type { SoundEffect } from '../game/systems/AudioSystem';

/**
 * Where the build serves public/ from: assetBase.ts's base, written out here so this module loads on its own (the
 * audio checks run it alone in a page).
 */
const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
export const DEPOT_MUSIC_URL = `${BASE}audio/music/after-hours.mp3`;

/** Where the night is, for its music (`SCENE_MUSIC`). */
export type SceneMusic = 'depot' | 'rush' | 'home' | 'drive' | 'cafe' | 'lot' | 'mall' | 'ralph' | 'mesa' | 'dimsum' | 'dream';
/**
 * Each place and mini-game's track (public/audio/MUSIC-SOURCES.md), with a level that evens out how loud they were
 * recorded. The shift keeps the owner's After Hours; its last minute, the rush, has its own.
 */
export const SCENE_MUSIC: Record<SceneMusic, { file: string; level: number }> = {
  depot: { file: 'after-hours', level: 1 },
  rush: { file: 'machinations', level: 0.8 },
  home: { file: 'rollin-at-5', level: 0.85 },
  drive: { file: 'miami-nights', level: 0.75 },
  cafe: { file: 'lobby-time', level: 0.9 },
  lot: { file: 'sneaky-snitch', level: 0.85 },
  mall: { file: 'local-forecast-elevator', level: 0.9 },
  ralph: { file: 'surf-shimmy', level: 0.8 },
  mesa: { file: 'metalmania', level: 0.55 },
  dimsum: { file: 'guzheng-city', level: 0.95 },
  dream: { file: 'dreamy-flashback', level: 0.9 },
};
const sceneUrl = (scene: SceneMusic): string => `${BASE}audio/music/${SCENE_MUSIC[scene].file}.mp3`;
const CROSSFADE_SECONDS = 1.6;
type FoleyCue = { files: string[]; volume: number; cutoff?: number };
// Small CC0 recordings replace the old oscillator-based handling/UI effects.
const FOLEY: Partial<Record<SoundEffect | 'drive-collision', FoleyCue>> = {
  grab: { files: ['cloth1', 'cloth2', 'handleSmallLeather'], volume: 0.24 },
  dig: { files: ['cloth3', 'handleSmallLeather2'], volume: 0.26 },
  drop: { files: ['impactSoft_medium_000', 'impactSoft_medium_001', 'impactSoft_medium_002'], volume: 0.5, cutoff: 2800 },
  correct: { files: ['impactSoft_medium_001', 'impactSoft_medium_002', 'impactSoft_medium_000'], volume: 0.48, cutoff: 2800 },
  bulk: { files: ['impactWood_light_000', 'impactWood_light_001'], volume: 0.52, cutoff: 2200 },
  'pile-up': { files: ['impactSoft_medium_002', 'impactWood_light_001'], volume: 0.46, cutoff: 2400 },
  'package-spawn': { files: ['cloth1', 'cloth3'], volume: 0.045, cutoff: 2200 },
  throw: { files: ['knifeSlice'], volume: 0.25, cutoff: 3200 },
  smash: { files: ['impactGlass_light_000'], volume: 0.38, cutoff: 2800 },
  'drive-collision': { files: ['impactSoft_medium_000', 'impactMetal_light_000'], volume: 0.55, cutoff: 1700 },
  button: { files: ['metalClick'], volume: 0.22 },
  'belt-start': { files: ['metalLatch'], volume: 0.3, cutoff: 2600 },
  'belt-stop': { files: ['metalLatch'], volume: 0.28, cutoff: 2200 },
  gate: { files: ['metalLatch', 'doorClose_1'], volume: 0.28, cutoff: 2600 },
  switch: { files: ['click_001', 'click_002'], volume: 0.17 },
  'ui-start': { files: ['click_002'], volume: 0.22 },
  sign: { files: ['scratch_001', 'bookPlace1', 'bookPlace2'], volume: 0.25 },
  register: { files: ['handleCoins'], volume: 0.24, cutoff: 3200 },
  wrong: { files: ['error_001'], volume: 0.18, cutoff: 2000 },
  warning: { files: ['metalClick'], volume: 0.2, cutoff: 2400 },
  'event-alert': { files: ['confirmation_001'], volume: 0.18, cutoff: 3000 },
};

/** Recorded lo-fi and softer foley for the active 3D game. */
export class DepotAudio extends AudioSystem {
  private trackBuffer: AudioBuffer | null = null;
  private trackLoad: Promise<void> | null = null;
  private trackTimer: number | null = null;
  private trackWanted = false;
  private trackMode: MusicMode = 'title';
  private nextTrackAt = 0;
  /** The scene whose track is wanted, the one playing (or loading first), and each track once decoded. */
  private scene: SceneMusic = 'depot';
  private playing: SceneMusic = 'depot';
  private readonly tracks = new Map<SceneMusic, Promise<AudioBuffer | null>>();
  private readonly recordings = new Map<AudioBufferSourceNode, GainNode>();
  private readonly foleyTimes = new Map<string, number>();
  private duckUntil = 0;
  private idleSources: AudioScheduledSourceNode[] = [];
  private idleGain: GainNode | null = null;
  private drivingHum: AudioBufferSourceNode | null = null;
  private drivingGain: GainNode | null = null;
  private motorBuffer: AudioBuffer | null = null;
  private foleyLoad: Promise<void> | null = null;
  private readonly foleyBuffers = new Map<string, AudioBuffer>();
  private readonly foleyVoices = new Map<AudioBufferSourceNode, GainNode>();
  private readonly variations = new Map<string, number>();
  private stepIndex = 0;
  /** The conveyor: its motor, the roller rattle and the pulse that clacks the rattle, while the belt runs. */
  private belt: { motor: OscillatorNode; rollers: AudioBufferSourceNode; pulse: OscillatorNode; motorGain: GainNode; rattleGain: GainNode; pulseDepth: GainNode; nodes: AudioNode[] } | null = null;
  /** The player's music and effects levels, 0 to 1, from the settings. */
  private musicLevel = 1;
  private effectsLevel = 1;

  /** Sets the music and effects levels (0 to 1); mute still silences both. */
  public setLevels(music: number, effects: number): void {
    this.musicLevel = Math.min(1, Math.max(0, music));
    this.effectsLevel = Math.min(1, Math.max(0, effects));
    this.updateMusicVolume();
    this.fade(this.sfxGain, 0.85 * this.effectsLevel, 0.05);
  }

  public get levels(): { music: number; effects: number } { return { music: this.musicLevel, effects: this.effectsLevel }; }

  protected override getContext(): AudioContext | null {
    const fresh = this.context === null;
    const context = super.getContext();
    // The effects bus starts at the player's level, not the default.
    if (fresh && context && this.sfxGain) this.sfxGain.gain.value = 0.85 * this.effectsLevel;
    return context;
  }

  public override async unlock(): Promise<void> {
    await super.unlock();
    void this.preloadFoley();
    this.scheduleTrack();
  }

  /** Load while the briefing is visible; never replay stale events after a download. */
  public preloadFoley(): Promise<void> {
    const context = this.getContext();
    if (!context) return Promise.resolve();
    this.foleyLoad ??= Promise.all([...new Set(Object.values(FOLEY).flatMap(cue => cue.files))].map(async file => {
      try {
        const response = await fetch(`${BASE}audio/foley/${file}.ogg`);
        if (!response.ok) return;
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        let sum = 0, peak = 0, count = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) for (const value of buffer.getChannelData(channel)) {
          peak = Math.max(peak, Math.abs(value)); sum += value * value; count++;
        }
        const level = Math.min(0.85 / Math.max(peak, 0.001), 0.14 / Math.max(Math.sqrt(sum / Math.max(1, count)), 0.001));
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const data = buffer.getChannelData(channel);
          for (let i = 0; i < data.length; i++) data[i] *= level;
        }
        this.foleyBuffers.set(file, buffer);
      } catch { /* Quiet local synthesis remains available if an asset cannot decode. */ }
    })).then(() => undefined);
    return this.foleyLoad;
  }

  private stopFoley(): void {
    const now = this.context?.currentTime ?? 0;
    for (const [source, gain] of this.foleyVoices) {
      this.fade(gain, 0, 0.025); source.stop(now + 0.04);
    }
    this.foleyVoices.clear();
  }

  private sample(buffer: AudioBuffer, volume: number, rate: number, cutoff: number, delay = 0): void {
    const context = this.context;
    if (!context || !this.sfxGain) return;
    // Bound overlapping foley so a busy belt never drowns out the recording.
    if (this.foleyVoices.size >= 10) {
      const [source, gain] = this.foleyVoices.entries().next().value!;
      this.fade(gain, 0, 0.02); source.stop(context.currentTime + 0.03); this.foleyVoices.delete(source);
    }
    const source = context.createBufferSource(), gain = context.createGain(), filter = context.createBiquadFilter();
    const start = context.currentTime + 0.005 + delay, duration = Math.min(buffer.duration / rate, 1.4);
    source.buffer = buffer; source.playbackRate.value = rate;
    filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = 0.5;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.004);
    gain.gain.setValueAtTime(volume, start + Math.max(0.005, duration - 0.035));
    gain.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
    this.foleyVoices.set(source, gain);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.foleyVoices.delete(source); };
    source.start(start); source.stop(start + duration);
  }

  /**
   * A footstep in view: a short scuff with a knock under it, hollower on the
   * steel deck than on the concrete floor. `gain` is the distance fall-off from
   * the camera, so a crowd at the far end of the depot is a murmur.
   */
  public footstep(gain: number, surface: 'floor' | 'deck' = 'floor'): void {
    const context = this.getContext();
    if (!context || this.muted || gain <= 0.01) return;
    const now = context.currentTime + 0.004;
    const step = this.stepIndex++;
    const rate = 0.92 + (step % 5) * 0.04;
    const deck = surface === 'deck';
    this.noise(now, 0.055, (deck ? 520 : 380) * rate, 0.11 * gain);
    this.voice((deck ? 110 : 72) * rate, 0.08, now, (deck ? 0.045 : 0.03) * gain, { type: 'triangle', end: 38, cutoff: 320, attack: 0.004 });
  }

  /** Recorded handling foley heard from a distance (the crew's lifts and drops); `gain` is the distance fall-off. */
  public playNear(effect: 'grab' | 'drop', gain: number): void {
    if (!this.getContext() || this.muted || gain <= 0.01) return;
    this.recordedFoley(effect, gain);
  }

  private recordedFoley(effect: SoundEffect | 'drive-collision', gain = 1): boolean {
    const cue = FOLEY[effect];
    if (!cue) return false;
    const available = cue.files.filter(file => this.foleyBuffers.has(file));
    if (!available.length) return false;
    const index = this.variations.get(effect) ?? 0;
    this.variations.set(effect, index + 1);
    this.sample(this.foleyBuffers.get(available[index % available.length])!, cue.volume * gain, [0.97, 1.015, 1][index % 3], cue.cutoff ?? 4000);
    if (effect === 'correct' && this.foleyBuffers.has('click_002')) this.sample(this.foleyBuffers.get('click_002')!, 0.1, 1, 3000, 0.08);
    return true;
  }

  /** Combustion pulses and filtered road noise replace a pitched triangle drone. */
  private motor(): AudioBuffer {
    const context = this.context!;
    if (this.motorBuffer) return this.motorBuffer;
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate), data = buffer.getChannelData(0);
    let seed = 0x5482, smooth = 0;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 0x80000000 - 1, t = i / context.sampleRate;
      smooth = smooth * 0.94 + noise * 0.06;
      const pulse = Math.exp(-((t * 24) % 1) * 8);
      data[i] = smooth * (0.5 + pulse * 1.5) + Math.sin(t * Math.PI * 2 * 48) * pulse * 0.12;
    }
    this.motorBuffer = buffer; return buffer;
  }

  public override startMusic(mode: MusicMode): void {
    const context = this.getContext();
    if (!context) return;
    this.trackWanted = true;
    this.trackMode = mode;
    this.updateMusicVolume();
    if (this.trackTimer === null) this.trackTimer = window.setInterval(() => this.scheduleTrack(), 200);
    if (!this.trackLoad || this.playing !== this.scene) this.changeTrack();
    this.scheduleTrack();
  }

  /**
   * The music for where the night is now. A new place's track loads in the background while the old one plays on,
   * then the two cross: the old fades out over a second or so and the new one comes in.
   */
  public setScene(scene: SceneMusic): void {
    if (scene === this.scene) return;
    this.scene = scene;
    if (this.trackWanted) this.changeTrack();
  }

  /** Loads (once) and decodes a scene's track; a failed download is null and is tried again next time. */
  private loadTrack(scene: SceneMusic): Promise<AudioBuffer | null> {
    const context = this.getContext();
    if (!context) return Promise.resolve(null);
    let load = this.tracks.get(scene);
    if (!load) {
      load = fetch(sceneUrl(scene)).then(async response => {
        if (!response.ok) throw new Error(`Music asset: ${response.status}`);
        return context.decodeAudioData(await response.arrayBuffer());
      }).catch(() => {
        // A failed audio download never interrupts the game or starts the old score.
        this.tracks.delete(scene);
        return null;
      });
      this.tracks.set(scene, load);
    }
    return load;
  }

  /** Brings in the wanted scene's track once it has loaded, crossing from the one playing. */
  private changeTrack(): void {
    const scene = this.scene;
    this.trackLoad = this.loadTrack(scene).then(buffer => {
      if (!buffer) {
        if (this.scene === scene) this.trackLoad = null;
        return;
      }
      if (this.scene !== scene || (this.playing === scene && this.trackBuffer === buffer)) return;
      const crossing = this.trackBuffer !== null;
      this.playing = scene;
      this.trackBuffer = buffer;
      if (crossing) this.stopRecordings(0.45);
      this.updateMusicVolume();
      this.scheduleTrack();
    });
  }

  public override stopMusic(): void {
    this.trackWanted = false;
    if (this.trackTimer !== null) window.clearInterval(this.trackTimer);
    this.trackTimer = null;
    this.fade(this.musicGain, 0, 0.12);
    this.stopRecordings();
    this.setTruckIdle(false);
    this.setRoomTone(null, 0);
    this.setDriving(null);
    this.setBelt(null);
    this.stopFoley();
  }

  public override setMuted(muted: boolean): void {
    super.setMuted(muted);
    if (muted) this.setRoomTone(null, 0);
    if (muted) this.setDriving(null);
    if (muted) this.setBelt(null);
    if (muted) this.stopFoley();
    if (!muted) this.scheduleTrack();
  }

  /** A quiet speed-dependent diesel layer, owned only by the playable road. */
  public setDriving(speed: number | null): void {
    if (speed === null || this.muted) {
      if (this.drivingHum) {
        this.fade(this.drivingGain, 0, 0.08);
        this.drivingHum.stop((this.context?.currentTime ?? 0) + 0.12);
        this.drivingHum = null; this.drivingGain = null;
      }
      return;
    }
    const context = this.getContext();
    if (!context || context.state !== 'running' || !this.sfxGain) return;
    if (!this.drivingHum) {
      const hum = context.createBufferSource(), gain = context.createGain();
      hum.buffer = this.motor(); hum.loop = true; gain.gain.value = 0;
      hum.connect(gain); gain.connect(this.sfxGain);
      hum.onended = () => { hum.disconnect(); gain.disconnect(); };
      hum.start(); this.drivingHum = hum; this.drivingGain = gain;
    }
    this.drivingHum.playbackRate.setTargetAtTime(0.75 + Math.max(0, speed) / 20, context.currentTime, 0.2);
    this.fade(this.drivingGain, 0.055 + Math.min(13.5, speed) * 0.003, 0.16);
  }

  public drivingCue(kind: 'brake' | 'collision'): void {
    const context = this.getContext();
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime;
    if (now - (this.foleyTimes.get(`drive-${kind}`) ?? -Infinity) < (kind === 'brake' ? 0.9 : 0.3)) return;
    this.foleyTimes.set(`drive-${kind}`, now);
    if (kind === 'brake') {
      this.noise(now + 0.005, 0.25, 1200, 0.065);
    } else {
      if (this.recordedFoley('drive-collision')) return;
      this.voice(82, 0.2, now + 0.005, 0.12, { end: 40, cutoff: 320 });
      this.noise(now + 0.01, 0.15, 650, 0.1);
    }
  }

  protected override updateMusicVolume(): void {
    const volume = (this.trackMode === 'title' || this.trackMode === 'results' ? 0.3 : 0.23) * SCENE_MUSIC[this.playing].level;
    const ducked = (this.context?.currentTime ?? 0) < this.duckUntil;
    this.fade(this.musicGain, this.muted || !this.trackWanted ? 0 : volume * (ducked ? 0.45 : 1) * this.musicLevel, 0.22);
  }

  /** Fades every recording out (over `fade` seconds' time constant: quick to stop, slower to cross to another track). */
  private stopRecordings(fade = 0.03): void {
    const now = this.context?.currentTime ?? 0;
    for (const [source, gain] of this.recordings) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, fade);
      source.stop(now + fade * 5);
    }
    this.recordings.clear();
    this.nextTrackAt = 0;
  }

  private scheduleTrack(): void {
    const context = this.context, buffer = this.trackBuffer;
    if (!this.trackWanted || this.muted || !buffer || !this.musicGain || context?.state !== 'running') return;
    this.updateMusicVolume();
    if (this.nextTrackAt > context.currentTime + 0.5) return;
    // Resume from now after a suspended tab; never queue missed loops in a burst.
    const start = Math.max(context.currentTime + 0.03, this.nextTrackAt);
    const source = context.createBufferSource(), gain = context.createGain();
    const duration = buffer.duration;
    const overlap = Math.min(CROSSFADE_SECONDS, duration / 4);
    source.buffer = buffer;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(1, start + overlap);
    gain.gain.setValueAtTime(1, start + duration - overlap);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(gain); gain.connect(this.musicGain);
    this.recordings.set(source, gain);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.recordings.delete(source); };
    source.start(start); source.stop(start + duration);
    this.nextTrackAt = start + duration - overlap;
  }

  public override play(effect: SoundEffect): void {
    const context = this.getContext();
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime;
    if (effect === 'npc-talk') {
      this.duckUntil = now + 1.7;
      this.updateMusicVolume();
      return;
    }
    const cooldown = effect === 'warning' ? 0.7 : effect === 'event-alert' ? 0.4 : 0.12;
    if (now - (this.foleyTimes.get(effect) ?? -Infinity) < cooldown) return;
    if (this.recordedFoley(effect)) { this.foleyTimes.set(effect, now); return; }
    if (effect === 'engine' || effect === 'truck') {
      this.foleyTimes.set(effect, now); this.sample(this.motor(), 0.16, effect === 'engine' ? 0.7 : 0.95, 700); return;
    }
    if (!['grab', 'drop', 'correct', 'wrong', 'package-spawn', 'dig'].includes(effect)) { super.play(effect); return; }
    if (now - (this.foleyTimes.get(effect) ?? -Infinity) < 0.12) return;
    this.foleyTimes.set(effect, now);
    const t = now + 0.005;
    if (effect === 'grab' || effect === 'dig') {
      this.noise(t, 0.17, 850, 0.13);
      this.noise(t + 0.035, 0.12, 1600, 0.045);
      this.voice(105, 0.09, t, 0.055, { end: 75, cutoff: 450 });
    } else if (effect === 'drop' || effect === 'correct') {
      this.voice(95, 0.19, t, 0.16, { end: 48, cutoff: 350 });
      this.noise(t + 0.008, 0.17, 430, 0.18);
      this.noise(t + 0.035, 0.1, 1400, 0.045);
      if (effect === 'correct') this.voice(980, 0.06, t + 0.08, 0.035, { attack: 0.012, cutoff: 1600 });
    } else if (effect === 'wrong') {
      this.voice(145, 0.09, t, 0.085, { end: 105, cutoff: 450 });
      this.voice(130, 0.12, t + 0.13, 0.07, { end: 85, cutoff: 450 });
      this.noise(t, 0.1, 750, 0.055);
    } else {
      this.noise(t, 0.1, 530, 0.06);
      this.voice(90, 0.08, t, 0.035, { end: 65, cutoff: 300 });
    }
  }

  /** Two breathy blasts announce lunch; this never depends on a network sound file. */
  public lunchWhistle(): void {
    const context = this.getContext();
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime + 0.01;
    for (const offset of [0, 0.86]) {
      this.voice(2180, 0.64, now + offset, 0.095, { end: 2100, attack: 0.06, cutoff: 3100 });
      this.voice(2750, 0.57, now + offset + 0.035, 0.032, { end: 2680, attack: 0.055, cutoff: 3400 });
      this.noise(now + offset, 0.62, 2500, 0.07);
    }
  }

  /** A rush wave's siren: two rising and falling wails, about two seconds; synthesised, like the whistle. */
  public rushSiren(): void {
    const context = this.getContext();
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime + 0.01;
    for (const offset of [0, 1]) {
      this.voice(560, 0.5, now + offset, 0.08, { type: 'triangle', end: 940, attack: 0.04, cutoff: 2400 });
      this.voice(940, 0.46, now + offset + 0.5, 0.08, { type: 'triangle', end: 560, attack: 0.02, cutoff: 2400 });
    }
  }

  /**
   * The conveyor while it runs: a low motor hum whose pitch follows the belt's speed,
   * and a band of roller rattle that clacks at the rollers' rate and grows with the
   * freight riding it. `speed` is the belt's speed in depot pixels per second (50 at
   * the start of a shift), null or 0 when it stands; `load` the parcels on it.
   */
  public setBelt(speed: number | null, load = 0): void {
    if (!speed || speed <= 0 || this.muted) {
      if (this.belt) {
        const { motor, rollers, pulse, motorGain, rattleGain } = this.belt;
        const now = this.context?.currentTime ?? 0;
        this.fade(motorGain, 0, 0.1);
        this.fade(rattleGain, 0, 0.08);
        for (const source of [motor, rollers, pulse]) source.stop(now + 0.45);
        this.belt = null;
      }
      return;
    }
    const context = this.getContext();
    if (!context || context.state !== 'running' || !this.sfxGain || !this.noiseBuffer) return;
    if (!this.belt) {
      const motor = context.createOscillator(), motorFilter = context.createBiquadFilter(), motorGain = context.createGain();
      motor.type = 'sawtooth'; motor.frequency.value = 50;
      motorFilter.type = 'lowpass'; motorFilter.frequency.value = 240; motorFilter.Q.value = 0.7;
      motorGain.gain.value = 0;
      motor.connect(motorFilter); motorFilter.connect(motorGain); motorGain.connect(this.sfxGain);
      const rollers = context.createBufferSource(), rollerFilter = context.createBiquadFilter(), rattleGain = context.createGain(), clack = context.createGain();
      rollers.buffer = this.noiseBuffer; rollers.loop = true;
      // A low roll under the motor. A band of hiss around 1.1 kHz, swelling with the sway below, was the constant
      // whooshing the owner heard while the belt ran.
      rollerFilter.type = 'lowpass'; rollerFilter.frequency.value = 340; rollerFilter.Q.value = 0.5;
      rattleGain.gain.value = 0;
      // The rollers' sway: a gentle sine lifts and lowers the rattle. A square wave here clacked it on and off six to
      // nine times a second, which the owner heard as a constant drum beat under everything.
      clack.gain.value = 0.5;
      const pulse = context.createOscillator(), pulseDepth = context.createGain();
      pulse.type = 'sine'; pulse.frequency.value = 2.5;
      pulseDepth.gain.value = 0.04;
      pulse.connect(pulseDepth); pulseDepth.connect(clack.gain);
      rollers.connect(rollerFilter); rollerFilter.connect(clack); clack.connect(rattleGain); rattleGain.connect(this.sfxGain);
      const nodes = [motorFilter, motorGain, rollerFilter, clack, rattleGain, pulseDepth];
      let remaining = 3;
      const cleanup = () => { if (--remaining === 0) for (const node of nodes) node.disconnect(); };
      for (const source of [motor, rollers, pulse]) source.onended = () => { source.disconnect(); cleanup(); };
      motor.start(); rollers.start(); pulse.start();
      this.belt = { motor, rollers, pulse, motorGain, rattleGain, pulseDepth, nodes };
    }
    const rate = Math.min(2.5, speed / 50);
    const now = context.currentTime;
    this.belt.motor.frequency.setTargetAtTime(44 + 22 * rate, now, 0.25);
    this.belt.pulse.frequency.setTargetAtTime(2 + rate, now, 0.25);
    // Background machinery, under the foley and the music: quieter than it first shipped.
    this.fade(this.belt.motorGain, 0.007 + 0.004 * Math.min(1.5, rate), 0.25);
    this.fade(this.belt.rattleGain, (0.005 + 0.009 * Math.min(6, load)) * Math.min(1.4, rate), 0.2);
  }

  /** The depot's distant sounds: a forklift backing up, the PA chime, a pallet set down. */
  public static readonly AMBIENCE = ['forklift', 'chime', 'clank'] as const;
  /** Seconds until the next distant sound, and how many have played. */
  private ambienceIn = 6;
  private ambienceIndex = 0;
  public ambiencePlayed = 0;

  /**
   * While sorting goes on, a distant depot sound every 11 to 19 seconds, in a
   * shuffled but fixed order so no two in a row are the same. `dt` is in seconds.
   */
  public updateAmbience(dt: number, active: boolean): void {
    if (!active || this.muted || !(dt > 0)) return;
    this.ambienceIn -= dt;
    if (this.ambienceIn > 0) return;
    const order = [0, 2, 1, 0, 1, 2, 2, 0, 1];
    this.ambience(DepotAudio.AMBIENCE[order[this.ambienceIndex % order.length]]);
    this.ambienceIndex += 1;
    this.ambienceIn = 11 + (this.ambienceIndex * 5) % 9;
  }

  /**
   * The results' short rising chime for a promotion or a new medal; `best`, for a
   * new personal best, climbs one note higher. Over in about a second.
   */
  public fanfare(best = false): void {
    const context = this.getContext();
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime + 0.05;
    const notes = best ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    notes.forEach((frequency, index) => {
      const last = index === notes.length - 1;
      this.voice(frequency, last ? 0.65 : 0.16, now + index * 0.11, last ? 0.12 : 0.09, { type: 'triangle', attack: 0.01, cutoff: 3200 });
    });
  }

  /** One distant depot sound: quiet and low-passed, as if from the far end of the building. */
  public ambience(kind: (typeof DepotAudio.AMBIENCE)[number]): void {
    const context = this.getContext();
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime + 0.02;
    this.ambiencePlayed += 1;
    if (kind === 'forklift') {
      // A reversing beeper, four beeps.
      for (let beep = 0; beep < 4; beep += 1) this.voice(1120, 0.2, now + beep * 0.42, 0.016, { type: 'triangle', attack: 0.01, cutoff: 1500 });
    } else if (kind === 'chime') {
      // The PA's two-tone chime before an announcement nobody can make out.
      this.voice(784, 0.62, now, 0.022, { attack: 0.02, cutoff: 2000 });
      this.voice(659, 0.9, now + 0.5, 0.022, { attack: 0.02, cutoff: 2000 });
    } else {
      // A pallet set down somewhere: a dull knock and a short rattle.
      this.voice(118, 0.22, now, 0.05, { end: 70, cutoff: 420 });
      this.noise(now + 0.01, 0.16, 700, 0.03);
    }
  }

  /** Low, continuous diesel rumble, stopped with pause, lunch, results and replay. */
  public setTruckIdle(running: boolean): void {
    if (!running) {
      if (!this.idleSources.length) return;
      const now = this.context?.currentTime ?? 0;
      const gain = this.idleGain;
      this.fade(gain, 0, 0.12);
      for (const source of this.idleSources) source.stop(now + 0.15);
      this.idleSources = []; this.idleGain = null;
      return;
    }
    if (this.idleSources.length || this.muted) return;
    const context = this.getContext();
    if (!context || context.state !== 'running' || !this.sfxGain || !this.noiseBuffer) return;
    const gain = context.createGain(), filter = context.createBiquadFilter(), humLevel = context.createGain();
    gain.gain.value = 0; filter.type = 'lowpass'; filter.frequency.value = 185;
    const noise = context.createBufferSource(); noise.buffer = this.noiseBuffer; noise.loop = true;
    const hum = context.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 49;
    humLevel.gain.value = 0.22;
    noise.connect(filter); hum.connect(humLevel); humLevel.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
    let remaining = 2;
    const cleanup = () => { if (--remaining === 0) { humLevel.disconnect(); filter.disconnect(); gain.disconnect(); } };
    noise.onended = () => { noise.disconnect(); cleanup(); };
    hum.onended = () => { hum.disconnect(); cleanup(); };
    this.idleGain = gain; this.idleSources = [noise, hum];
    this.fade(gain, 0.024, 1.2);
    noise.start(); hum.start();
  }

  /** The story set's room tone now playing, its sources and level, and the time to the next clink. */
  private roomKind: RoomTone | null = null;
  private roomSources: AudioScheduledSourceNode[] = [];
  private roomGain: GainNode | null = null;
  private roomClink = 1;

  /**
   * A story set's room tone, called every frame (`dt` in seconds): `restaurant`, a low murmur of talk that swells and
   * ebbs with porcelain clinking now and then (Cha for Tea, the Tim Hortons booth); `outdoors`, a night wind in
   * slow gusts (the lot, the road); null for silence. Changing kind crossfades.
   */
  public setRoomTone(kind: RoomTone | null, dt: number): void {
    if (this.muted) kind = null;
    if (kind !== this.roomKind) {
      if (this.roomGain) {
        const now = this.context?.currentTime ?? 0;
        this.fade(this.roomGain, 0, 0.25);
        for (const source of this.roomSources) source.stop(now + 1);
      }
      this.roomSources = []; this.roomGain = null; this.roomKind = null;
      if (kind && this.startRoomTone(kind)) this.roomKind = kind;
      return;
    }
    if (kind !== 'restaurant' || !(dt > 0)) return;
    this.roomClink -= dt;
    if (this.roomClink > 0) return;
    this.roomClink = 1.1 + Math.random() * 2.6;
    const context = this.getContext();
    if (!context || context.state !== 'running') return;
    // A cup on a saucer or chopsticks on a bowl: two quick, high, quiet pings.
    const now = context.currentTime + 0.01, pitch = 2300 + Math.random() * 1100;
    this.voice(pitch, 0.08, now, 0.009, { attack: 0.002, cutoff: 6000 });
    this.voice(pitch * 1.34, 0.06, now + 0.05 + Math.random() * 0.05, 0.006, { attack: 0.002, cutoff: 6000 });
  }

  private startRoomTone(kind: RoomTone): boolean {
    const context = this.getContext();
    if (!context || context.state !== 'running' || !this.sfxGain || !this.noiseBuffer) return false;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(this.sfxGain);
    // Talk: two bands of noise; wind: one low band. A slow wobble on the level makes it swell and ebb (or gust).
    const bands = kind === 'restaurant' ? [[420, 0.8, 0.05], [1050, 1.1, 0.022]] : [[260, 0.5, 0.06]];
    const sources: AudioScheduledSourceNode[] = [];
    for (const [frequency, q, level] of bands) {
      const noise = context.createBufferSource(), filter = context.createBiquadFilter(), band = context.createGain();
      noise.buffer = this.noiseBuffer; noise.loop = true;
      noise.loopStart = Math.random(); noise.loopEnd = this.noiseBuffer.duration;
      filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = q;
      band.gain.value = level;
      noise.connect(filter); filter.connect(band); band.connect(gain);
      const wobble = context.createOscillator(), depth = context.createGain();
      wobble.frequency.value = kind === 'restaurant' ? 0.21 + Math.random() * 0.1 : 0.09;
      depth.gain.value = level * (kind === 'restaurant' ? 0.35 : 0.7);
      wobble.connect(depth); depth.connect(band.gain);
      noise.onended = () => { noise.disconnect(); filter.disconnect(); band.disconnect(); };
      wobble.onended = () => { wobble.disconnect(); depth.disconnect(); };
      noise.start(); wobble.start();
      sources.push(noise, wobble);
    }
    let remaining = sources.length;
    for (const source of sources) {
      const ended = source.onended;
      source.onended = (event) => { ended?.call(source, event); if (--remaining === 0) gain.disconnect(); };
    }
    this.roomSources = sources; this.roomGain = gain;
    this.fade(gain, 1, 0.6);
    this.roomClink = 0.8;
    return true;
  }
}

/** A story set's room tone (DepotAudio.setRoomTone). */
export type RoomTone = 'restaurant' | 'outdoors';

export const audioSystem = new DepotAudio();
