import { BREAK_PLACES, BREAK_SCENES, OPENERS, type BreakPlace, type Opener, type StoryBeat, type StoryScene } from './StoryScript.ts';

/**
 * The overnight run's chapters, in order. Each renderer (3D and 2D) shows the
 * same chapters and asks this model what happens next; nothing here draws.
 *
 * arrival → scrum → countdown → shift (break, drivers inside it) → clockout →
 * assignment → to-mall → mall → to-ups → return → home → results
 */
export type Chapter =
  | 'briefing' | 'arrival' | 'scrum' | 'countdown' | 'shift' | 'break' | 'clockout' | 'assignment'
  | 'to-mall' | 'mall' | 'to-ups' | 'return' | 'home' | 'results';

/** When the single mid-shift break may begin (shift milliseconds). */
export const BREAK_WINDOW = { earliestMs: 46_000, latestMs: 56_000 } as const;

export interface StoryChoices {
  opener: number;
  breakPlace: BreakPlace;
  breakVariant: number;
  breakAtMs: number;
}

/**
 * Plays one scene's beats. Each beat auto-advances after its own duration;
 * next() moves on at once and skip() ends the scene. Renderers stage actors
 * from (index, progress) alone, so a skip always lands on the final staging.
 */
export class Cutscene {
  public readonly scene: StoryScene;
  public index = 0;
  public elapsedMs = 0;
  public done = false;
  public skipped = false;
  private readonly entered = new Set<number>();

  constructor(scene: StoryScene) {
    this.scene = scene;
  }

  public get beat(): StoryBeat {
    return this.scene.beats[Math.min(this.index, this.scene.beats.length - 1)];
  }

  public get progress(): number {
    return Math.min(1, this.elapsedMs / Math.max(1, this.beat.ms));
  }

  /** Each beat is reported once, the first time it is shown (for sounds and speech). */
  public takeEntered(): StoryBeat | null {
    if (this.done || this.entered.has(this.index)) return null;
    this.entered.add(this.index);
    return this.beat;
  }

  public update(deltaMs: number): void {
    if (this.done || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.elapsedMs += Math.min(deltaMs, 100);
    if (this.elapsedMs >= this.beat.ms) this.next();
  }

  public next(): void {
    if (this.done) return;
    if (this.index >= this.scene.beats.length - 1) {
      this.done = true;
      this.elapsedMs = this.beat.ms;
      return;
    }
    this.index += 1;
    this.elapsedMs = 0;
  }

  public skip(): void {
    if (this.done) return;
    this.index = this.scene.beats.length - 1;
    this.elapsedMs = this.beat.ms;
    this.done = true;
    this.skipped = true;
  }
}

/** One run's random choices and once-only story flags. */
export class StoryRun {
  public chapter: Chapter = 'briefing';
  public readonly choices: StoryChoices;
  public breakTaken = false;
  public breakStartedAtMs: number | null = null;
  /** Chapters actually shown in this run, in order (for checks and the results). */
  public readonly visited: Chapter[] = ['briefing'];

  constructor(random: () => number = Math.random, forced: Partial<StoryChoices> = {}) {
    const pick = (count: number): number => Math.min(count - 1, Math.floor(random() * count));
    const opener = forced.opener ?? pick(OPENERS.length);
    const breakPlace = forced.breakPlace ?? BREAK_PLACES[pick(BREAK_PLACES.length)];
    const breakVariant = forced.breakVariant ?? pick(BREAK_SCENES[breakPlace].length);
    const breakAtMs = forced.breakAtMs ?? Math.round(BREAK_WINDOW.earliestMs + random() * (BREAK_WINDOW.latestMs - BREAK_WINDOW.earliestMs));
    this.choices = { opener, breakPlace, breakVariant, breakAtMs };
  }

  public get opener(): Opener {
    return OPENERS[this.choices.opener];
  }

  public get breakScene(): StoryScene {
    return BREAK_SCENES[this.choices.breakPlace][this.choices.breakVariant];
  }

  public go(chapter: Chapter): void {
    if (this.chapter === chapter) return;
    this.chapter = chapter;
    this.visited.push(chapter);
  }

  /** True exactly once per run: when the shift clock first passes the break time. */
  public breakDue(shiftElapsedMs: number): boolean {
    return !this.breakTaken && shiftElapsedMs >= this.choices.breakAtMs;
  }

  public takeBreak(shiftElapsedMs: number): void {
    this.breakTaken = true;
    this.breakStartedAtMs = shiftElapsedMs;
  }
}
