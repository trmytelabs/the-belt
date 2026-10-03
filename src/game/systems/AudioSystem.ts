type MusicMode = 'title' | 'game' | 'danger' | 'results';

export type SoundEffect =
  | 'belt-start'
  | 'belt-stop'
  | 'bulk'
  | 'button'
  | 'correct'
  | 'countdown'
  | 'countdown-go'
  | 'dig'
  | 'drop'
  | 'event-alert'
  | 'game-over'
  | 'grab'
  | 'gunshot'
  | 'missed'
  | 'npc-talk'
  | 'package-spawn'
  | 'pile-up'
  | 'results'
  | 'shift-end'
  | 'switch'
  | 'truck'
  | 'ui-start'
  | 'warning'
  | 'wrong';

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const MUSIC_BPM: Record<MusicMode, number> = {
  title: 78,
  game: 96,
  danger: 104,
  results: 84,
};

class AudioSystem {
  private context: AudioContext | null = null;

  private masterGain: GainNode | null = null;

  private musicGain: GainNode | null = null;

  private sfxGain: GainNode | null = null;

  private musicTimer: number | null = null;

  private musicMode: MusicMode = 'title';

  private nextStepTime = 0;

  private musicStep = 0;

  private muted = false;

  private unlockListenersInstalled = false;

  public installUnlockListeners(): void {
    if (typeof window === 'undefined' || this.unlockListenersInstalled) {
      return;
    }

    this.unlockListenersInstalled = true;

    const unlock = () => {
      void this.unlock();
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  public async unlock(): Promise<void> {
    const context = this.getContext();

    if (!context) {
      return;
    }

    if (context.state === 'suspended') {
      await context.resume().catch(() => undefined);
    }
  }

  public startMusic(mode: MusicMode): void {
    this.musicMode = mode;
    const context = this.getContext();

    if (!context) {
      return;
    }

    this.nextStepTime = context.currentTime + 0.05;
    this.musicStep = 0;
    this.updateMusicVolume();

    if (this.musicTimer !== null) {
      return;
    }

    this.musicTimer = window.setInterval(() => {
      this.scheduleMusic();
    }, 65);
  }

  public stopMusic(): void {
    if (this.musicTimer === null) {
      return;
    }

    window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateMusicVolume();
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 0.86;
    }
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public play(effect: SoundEffect): void {
    const context = this.getContext();

    if (!context || this.muted) {
      return;
    }

    void this.unlock();

    const now = context.currentTime;

    switch (effect) {
      case 'belt-start':
        this.riser(now, 110, 210, 0.22, 0.08);
        this.click(now + 0.03, 0.12);
        break;
      case 'belt-stop':
        this.riser(now, 180, 60, 0.32, 0.12);
        this.thump(now + 0.08, 52, 0.18);
        break;
      case 'bulk':
        this.thump(now, 82, 0.22);
        this.noiseHit(now + 0.03, 0.14, 420, 0.13);
        break;
      case 'button':
        this.tone(940, 0.045, now, 'square', 0.08);
        this.click(now + 0.035, 0.09);
        break;
      case 'correct':
        this.tone(520, 0.07, now, 'triangle', 0.08);
        this.tone(780, 0.09, now + 0.07, 'triangle', 0.09);
        this.tone(1040, 0.1, now + 0.15, 'triangle', 0.07);
        break;
      case 'countdown':
        this.tone(440, 0.09, now, 'square', 0.09);
        break;
      case 'countdown-go':
        this.tone(440, 0.07, now, 'square', 0.1);
        this.tone(660, 0.08, now + 0.08, 'square', 0.1);
        this.tone(990, 0.16, now + 0.17, 'sawtooth', 0.08);
        break;
      case 'dig':
        this.noiseHit(now, 0.18, 330, 0.15);
        this.thump(now + 0.04, 72, 0.14);
        break;
      case 'drop':
        this.thump(now, 96, 0.15);
        this.noiseHit(now + 0.025, 0.08, 620, 0.08);
        break;
      case 'event-alert':
        this.tone(360, 0.08, now, 'square', 0.08);
        this.tone(270, 0.1, now + 0.1, 'square', 0.08);
        break;
      case 'game-over':
        this.tone(220, 0.18, now, 'sawtooth', 0.13);
        this.tone(174, 0.24, now + 0.15, 'sawtooth', 0.12);
        this.tone(110, 0.42, now + 0.32, 'triangle', 0.16);
        this.noiseHit(now + 0.08, 0.45, 190, 0.12);
        break;
      case 'grab':
        this.tone(250, 0.045, now, 'square', 0.07);
        this.tone(360, 0.055, now + 0.045, 'square', 0.07);
        break;
      case 'gunshot':
        this.gunshot(now, 0.5);
        break;
      case 'missed':
        this.tone(880, 0.07, now, 'triangle', 0.07);
        this.tone(1170, 0.08, now + 0.08, 'triangle', 0.06);
        break;
      case 'npc-talk':
        this.tone(620, 0.035, now, 'square', 0.035);
        this.tone(500, 0.035, now + 0.045, 'square', 0.03);
        break;
      case 'package-spawn':
        this.tone(180, 0.04, now, 'triangle', 0.035);
        this.noiseHit(now, 0.04, 1200, 0.025);
        break;
      case 'pile-up':
        this.noiseHit(now, 0.2, 250, 0.16);
        this.tone(120, 0.22, now + 0.03, 'sawtooth', 0.11);
        break;
      case 'results':
        this.tone(392, 0.12, now, 'triangle', 0.08);
        this.tone(523, 0.14, now + 0.13, 'triangle', 0.08);
        this.tone(784, 0.2, now + 0.28, 'triangle', 0.08);
        break;
      case 'shift-end':
        this.tone(156, 0.45, now, 'sawtooth', 0.13);
        this.tone(156, 0.45, now + 0.55, 'sawtooth', 0.13);
        break;
      case 'switch':
        this.tone(480, 0.045, now, 'triangle', 0.07);
        this.tone(680, 0.045, now + 0.05, 'triangle', 0.07);
        break;
      case 'truck':
        this.thump(now, 58, 0.22);
        this.thump(now + 0.12, 64, 0.14);
        this.noiseHit(now + 0.02, 0.28, 170, 0.1);
        break;
      case 'ui-start':
        this.tone(330, 0.08, now, 'triangle', 0.08);
        this.tone(660, 0.12, now + 0.1, 'triangle', 0.08);
        break;
      case 'warning':
        this.tone(740, 0.08, now, 'square', 0.09);
        this.tone(520, 0.1, now + 0.11, 'square', 0.09);
        break;
      case 'wrong':
        this.tone(180, 0.12, now, 'sawtooth', 0.11);
        this.tone(132, 0.16, now + 0.11, 'sawtooth', 0.1);
        break;
    }
  }

  private scheduleMusic(): void {
    const context = this.context;

    if (!context || context.state !== 'running' || this.muted) {
      return;
    }

    const secondsPerStep = 60 / MUSIC_BPM[this.musicMode] / 4;

    while (this.nextStepTime < context.currentTime + 0.15) {
      this.playMusicStep(this.musicStep, this.nextStepTime);
      this.musicStep = (this.musicStep + 1) % 16;
      this.nextStepTime += secondsPerStep;
    }
  }

  private playMusicStep(step: number, time: number): void {
    const mode = this.musicMode;
    const bassNotes = mode === 'danger' ? [55, 58, 52, 49] : [55, 65, 62, 73];
    const titleNotes = [220, 247, 196, 165];

    if (step % 4 === 0) {
      this.kick(time, mode === 'danger' ? 0.19 : 0.14);
    }

    if (step % 2 === 1) {
      this.hat(time, mode === 'title' ? 0.025 : 0.04);
    }

    if (mode !== 'title' && step % 4 === 2) {
      this.snare(time, mode === 'danger' ? 0.08 : 0.06);
    }

    if (step % 4 === 0) {
      const note = mode === 'title' ? titleNotes[(step / 4) % titleNotes.length] : bassNotes[(step / 4) % bassNotes.length];
      this.musicTone(note, 0.18, time, 'sawtooth', mode === 'results' ? 0.035 : 0.055);
    }

    if ((mode === 'game' || mode === 'results') && step % 8 === 6) {
      this.musicTone(880, 0.08, time, 'triangle', 0.025);
    }

    if (mode === 'danger' && step % 8 === 6) {
      this.musicTone(110, 0.3, time, 'sawtooth', 0.05);
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }

    if (!this.context) {
      const audioWindow = window as AudioWindow;
      const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

      if (!AudioContextCtor) {
        return null;
      }

      this.context = new AudioContextCtor();
      this.masterGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.86;
      this.musicGain.gain.value = 0.16;
      this.sfxGain.gain.value = 0.9;
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
    }

    return this.context;
  }

  private updateMusicVolume(): void {
    if (!this.musicGain) {
      return;
    }

    const volume = this.musicMode === 'title' ? 0.11 : this.musicMode === 'danger' ? 0.12 : 0.15;
    this.musicGain.gain.value = this.muted ? 0 : volume;
  }

  private tone(
    frequency: number,
    duration: number,
    time: number,
    type: OscillatorType,
    volume: number,
  ): void {
    const context = this.context;
    const destination = this.sfxGain;

    if (!context || !destination) {
      return;
    }

    this.createTone(context, destination, frequency, duration, time, type, volume);
  }

  private musicTone(
    frequency: number,
    duration: number,
    time: number,
    type: OscillatorType,
    volume: number,
  ): void {
    const context = this.context;
    const destination = this.musicGain;

    if (!context || !destination) {
      return;
    }

    this.createTone(context, destination, frequency, duration, time, type, volume);
  }

  private createTone(
    context: AudioContext,
    destination: AudioNode,
    frequency: number,
    duration: number,
    time: number,
    type: OscillatorType,
    volume: number,
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  private riser(time: number, from: number, to: number, duration: number, volume: number): void {
    const context = this.context;
    const destination = this.sfxGain;

    if (!context || !destination) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(from, time);
    oscillator.frequency.exponentialRampToValueAtTime(to, time + duration);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  private click(time: number, volume: number): void {
    this.noiseHit(time, 0.035, 2400, volume);
  }

  private thump(time: number, frequency: number, volume: number): void {
    const context = this.context;
    const destination = this.sfxGain;

    if (!context || !destination) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(28, frequency * 0.45), time + 0.16);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + 0.2);
  }

  private kick(time: number, volume: number): void {
    const context = this.context;
    const destination = this.musicGain;

    if (!context || !destination) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(92, time);
    oscillator.frequency.exponentialRampToValueAtTime(38, time + 0.14);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + 0.18);
  }

  private hat(time: number, volume: number): void {
    this.musicNoise(time, 0.035, 6200, volume);
  }

  private snare(time: number, volume: number): void {
    this.musicNoise(time, 0.07, 1700, volume);
  }

  private noiseHit(time: number, duration: number, filterFrequency: number, volume: number): void {
    const context = this.context;
    const destination = this.sfxGain;

    if (!context || !destination) {
      return;
    }

    this.createNoise(context, destination, time, duration, filterFrequency, volume);
  }

  private musicNoise(time: number, duration: number, filterFrequency: number, volume: number): void {
    const context = this.context;
    const destination = this.musicGain;

    if (!context || !destination) {
      return;
    }

    this.createNoise(context, destination, time, duration, filterFrequency, volume);
  }

  private createNoise(
    context: AudioContext,
    destination: AudioNode,
    time: number,
    duration: number,
    filterFrequency: number,
    volume: number,
  ): void {
    const bufferLength = Math.max(1, Math.floor(context.sampleRate * duration));
    const noiseBuffer = context.createBuffer(1, bufferLength, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let index = 0; index < bufferLength; index += 1) {
      const fade = 1 - index / bufferLength;
      data[index] = (Math.random() * 2 - 1) * fade;
    }

    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    noise.buffer = noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFrequency, time);
    filter.Q.setValueAtTime(0.9, time);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    noise.start(time);
    noise.stop(time + duration + 0.02);
  }

  private gunshot(time: number, volume: number): void {
    this.noiseHit(time, 0.16, 950, volume);
    this.thump(time + 0.006, 96, volume * 0.42);
  }
}

export const audioSystem = new AudioSystem();
