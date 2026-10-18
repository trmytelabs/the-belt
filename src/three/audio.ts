import { AudioSystem, type MusicMode, type SoundEffect } from '../game/systems/AudioSystem';
export type { SoundEffect } from '../game/systems/AudioSystem';

export const DEPOT_MUSIC_URL = '/audio/music/after-hours.mp3';
const CROSSFADE_SECONDS = 1.6;

/** Recorded lo-fi and softer foley for the active 3D game. */
export class DepotAudio extends AudioSystem {
  private trackBuffer: AudioBuffer | null = null;
  private trackLoad: Promise<void> | null = null;
  private trackTimer: number | null = null;
  private trackWanted = false;
  private trackMode: MusicMode = 'title';
  private nextTrackAt = 0;
  private readonly recordings = new Map<AudioBufferSourceNode, GainNode>();
  private readonly foleyTimes = new Map<string, number>();
  private duckUntil = 0;
  private idleSources: AudioScheduledSourceNode[] = [];
  private idleGain: GainNode | null = null;

  public override async unlock(): Promise<void> {
    await super.unlock();
    this.scheduleTrack();
  }

  public override startMusic(mode: MusicMode): void {
    const context = this.getContext();
    if (!context) return;
    this.trackWanted = true;
    this.trackMode = mode;
    this.updateMusicVolume();
    if (this.trackTimer === null) this.trackTimer = window.setInterval(() => this.scheduleTrack(), 200);
    if (!this.trackLoad) {
      this.trackLoad = fetch(DEPOT_MUSIC_URL).then(async response => {
        if (!response.ok) throw new Error(`Music asset: ${response.status}`);
        this.trackBuffer = await context.decodeAudioData(await response.arrayBuffer());
        this.scheduleTrack();
      }).catch(() => {
        // A failed audio download never interrupts the game or starts the old score.
        this.trackLoad = null;
      });
    }
    this.scheduleTrack();
  }

  public override stopMusic(): void {
    this.trackWanted = false;
    if (this.trackTimer !== null) window.clearInterval(this.trackTimer);
    this.trackTimer = null;
    this.fade(this.musicGain, 0, 0.12);
    this.stopRecordings();
    this.setTruckIdle(false);
  }

  public override setMuted(muted: boolean): void {
    super.setMuted(muted);
    if (!muted) this.scheduleTrack();
  }

  protected override updateMusicVolume(): void {
    const volume = this.trackMode === 'title' || this.trackMode === 'results' ? 0.3 : 0.23;
    const ducked = (this.context?.currentTime ?? 0) < this.duckUntil;
    this.fade(this.musicGain, this.muted || !this.trackWanted ? 0 : volume * (ducked ? 0.45 : 1), 0.22);
  }

  private stopRecordings(): void {
    const now = this.context?.currentTime ?? 0;
    for (const [source, gain] of this.recordings) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.03);
      source.stop(now + 0.15);
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
    this.fade(gain, 0.03, 1.2);
    noise.start(); hum.start();
  }
}

export const audioSystem = new DepotAudio();
