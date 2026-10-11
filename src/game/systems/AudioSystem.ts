type MusicMode = 'title' | 'game' | 'danger' | 'results';

export type SoundEffect =
  | 'belt-start' | 'belt-stop' | 'bulk' | 'button' | 'correct'
  | 'countdown' | 'countdown-go' | 'dig' | 'drop' | 'event-alert'
  | 'game-over' | 'grab' | 'gunshot' | 'missed' | 'npc-talk'
  | 'package-spawn' | 'pile-up' | 'results' | 'shift-end'
  | 'switch' | 'truck' | 'ui-start' | 'warning' | 'wrong';

type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
type VoiceOptions = { type?: 'sine' | 'triangle'; end?: number; attack?: number; cutoff?: number; music?: boolean };
const MUSIC_BPM: Record<MusicMode, number> = { title: 70, game: 82, danger: 94, results: 76 };
const COOLDOWN: Partial<Record<SoundEffect, number>> = {
  'npc-talk': 0.24, 'package-spawn': 0.1, warning: 0.75, truck: 0.6,
  correct: 0.09, wrong: 0.15, 'pile-up': 0.25, gunshot: 0.065,
};

/** Editable, original Web Audio foley and a restrained warehouse score.
 * No samples, purchased assets or external music. Noise has its own fixed seed,
 * so rendering sound never consumes gameplay's random rolls. */
class AudioSystem {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private noiseOffset = 0;
  private readonly musicVoices = new Set<AudioScheduledSourceNode>();
  private readonly lastPlayed = new Map<SoundEffect, number>();
  private musicTimer: number | null = null;
  private musicMode: MusicMode = 'title';
  private nextStepTime = 0;
  private musicStep = 0;
  private muted = false;
  private unlockListenersInstalled = false;

  public installUnlockListeners(): void {
    if (typeof window === 'undefined' || this.unlockListenersInstalled) return;
    this.unlockListenersInstalled = true;
    const unlock = () => { void this.unlock(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  public async unlock(): Promise<void> {
    const context = this.getContext();
    if (context?.state === 'suspended') await context.resume().catch(() => undefined);
  }

  public startMusic(mode: MusicMode): void {
    const context = this.getContext();
    if (!context || (this.musicTimer !== null && mode === this.musicMode)) return;
    this.stopMusic();
    this.musicMode = mode;
    this.nextStepTime = context.currentTime + 0.06;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
    this.updateMusicVolume();
  }

  public stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.fade(this.musicGain, 0, 0.055);
    const stop = (this.context?.currentTime ?? 0) + 0.06;
    for (const source of this.musicVoices) source.stop(stop);
    this.musicVoices.clear();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.fade(this.masterGain, muted ? 0 : 0.72, 0.035);
    this.updateMusicVolume();
    if (this.context) this.nextStepTime = this.context.currentTime + 0.06;
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public play(effect: SoundEffect): void {
    const context = this.getContext();
    if (!context || this.muted) return;
    void this.unlock();
    const now = context.currentTime + 0.004;
    if (now - (this.lastPlayed.get(effect) ?? -Infinity) < (COOLDOWN[effect] ?? 0.045)) return;
    this.lastPlayed.set(effect, now);
    switch (effect) {
      case 'belt-start':
        this.voice(92, 0.34, now, 0.12, { type: 'triangle', end: 138, cutoff: 460, attack: 0.035 });
        this.noise(now + 0.03, 0.2, 520, 0.12);
        this.latch(now + 0.015, 0.7);
        break;
      case 'belt-stop':
        this.voice(138, 0.3, now, 0.13, { type: 'triangle', end: 68, cutoff: 490, attack: 0.02 });
        this.noise(now, 0.21, 760, 0.11);
        this.latch(now + 0.18, 0.85);
        break;
      case 'bulk':
        this.cushion(now, 102, 0.23, 0.26);
        this.noise(now + 0.028, 0.22, 480, 0.23);
        this.voice(210, 0.13, now + 0.02, 0.045, { end: 178 });
        break;
      case 'button': this.latch(now, 0.7); break;
      case 'correct':
        this.cushion(now, 148, 0.075, 0.11);
        this.bell(now + 0.035, 523.25, 0.13, 0.32);
        this.bell(now + 0.1, 784.88, 0.045, 0.24);
        break;
      case 'countdown': this.bell(now, 392, 0.1, 0.18); break;
      case 'countdown-go':
        this.cushion(now, 135, 0.09);
        this.bell(now, 392, 0.09, 0.28);
        this.bell(now + 0.1, 523.25, 0.12, 0.4);
        break;
      case 'dig':
        this.noise(now, 0.15, 670, 0.18);
        this.noise(now + 0.08, 0.14, 920, 0.11);
        this.cushion(now + 0.12, 128, 0.075, 0.13);
        break;
      case 'drop':
        this.cushion(now, 134, 0.16, 0.17);
        this.noise(now + 0.012, 0.14, 680, 0.2);
        break;
      case 'event-alert':
        this.bell(now, 392, 0.1, 0.25);
        this.bell(now + 0.15, 329.63, 0.09, 0.3);
        break;
      case 'game-over':
        this.voice(261.63, 0.46, now, 0.1, { type: 'triangle', cutoff: 950, attack: 0.025 });
        this.voice(196, 0.48, now + 0.18, 0.11, { type: 'triangle', cutoff: 850, attack: 0.025 });
        this.voice(130.81, 0.7, now + 0.38, 0.12, { attack: 0.03 });
        break;
      case 'grab':
        this.noise(now, 0.115, 840, 0.18);
        this.voice(185, 0.095, now + 0.016, 0.09, { end: 160 });
        break;
      case 'gunshot':
        // Dry comic clapper, with a wooden body instead of an explosive crack.
        this.noise(now, 0.09, 1150, 0.27);
        this.cushion(now + 0.008, 168, 0.17, 0.13);
        this.noise(now + 0.035, 0.075, 650, 0.13);
        break;
      case 'missed':
        this.cushion(now, 132, 0.11);
        this.bell(now + 0.04, 329.63, 0.085, 0.21);
        this.bell(now + 0.18, 261.63, 0.075, 0.23);
        break;
      case 'npc-talk':
        this.noise(now, 0.065, 880, 0.052);
        this.voice(245, 0.07, now, 0.028, { end: 220 });
        break;
      case 'package-spawn':
        this.noise(now, 0.08, 540, 0.075);
        this.cushion(now + 0.012, 150, 0.05, 0.08);
        break;
      case 'pile-up':
        this.cushion(now, 112, 0.19, 0.22);
        this.noise(now + 0.02, 0.22, 590, 0.22);
        this.cushion(now + 0.095, 162, 0.085, 0.13);
        break;
      case 'results':
        [392, 523.25, 659.25].forEach((note, index) => this.bell(now + index * 0.15, note, 0.1, 0.48));
        break;
      case 'shift-end':
        // Rounded two-part depot chime; the long shift end remains distinctive.
        this.bell(now, 392, 0.13, 0.65);
        this.bell(now + 0.52, 523.25, 0.12, 0.75);
        break;
      case 'switch':
        this.latch(now, 0.45);
        this.voice(310, 0.09, now + 0.018, 0.065, { end: 380 });
        break;
      case 'truck':
        this.voice(78, 0.58, now, 0.15, { type: 'triangle', end: 105, cutoff: 360, attack: 0.055 });
        this.voice(117, 0.46, now + 0.055, 0.045, { end: 157, cutoff: 450, attack: 0.035 });
        this.noise(now, 0.53, 240, 0.19);
        this.latch(now + 0.07, 0.5);
        break;
      case 'ui-start':
        this.latch(now, 0.45);
        this.bell(now + 0.025, 392, 0.09, 0.3);
        this.bell(now + 0.14, 523.25, 0.1, 0.4);
        break;
      case 'warning':
        this.bell(now, 440, 0.105, 0.23);
        this.bell(now + 0.18, 349.23, 0.09, 0.3);
        break;
      case 'wrong':
        this.cushion(now, 144, 0.12, 0.14);
        this.voice(246.94, 0.19, now + 0.025, 0.1, { type: 'triangle', cutoff: 920 });
        this.voice(196, 0.22, now + 0.15, 0.075, { type: 'triangle', cutoff: 820 });
        break;
    }
  }

  private scheduleMusic(): void {
    const context = this.context;
    if (!context || context.state !== 'running' || this.muted || this.musicTimer === null) return;
    // Skip missed beats after a stalled tab. Never schedule a backlog of notes
    // in the past (Web Audio would play them all immediately on resume).
    if (this.nextStepTime < context.currentTime - 0.04) this.nextStepTime = context.currentTime + 0.04;
    const secondsPerStep = 60 / MUSIC_BPM[this.musicMode] / 4;
    let scheduled = 0;
    while (this.nextStepTime < context.currentTime + 0.12 && scheduled < 4) {
      this.playMusicStep(this.musicStep, this.nextStepTime);
      this.musicStep = (this.musicStep + 1) % 64;
      this.nextStepTime += secondsPerStep;
      scheduled += 1;
    }
  }

  private playMusicStep(step: number, time: number): void {
    const mode = this.musicMode;
    const bar = Math.floor(step / 16) % 4;
    const beat = step % 16;
    const roots = mode === 'danger' ? [130.81, 116.54, 110, 98] : [130.81, 98, 110, 87.31];
    const root = roots[bar];
    if (beat === 0 || beat === 8) {
      this.voice(root / 2, 0.58, time, 0.21, { music: true, attack: 0.022, cutoff: 470 });
      this.voice(86, 0.16, time, 0.13, { music: true, end: 54, attack: 0.008 });
    }
    if (beat === 0 || beat === 10) {
      const third = mode === 'danger' || bar === 2 ? 1.189207 : 1.259921;
      for (const ratio of [1, third, 1.498307]) {
        this.voice(root * ratio * 2, 0.95, time, 0.08, { music: true, type: 'triangle', cutoff: 1300, attack: 0.026 });
        this.voice(root * ratio * 4, 0.45, time, 0.014, { music: true, attack: 0.018 });
      }
    }
    if (beat === 4 || beat === 12) this.noise(time, 0.115, 1200, 0.075, true);
    if (beat % 4 === 2 && mode !== 'title') this.noise(time, 0.045, 1900, 0.042, true);
    if (beat === 14 && (mode === 'title' || mode === 'results')) {
      this.voice(root * 4, 0.42, time, 0.065, { music: true, attack: 0.014 });
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (this.context) return this.context;
    const AudioContextCtor = (window as AudioWindow).AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioContextCtor) return null;
    this.context = new AudioContextCtor();
    const context = this.context;
    this.masterGain = context.createGain();
    this.musicGain = context.createGain();
    this.sfxGain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 14;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.14;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass'; lowpass.frequency.value = 5600; lowpass.Q.value = 0.6;
    const rumbleCut = context.createBiquadFilter();
    rumbleCut.type = 'highpass'; rumbleCut.frequency.value = 38; rumbleCut.Q.value = 0.6;
    this.masterGain.gain.value = this.muted ? 0 : 0.72;
    this.musicGain.gain.value = 0;
    this.sfxGain.gain.value = 0.85;
    this.musicGain.connect(compressor); this.sfxGain.connect(compressor);
    compressor.connect(this.masterGain); this.masterGain.connect(lowpass);
    lowpass.connect(rumbleCut); rumbleCut.connect(context.destination);
    this.noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let seed = 0x71b37; let smooth = 0;
    for (let index = 0; index < data.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = seed / 0x80000000 - 1;
      smooth = smooth * 0.82 + white * 0.18;
      data[index] = white * 0.65 + smooth * 0.35;
    }
    context.addEventListener('statechange', () => {
      if (context.state === 'running') this.nextStepTime = context.currentTime + 0.06;
    });
    return context;
  }

  private updateMusicVolume(): void {
    const volume = this.musicMode === 'title' || this.musicMode === 'results' ? 0.28 : 0.22;
    this.fade(this.musicGain, this.muted || this.musicTimer === null ? 0 : volume, 0.08);
  }

  private fade(node: GainNode | null, value: number, duration: number): void {
    if (!node || !this.context) return;
    const now = this.context.currentTime;
    const parameter = node.gain;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else { parameter.cancelScheduledValues(now); parameter.setValueAtTime(parameter.value, now); }
    parameter.linearRampToValueAtTime(value, now + duration);
  }

  private envelope(gain: GainNode, time: number, duration: number, volume: number, attack = 0.008): void {
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + Math.min(attack, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(Math.max(0.00001, volume * 0.002), time + duration * 0.85);
    gain.gain.linearRampToValueAtTime(0, time + duration);
  }

  private voice(frequency: number, duration: number, time: number, volume: number, options: VoiceOptions = {}): void {
    const context = this.context;
    const destination = options.music ? this.musicGain : this.sfxGain;
    if (!context || !destination) return;
    const source = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.type = options.type ?? 'sine';
    source.frequency.setValueAtTime(frequency, time);
    if (options.end) source.frequency.exponentialRampToValueAtTime(options.end, time + duration * 0.8);
    filter.type = 'lowpass'; filter.frequency.value = options.cutoff ?? 2600; filter.Q.value = 0.5;
    this.envelope(gain, time, duration, volume, options.attack);
    source.connect(filter); filter.connect(gain); gain.connect(destination);
    this.track(source, [filter, gain], Boolean(options.music));
    source.start(time); source.stop(time + duration + 0.01);
  }

  private noise(time: number, duration: number, frequency: number, volume: number, music = false): void {
    const context = this.context;
    const destination = music ? this.musicGain : this.sfxGain;
    if (!context || !destination || !this.noiseBuffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = 0.65;
    this.envelope(gain, time, duration, volume, 0.006);
    source.connect(filter); filter.connect(gain); gain.connect(destination);
    this.track(source, [filter, gain], music);
    this.noiseOffset = (this.noiseOffset + 0.173) % 1;
    source.start(time, this.noiseOffset); source.stop(time + duration + 0.01);
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[], music: boolean): void {
    if (music) this.musicVoices.add(source);
    source.onended = () => {
      this.musicVoices.delete(source);
      source.disconnect();
      nodes.forEach(node => node.disconnect());
    };
  }

  private cushion(time: number, frequency: number, volume: number, duration = 0.18): void {
    this.voice(frequency, duration, time, volume, { end: frequency * 0.62, attack: 0.008 });
  }

  private latch(time: number, strength: number): void {
    this.noise(time, 0.052, 1500, 0.13 * strength);
    this.voice(680, 0.072, time + 0.006, 0.06 * strength, { end: 580 });
    this.voice(240, 0.06, time, 0.04 * strength);
  }

  private bell(time: number, frequency: number, volume: number, duration: number): void {
    this.voice(frequency, duration, time, volume, { attack: 0.009 });
    this.voice(frequency * 2.756, duration * 0.38, time, volume * 0.11, { attack: 0.006, cutoff: 2800 });
  }
}

export const audioSystem = new AudioSystem();
