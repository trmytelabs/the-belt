import { MESA } from './references';
import type { Parcel } from '../game/slice/ShiftModel';
import type { ShiftModel3D as ShiftModel } from './ShiftModel3D';
import { audioSystem } from './audio';
import { mix, type CrewLife } from './crew';
import type { Overlay } from './overlay';

/**
 * The Vic/Mesa choice, from src/game/slice/DepotMesaEncounter.ts. One
 * unheld Mesa after 34 s pauses the shift. Vic offers to put it in his SUV,
 * and a fresh one-in-five roll decides whether Shan catches a theft.
 */
export type MesaStage = 'idle' | 'approach' | 'choice' | 'transition' | 'dream' | 'caught' | 'done';

export interface MesaCallbacks {
  say(id: string, copy: string, durationMs: number): void;
  thought(): void;
  dream(): void;
  caught(penalty: number): void;
  resume(): void;
}

export class MesaEncounter {
  public stage: MesaStage = 'idle';
  /** Replaceable for the browser checks' deterministic rolls. */
  public roll: () => number = Math.random;
  public rolls = 0;
  private seen = false;
  private parcel: Parcel | null = null;
  private model: ShiftModel | null = null;
  private timerMs = 0;
  private timerAction: (() => void) | null = null;
  private vicMs = 0;
  private readonly overlay: Overlay;
  private readonly crew: CrewLife;
  private readonly callbacks: MesaCallbacks;

  constructor(overlay: Overlay, crew: CrewLife, callbacks: MesaCallbacks) {
    this.overlay = overlay;
    this.crew = crew;
    this.callbacks = callbacks;
  }

  public get active(): boolean {
    return this.stage !== 'idle' && this.stage !== 'done';
  }

  public reset(): void {
    this.stage = 'idle';
    this.seen = false;
    this.parcel = null;
    this.model = null;
    this.timerAction = null;
    this.rolls = 0;
    this.overlay.showNotice(null);
  }

  /** Checked every playing frame; returns true when the encounter begins. */
  public check(model: ShiftModel): boolean {
    if (this.seen || model.paused || model.ended || model.elapsedMs < 34_000) return false;
    const parcel = model.packages.find((item) => item.kind === 'mesa' && (item.state === 'belt' || item.state === 'held' || item.state === 'floor'));
    if (!parcel) return false;
    this.seen = true;
    this.parcel = parcel;
    this.model = model;
    this.stage = 'approach';
    this.vicMs = 0;
    model.paused = true;
    this.crew.staged.add('vic');
    const vic = this.crew.actor('vic');
    vic.root.visible = true;
    vic.root.rotation.x = 0;
    audioSystem.play('warning');
    this.overlay.showNotice(MESA.spotted);
    this.callbacks.say('vic', MESA.offer, 60_000);
    this.schedule(1100, () => {
      this.overlay.showNotice(null);
      this.stage = 'choice';
      this.showChoice();
    });
    return true;
  }

  /** Runs on wall time while the encounter holds the shift. */
  public update(dtMs: number, wallTime: number): void {
    if (this.timerAction) {
      this.timerMs -= dtMs;
      if (this.timerMs <= 0) {
        const action = this.timerAction;
        this.timerAction = null;
        action();
      }
    }
    if (this.stage === 'approach' || this.stage === 'choice') {
      // Vic hurries up the west lane to make his offer.
      this.vicMs += dtMs;
      const vic = this.crew.actor('vic');
      vic.place(401, mix(40, 278, this.vicMs / 1100));
      vic.faceAngle = this.vicMs >= 1100 ? Math.PI / 2 : null;
      vic.pose = this.stage === 'choice' ? 'announce' : 'none';
      this.crew.animateActors(dtMs / 1000, wallTime, new Set(['vic']));
    }
  }

  public key(code: string): boolean {
    if (this.stage !== 'choice') return false;
    if (code === 'KeyY') this.steal();
    else if (code === 'KeyN') this.leave();
    else return false;
    return true;
  }

  private showChoice(): void {
    this.overlay.showPanel(`
      <div class="kicker">${MESA.spotted}</div>
      <h1>${MESA.title}</h1>
      <p style="color:#edba6d"><b>${MESA.offer.replace(/\n/g, ' ')}</b></p>
      <p>${MESA.body.replace(/\n/g, '<br>')}</p>
      <p style="color:#8da7ac;font-size:12px;letter-spacing:1px">Y / N  ·  OR TAP A CHOICE</p>
      <div class="b3d-choices"><button type="button" class="steal" data-action="steal">STEAL IT</button><button type="button" class="leave" data-action="leave">LEAVE IT</button></div>`,
    { steal: () => this.steal(), leave: () => this.leave() });
  }

  private endOffer(): void {
    this.overlay.clearCenter();
    this.overlay.dropSpeech((key) => key === 'vic');
    this.crew.staged.delete('vic');
    this.crew.actor('vic').root.visible = false;
  }

  private leave(): void {
    if (this.stage !== 'choice') return;
    audioSystem.play('button');
    this.endOffer();
    this.stage = 'done';
    this.callbacks.resume();
    this.overlay.showNotice(MESA.leave, '#a6cc9a');
    this.schedule(2200, () => this.overlay.showNotice(null));
  }

  private steal(): void {
    if (this.stage !== 'choice' || !this.parcel) return;
    this.stage = 'transition';
    this.endOffer();
    // Stolen freight is not a dispatch. Release any worker carrying it.
    const parcel = this.parcel;
    this.parcel = null;
    this.stolen?.(parcel);
    this.callbacks.thought();
    audioSystem.play('switch');
    this.rolls += 1;
    if (this.roll() < 0.2) {
      const penalty = this.model?.penalizeMesaTheft() ?? 0;
      this.stage = 'caught';
      audioSystem.play('warning');
      this.overlay.showPanel(`
        <h1 class="caught">${MESA.caught}</h1>
        <p>${MESA.caughtDetail}</p>
        <p style="color:#edba6d"><b>−${penalty} POINTS · SHIFT CONTINUES</b></p>`);
      this.schedule(1300, () => {
        this.overlay.clearCenter();
        this.stage = 'done';
        this.callbacks.resume();
        this.callbacks.caught(penalty);
      });
      return;
    }
    this.schedule(900, () => {
      this.stage = 'dream';
      this.callbacks.dream();
    });
  }

  /** Set by the app: removes the parcel from the shift without scoring it. */
  public stolen: ((parcel: Parcel) => void) | null = null;

  public dreamFinished(): void {
    if (this.stage !== 'dream') return;
    this.stage = 'done';
    this.callbacks.resume();
  }

  private schedule(ms: number, action: () => void): void {
    this.timerMs = ms;
    this.timerAction = action;
  }
}
