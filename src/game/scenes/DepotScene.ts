import Phaser from 'phaser';

import { DEPOT_ROUTE_COLORS, DepotArt, createParcelArt, createWorkerArt, updateParcelArt } from '../slice/DepotArt';
import { DepotLife } from '../slice/DepotLife';
import { DepotMesaEncounter } from '../slice/DepotMesaEncounter';
import { DepotCamera } from '../slice/DepotCamera';
import { DepotReceiving } from '../slice/DepotReceiving';
import { DepotStoryView, cueProgress } from '../slice/DepotStory';
import { MESA } from '../slice/DepotReferences';
import { KeyReturnModel, MallModel, MALL_RULES, type MallEvent } from '../slice/MallModel';
import { ROUTE_INFO, ShiftModel, SHIFT_LAYOUT, type ShiftEvent, type Route, type WorkerId } from '../slice/ShiftModel';
import { Cutscene, StoryRun, type StoryChoices } from '../slice/StoryModel';
import {
  DRIVE_TO_MALL, DRIVE_TO_UPS, GO_HOME, KEY_RETURN_LINES, MALL_ASSIGNMENT, MALL_INTRO, SCRUM, type StoryBeat, type StoryScene,
} from '../slice/StoryScript';
import { audioSystem, type SoundEffect } from '../systems/AudioSystem';

const INK = '#edf0de';
const MUTED = '#8da7ac';
const ROUTE: Record<Route, number> = DEPOT_ROUTE_COLORS;
const ROUTE_NAME = Object.fromEntries(Object.values(ROUTE_INFO).map((info) => [info.route, `${info.route} · ${info.name}`])) as Record<Route, string>;
const BEAT_SOUNDS: Record<NonNullable<StoryBeat['sound']>, SoundEffect> = {
  engine: 'engine', cough: 'cough', horn: 'horn', gate: 'gate', door: 'button', spill: 'splash', register: 'register', truck: 'truck', sign: 'sign',
};
const NEW_ROUTES: readonly Route[] = ['D', 'E', 'T', 'S'];
type ParcelView = { container: Phaser.GameObjects.Container; state: string; transferUntil: number; brokenAt?: number };
type Resumable = 'playing' | 'interlude' | 'story' | 'mall' | 'lot';

/** A bounded art/gameplay review slice. The original full shift remains accessible. */
export class DepotScene extends Phaser.Scene {
  public model!: ShiftModel;
  public state: 'briefing' | 'story' | 'countdown' | 'playing' | 'interlude' | 'paused' | 'mesa' | 'celebrating' | 'mall' | 'lot' | 'results' = 'briefing';
  public view!: DepotCamera;
  public story!: StoryRun;
  public cutscene: Cutscene | null = null;
  public mall: MallModel | null = null;
  public lot: KeyReturnModel | null = null;
  public storyView!: DepotStoryView;
  private pausedFrom: Resumable = 'playing';
  /** Fixed random choices for the next runs (checks and rehearsal); survives restarts. */
  private forcedStory: Partial<StoryChoices> = {};
  private storyFocus: { x: number; y: number; zoom: number } | null = null;
  private chapterHint = '';
  private mallBonus = 0;
  private depot!: DepotArt;
  private receiving!: DepotReceiving;
  private life!: DepotLife;
  private mesa!: DepotMesaEncounter;
  private workers: ReturnType<typeof createWorkerArt>[] = [];
  private parcels = new Map<number, ParcelView>();
  private throwers = new Map<number, WorkerId>();
  private seenRoutes = new Set<Route>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private guide!: Phaser.GameObjects.Graphics;
  private consoleGraphics!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private operatorText!: Phaser.GameObjects.Text;
  private actionText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private brakeText!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;
  private soundText!: Phaser.GameObjects.Text;
  private viewText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private throwLabel!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Container | null = null;
  private toastUntil = 0;
  private mobileLayer: HTMLDivElement | null = null;
  private mobileButtons: Record<string, HTMLButtonElement> = {};
  private touchMove = { x: 0, y: 0 };
  private muted = false;
  private reducedMotion = false;
  private lostFocus = false;

  constructor() { super('DepotScene'); }

  /** Fixes the next runs' opener, break place, variant and time. */
  public forceStory(choices: Partial<StoryChoices>): void {
    this.forcedStory = { ...choices };
    if (this.state === 'briefing') this.story = new StoryRun(Math.random, this.forcedStory);
  }

  create(): void {
    this.model = new ShiftModel();
    this.model.paused = true;
    this.state = 'briefing';
    this.story = new StoryRun(Math.random, this.forcedStory);
    this.cutscene = null;
    this.mall = null;
    this.lot = null;
    this.mallBonus = 0;
    this.storyFocus = null;
    this.chapterHint = '';
    this.throwers = new Map();
    this.seenRoutes = new Set();
    this.mobileButtons = {};
    document.body.classList.add('depot-mode');
    // The preview reserves portrait touch space; refresh Phaser's input bounds
    // immediately after changing its parent, before any canvas button is used.
    this.scale.getParentBounds();
    this.scale.refresh();
    // Parent CSS changes during rotation can settle after Phaser's resize
    // event. Observe layout directly, including while its frame loop is idle.
    const resizeObserver = new ResizeObserver(() => {
      this.scale.getParentBounds();
      this.scale.refresh();
    });
    const parent = document.getElementById('app');
    if (parent) resizeObserver.observe(parent);
    this.parcels = new Map();
    this.touchMove = { x: 0, y: 0 };
    this.overlay = null;
    this.toastUntil = 0;
    this.lostFocus = false;
    this.pausedFrom = 'playing';
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.view = new DepotCamera(this, this.reducedMotion);
    this.depot = new DepotArt(this);
    this.receiving = new DepotReceiving(this, this.model);
    this.receiving.update();
    this.life = new DepotLife(this, this.model, this.depot);
    this.storyView = new DepotStoryView(this, this.view, this.reducedMotion);
    this.mesa = new DepotMesaEncounter(this, this.model, {
      begin: () => { this.state = 'mesa'; this.touchMove = { x: 0, y: 0 }; },
      finish: () => {
        this.state = 'playing';
        if (this.lostFocus) this.togglePause();
        this.updateConsole();
      },
      caught: () => this.showMesaCaught(),
      offer: visible => this.life.setMesaOffer(visible),
      thought: () => this.life.mesaThought(),
    });
    this.guide = this.add.graphics().setDepth(18);
    this.throwLabel = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '9px', fontStyle: 'bold', color: '#14232a' })
      .setOrigin(0.5).setPadding(4, 2).setDepth(19).setVisible(false);
    this.workers = this.model.workers.map(worker => createWorkerArt(this, worker.side));
    this.drawConsole();
    this.bindControls();
    this.createTouchControls();
    this.showBriefing();
    this.syncWorld(0);
    this.updateConsole();
    audioSystem.stopMusic();
    const caption = (text: string) => this.tell(text, '#a6cc9a', 2600);
    this.events.on('depot-caption', caption);
    const blur = () => {
      this.lostFocus = true;
      if (this.canPause()) this.togglePause();
    };
    const focus = () => { this.lostFocus = false; };
    this.game.events.on(Phaser.Core.Events.BLUR, blur);
    this.game.events.on(Phaser.Core.Events.FOCUS, focus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, blur);
      this.game.events.off(Phaser.Core.Events.FOCUS, focus);
      this.events.off('depot-caption', caption);
      this.storyView.clear();
      this.mobileLayer?.remove();
      this.mobileLayer = null;
      resizeObserver.disconnect();
      document.body.classList.remove('depot-mode');
      this.scale.getParentBounds();
      this.scale.refresh();
      this.input.keyboard?.removeAllListeners();
      audioSystem.stopMusic();
    });
  }

  private canPause(): boolean {
    return this.state === 'playing' || this.state === 'interlude' || this.state === 'story' || this.state === 'mall' || this.state === 'lot';
  }

  update(_time: number, delta: number): void {
    if (this.toastUntil < this.time.now) this.toast.setVisible(false);
    if (this.state === 'story' && this.cutscene) {
      this.updateStory(delta);
      this.updateConsole();
      return;
    }
    if (this.state === 'mall' && this.mall) {
      this.mall.update(delta, this.movement());
      for (const event of this.mall.drainEvents()) this.handleMallEvent(event);
      this.storyView.updateMall(this.mall, this.chapterHint);
      if (this.mall.finished) {
        this.mallBonus = this.mall.signatures * MALL_RULES.pointsPerSignature;
        this.story.go('to-ups');
        this.playScene(DRIVE_TO_UPS);
      }
      this.updateConsole();
      return;
    }
    if (this.state === 'lot' && this.lot) {
      this.lot.update(delta, this.movement());
      for (const event of this.lot.drainEvents()) {
        audioSystem.play(event.type === 'done' ? 'correct' : 'wrong');
        this.chapterHint = event.message;
      }
      this.storyView.updateLot(this.lot, this.chapterHint);
      if (this.lot.done) {
        this.story.go('home');
        this.playScene(GO_HOME);
      }
      this.updateConsole();
      return;
    }
    if (this.state === 'celebrating') {
      this.view.update(delta, this.model.activeWorker, 'overview');
      if (this.life.updateCelebration(delta)) {
        // The warehouse is done; Skanky's night is not.
        this.story.go('assignment');
        this.playScene(MALL_ASSIGNMENT);
      }
      return;
    }
    if (this.state === 'playing' && this.life.benInterludeReady) this.beginBenInterlude();
    if (this.state === 'interlude') {
      this.view.update(delta, this.model.activeWorker, 'interlude');
      if (this.life.updateBenInterlude(delta)) {
        this.state = 'playing';
        this.model.paused = false;
        this.input.keyboard?.resetKeys();
        this.tweens.resumeAll();
        audioSystem.startMusic('game');
        this.tell('BACK TO THE BELT', INK, 1800);
      }
      this.updateConsole();
      return;
    }
    if (this.state === 'playing' && this.story.breakDue(this.model.elapsedMs) && !this.model.ended) {
      this.beginBreak();
      return;
    }
    if (this.state === 'playing') this.mesa.update();
    const movement = this.state === 'playing' ? this.movement() : { x: 0, y: 0 };
    this.model.update(delta, movement);
    for (const event of this.model.drainEvents()) this.handleEvent(event);
    if (this.state === 'playing') {
      this.life.update();
      this.receiving.update();
    }
    if (this.state !== 'paused') this.syncWorld(this.state === 'playing' ? delta : 0);
    this.view.update(delta, this.model.activeWorker,
      this.state === 'playing' || this.state === 'countdown' ? 'follow'
        : this.state === 'briefing' || this.state === 'results' ? 'overview' : 'hold');
    this.updateConsole();
    if (this.model.ended && this.state === 'playing') {
      if (this.model.won) {
        this.state = 'celebrating'; this.model.paused = true;
        this.story.go('clockout');
        this.life.beginCelebration(); audioSystem.play('truck');
        this.tell('SHIFT COMPLETE', INK, 13000);
        this.updateConsole();
      } else this.showResults();
    }
  }

  private updateStory(delta: number): void {
    const cutscene = this.cutscene!;
    cutscene.update(delta);
    const beat = cutscene.takeEntered();
    if (beat) this.enterBeat(beat);
    if (cutscene.scene.location === 'depot') {
      this.storyFocus = this.life.directStory(cutscene, this.workers, (cue) => cueProgress(cutscene, cue));
      this.view.update(delta, this.model.activeWorker, 'story', this.storyFocus);
    } else {
      this.storyView.direct(cutscene, delta);
    }
    if (cutscene.done) this.finishScene();
  }

  private enterBeat(beat: StoryBeat): void {
    if (beat.sound) audioSystem.play(BEAT_SOUNDS[beat.sound]);
    this.storyView.showBeat(beat);
    // On the depot floor the cast speak in their own panels, as during the shift.
    if (beat.line && beat.speaker && this.cutscene?.scene.location === 'depot') this.life.say(beat.speaker, beat.line, Math.max(1600, beat.ms), 2);
  }

  // ---------------------------------------------------------------- story flow

  public startShift(): void {
    if (this.state !== 'briefing') return;
    this.overlay?.destroy(true);
    this.overlay = null;
    void audioSystem.unlock();
    audioSystem.play('ui-start');
    this.story.go('arrival');
    this.playScene(this.story.opener);
  }

  private playScene(scene: StoryScene): void {
    this.state = 'story';
    this.cutscene = new Cutscene(scene);
    this.touchMove = { x: 0, y: 0 };
    this.input.keyboard?.resetKeys();
    this.guide.clear();
    this.throwLabel.setVisible(false);
    // Shift notices belong to the shift; the story has its own subtitles.
    this.toast.setVisible(false);
    this.toastUntil = 0;
    this.storyView.beginScene(scene, () => this.cutscene?.userNext(), () => this.cutscene?.skip());
    this.updateConsole();
  }

  private finishScene(): void {
    const scene = this.cutscene?.scene;
    this.cutscene = null;
    if (!scene) return;
    if (scene.id.startsWith('opener')) {
      this.story.go('scrum');
      this.playScene(SCRUM);
    } else if (scene.id === 'scrum') {
      this.story.go('countdown');
      this.storyView.clear();
      this.startCountdown();
    } else if (this.story.chapter === 'break') {
      this.endBreak();
    } else if (scene.id === 'mall-assignment') {
      this.story.go('to-mall');
      this.playScene(DRIVE_TO_MALL);
    } else if (scene.id === 'drive-to-mall') {
      this.story.go('mall');
      this.playScene(MALL_INTRO);
    } else if (scene.id === 'mall-intro') {
      this.beginMall();
    } else if (scene.id === 'drive-to-ups') {
      this.story.go('return');
      this.beginLot();
    } else if (scene.id === 'go-home') {
      this.storyView.clear();
      this.showResults();
    }
  }

  private startCountdown(): void {
    this.state = 'countdown';
    this.syncWorld(0);
    const counter = this.view.screen(this.add.text(480, 348, '3', {
      fontFamily: 'Arial', fontSize: '76px', fontStyle: 'bold', color: '#f0dfb3',
      stroke: '#11252c', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(110));
    audioSystem.play('countdown');
    ['2', '1', 'SORT!'].forEach((copy, index) => this.time.delayedCall((index + 1) * 1000, () => {
      counter.setText(copy);
      audioSystem.play(copy === 'SORT!' ? 'countdown-go' : 'countdown');
    }));
    this.time.delayedCall(3350, () => {
      counter.destroy();
      this.state = 'playing';
      this.story.go('shift');
      this.model.paused = false;
      audioSystem.startMusic('game');
      this.tell('You are TERMITE. Approach the belt, then press SPACE. TAB switches.', '#edf0de', 6000);
      if (this.lostFocus) this.togglePause();
    });
  }

  /** The single random mid-shift break; the shift, belt and freight wait for the crew. */
  private beginBreak(): void {
    this.story.takeBreak(this.model.elapsedMs);
    this.story.go('break');
    this.model.paused = true;
    this.tweens.pauseAll();
    audioSystem.stopMusic();
    this.playScene(this.story.breakScene);
  }

  private endBreak(): void {
    this.story.go('shift');
    this.storyView.clear();
    this.state = 'playing';
    this.model.paused = false;
    this.input.keyboard?.resetKeys();
    this.touchMove = { x: 0, y: 0 };
    this.tweens.resumeAll();
    audioSystem.startMusic('game');
    this.tell('BACK TO THE BELT · same shift, same freight', INK, 2200);
  }

  private beginMall(): void {
    this.mall = new MallModel();
    this.state = 'mall';
    this.chapterHint = 'Take a store bundle from the truck';
    this.storyView.beginMall(() => undefined, () => undefined);
    audioSystem.startMusic('game');
  }

  private beginLot(): void {
    this.lot = new KeyReturnModel();
    this.state = 'lot';
    this.chapterHint = KEY_RETURN_LINES.prompt;
    this.storyView.beginLot(() => undefined, () => undefined);
  }

  private handleMallEvent(event: MallEvent): void {
    const sounds: Record<MallEvent['type'], SoundEffect> = {
      pick: 'grab', load: 'drop', cart: 'switch', drop: 'bulk', sign: 'sign', wrong: 'wrong', run: 'event-alert', done: 'correct',
    };
    audioSystem.play(sounds[event.type]);
    this.chapterHint = event.message;
    if (event.type === 'run' || event.type === 'done') this.tell(event.message, INK, 2600);
    if (event.type === 'sign' && event.storeId && this.mall) {
      const store = this.mall.store(event.storeId);
      this.storyView.history.push(`${store.name} CLERK: ${store.clerkLine}`);
      this.tell(`${store.name} CLERK: ${store.clerkLine}`, '#f0dfb3', 3000);
    }
  }

  private beginBenInterlude(): void {
    this.state = 'interlude';
    this.model.paused = true;
    this.touchMove = { x: 0, y: 0 };
    this.input.keyboard?.resetKeys();
    this.guide.clear();
    this.throwLabel.setVisible(false);
    this.toast.setVisible(false);
    this.depot.updateBelt(this.model.beltTravel, false);
    this.life.beginBenInterlude();
    this.tweens.pauseAll();
    audioSystem.stopMusic();
    this.updateConsole();
  }

  public togglePause(): void {
    if (this.canPause()) {
      this.pausedFrom = this.state as Resumable;
      this.state = 'paused';
      this.model.paused = true;
      if (this.mall) this.mall.paused = true;
      if (this.lot) this.lot.paused = true;
      this.touchMove = { x: 0, y: 0 };
      this.tweens.pauseAll();
      audioSystem.stopMusic();
      this.showPanel('TAKE A BREATHER', this.pausedFrom === 'interlude' || this.pausedFrom === 'story' ? 'STORY PAUSED' : this.pausedFrom === 'playing' ? 'SHIFT PAUSED' : 'PAUSED', [
        'Your parcels and shift clock are waiting.',
        'Move: WASD / arrows     Switch: TAB     Grab / deliver: SPACE     Throw: F',
        'Brake: E     Pause: ESC     Sound: M     Story: SPACE next, ENTER skip',
      ], 'RESUME  ↵', () => this.togglePause());
    } else if (this.state === 'paused') {
      this.overlay?.destroy(true);
      this.overlay = null;
      this.state = this.pausedFrom;
      this.model.paused = this.state !== 'playing';
      if (this.mall) this.mall.paused = false;
      if (this.lot) this.lot.paused = false;
      if (this.state === 'playing' || this.state === 'mall') { this.tweens.resumeAll(); audioSystem.startMusic('game'); }
    }
  }

  private bindControls(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    keyboard.addCapture(['SPACE', 'TAB', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    // Phaser may revisit queued DOM events when several keys arrive before
    // POST_STEP clears its queue. One physical press must cause one action.
    const handled = new WeakSet<KeyboardEvent>();
    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat || handled.has(event)) return;
      handled.add(event);
      if (event.code === 'KeyM') { this.toggleSound(); return; }
      if (event.code === 'Escape' || event.code === 'KeyP') { this.togglePause(); return; }
      if (event.code === 'Enter') {
        if (this.state === 'briefing') this.startShift();
        else if (this.state === 'story') this.cutscene?.skip();
        else if (this.state === 'paused') this.togglePause();
        else if (this.state === 'results') this.scene.restart();
        else if (this.state === 'celebrating') this.life.updateCelebration(13000);
        return;
      }
      if (event.code === 'KeyO' && this.state === 'briefing') { this.scene.start('TitleScene'); return; }
      if (this.state === 'story') { if (event.code === 'Space') this.cutscene?.userNext(); return; }
      if (this.state === 'mall') {
        if (event.code === 'Space') this.mall?.action();
        else if (event.code === 'KeyE') this.mall?.toggleCart();
        return;
      }
      if (this.state === 'lot') { if (event.code === 'Space') this.lot?.action(); return; }
      if (this.state !== 'playing') return;
      if (event.code === 'KeyV') this.view.toggleOverview();
      else if (event.code === 'Tab') this.model.switchWorker();
      else if (event.code === 'Space') this.model.action();
      else if (event.code === 'KeyE') this.model.brake();
      else if (event.code === 'KeyF') this.model.throwHeld();
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, hitObjects: Phaser.GameObjects.GameObject[]) => {
      if (hitObjects.length > 0) return;
      if (this.state === 'story') { if (!pointer.rightButtonDown()) this.cutscene?.userNext(); return; }
      if (this.state === 'mall') { if (!pointer.rightButtonDown()) this.mall?.action(); return; }
      if (this.state === 'lot') { if (!pointer.rightButtonDown()) this.lot?.action(); return; }
      if (this.state !== 'playing') return;
      if (pointer.rightButtonDown()) this.model.switchWorker();
      else if (pointer.y > 132 && pointer.y < 618) this.model.action();
    });
  }

  private movement(): { x: number; y: number } {
    const down = (key: string) => Number(this.keys?.[key]?.isDown ?? false);
    return {
      x: Math.sign(down('D') + down('RIGHT') - down('A') - down('LEFT') + this.touchMove.x),
      y: Math.sign(down('S') + down('DOWN') - down('W') - down('UP') + this.touchMove.y),
    };
  }

  private syncWorld(delta: number): void {
    this.depot.updateBelt(this.model.beltTravel, this.state === 'playing' && this.model.brakeRemainingMs <= 0 && !this.model.eventStopped);
    this.model.workers.forEach((worker, index) => {
      const visual = this.workers[index];
      const moving = delta > 0 && Phaser.Math.Distance.Between(visual.container.x, visual.container.y, worker.x, worker.y) > 0.1;
      visual.container.setPosition(worker.x, worker.y).setDepth(25 + worker.y / 1000);
      visual.update(this.reducedMotion ? 0 : this.time.now, moving, index === this.model.activeIndex, worker.heldId !== null, this.model.assistanceActive);
    });
    const visibleIds = new Set<number>();
    let backlogIndex = 0;
    for (const parcel of this.model.packages) {
      if (parcel.state === 'delivered') continue;
      let view = this.parcels.get(parcel.id);
      if (parcel.state === 'damaged') {
        // A broken parcel stays crushed where it landed for a while, then is cleared away for good.
        if (!view) continue;
        view.brokenAt ??= this.model.elapsedMs;
        if (this.model.elapsedMs - view.brokenAt > 8000) continue;
        visibleIds.add(parcel.id);
        if (view.state !== 'damaged') {
          view.state = 'damaged';
          view.container.setScale(1.1, 0.6).setRotation(0.4).setAlpha(0.85);
          view.container.add(this.add.text(0, -26, 'BROKEN', { fontFamily: 'Arial', fontSize: '9px', fontStyle: 'bold', color: '#fff6e8', backgroundColor: '#c23a2e' })
            .setOrigin(0.5).setPadding(4, 2));
        }
        view.container.setPosition(parcel.x, parcel.y).setDepth(19);
        continue;
      }
      visibleIds.add(parcel.id);
      if (!view) {
        view = { container: createParcelArt(this, parcel.route, parcel.size === 'heavy', parcel.kind), state: parcel.state, transferUntil: 0 };
        view.container.setPosition(parcel.x, parcel.y);
        this.parcels.set(parcel.id, view);
        if (this.state === 'playing') audioSystem.play('package-spawn');
        if (NEW_ROUTES.includes(parcel.route) && !this.seenRoutes.has(parcel.route)) {
          this.seenRoutes.add(parcel.route);
          this.tell(`NEW: ${parcel.route} · ${ROUTE_INFO[parcel.route].name} · ${ROUTE_INFO[parcel.route].caption}`, '#edba6d', 3600);
        }
      }
      if (view.state !== parcel.state) {
        if (parcel.state === 'held' && !this.reducedMotion) view.transferUntil = this.time.now + 120;
        view.state = parcel.state;
      }
      const container = view.container;
      updateParcelArt(container, parcel.kind, this.reducedMotion ? 0 : this.model.elapsedMs, parcel.broken, parcel.recovered);
      const isHeld = parcel.state === 'held';
      if (isHeld && this.time.now < view.transferUntil) {
        const blend = Math.min(1, delta / 30);
        container.x += (parcel.x - container.x) * blend;
        container.y += (parcel.y - container.y) * blend;
      } else if (parcel.state === 'thrown' && parcel.flight) {
        // In the air: an arc above its ground track, spinning.
        const t = parcel.flight.elapsedMs / parcel.flight.durationMs;
        container.setPosition(parcel.x, parcel.y - Math.sin(t * Math.PI) * 40).setRotation(this.reducedMotion ? 0 : t * Math.PI * 2);
      } else container.setPosition(parcel.x, parcel.y).setRotation(0);
      if (parcel.state === 'missed') {
        container.setPosition(SHIFT_LAYOUT.recoveryPile.x - 2 + (backlogIndex % 2) * 6, SHIFT_LAYOUT.recoveryPile.y - backlogIndex * 5);
        backlogIndex += 1;
      }
      container.setDepth(isHeld || parcel.state === 'thrown' ? 28 : parcel.state === 'missed' ? 21 + backlogIndex / 10 : 20);
    }
    for (const [id, view] of this.parcels) {
      if (!visibleIds.has(id)) { view.container.destroy(true); this.parcels.delete(id); }
    }
    this.drawGuidance();
  }

  private drawGuidance(): void {
    this.guide.clear();
    this.throwLabel.setVisible(false);
    const worker = this.model.activeWorker;
    const parcel = this.model.packages.find(item => item.id === worker.heldId);
    this.depot.setDockActive(parcel?.route ?? null);
    if (this.state !== 'playing') return;
    if (parcel) {
      const info = ROUTE_INFO[parcel.route];
      const target = parcel.route === 'C'
        ? worker.side === 'left' ? SHIFT_LAYOUT.bulkLeft : SHIFT_LAYOUT.bulkRight
        : SHIFT_LAYOUT.dropAreas[parcel.route];
      const targetX = target.x;
      const targetY = target.y;
      if (info.side === 'both' || info.side === worker.side) {
        const throwTarget = this.model.throwTarget();
        this.guide.lineStyle(2, ROUTE[parcel.route], 0.32);
        const length = Phaser.Math.Distance.Between(worker.x, worker.y, targetX, targetY);
        for (let distance = 24; distance < length - 20; distance += 15) {
          const t = distance / length;
          // A throwable parcel previews its arc; otherwise the dots trace the walk.
          const lift = throwTarget?.ok ? Math.sin(t * Math.PI) * 36 : 0;
          this.guide.fillStyle(ROUTE[parcel.route], throwTarget?.ok ? 0.85 : 0.55);
          this.guide.fillCircle(Phaser.Math.Linear(worker.x, targetX, t), Phaser.Math.Linear(worker.y, targetY, t) - lift, 2);
        }
        this.guide.strokeCircle(targetX, targetY, 25);
        if (throwTarget?.ok) {
          this.throwLabel.setText(`F · THROW · ${Math.round(throwTarget.breakChance * 100)}% RISK`)
            .setBackgroundColor(`#${ROUTE[parcel.route].toString(16).padStart(6, '0')}`).setPosition(targetX, targetY - 34).setVisible(true);
        }
      }
    } else {
      const nearest = this.model.nearestPackage();
      if (nearest) {
        this.guide.lineStyle(2, ROUTE[nearest.route], 0.9);
        const view = this.parcels.get(nearest.id)?.container;
        this.guide.strokeRoundedRect((view?.x ?? nearest.x) - 29, (view?.y ?? nearest.y) - 24, 58, 48, 5);
      }
    }
  }

  private drawConsole(): void {
    const g = this.view.screen(this.add.graphics().setDepth(60));
    g.fillStyle(0x10232a).fillRect(0, 0, 960, 126);
    g.fillStyle(0x27424a).fillRect(0, 125, 960, 2);
    g.fillStyle(0xedba6d).fillRect(28, 27, 5, 43);
    this.label(46, 21, 'THE BELT', 35, INK, true);
    this.label(47, 62, 'NIGHT SORT SIMULATOR', 10, MUTED, true).setLetterSpacing(1);
    this.label(320, 25, 'DISPATCHED', 10, MUTED, true).setLetterSpacing(1);
    this.countText = this.label(320, 43, `00 / ${this.model.goal}`, 26, INK, true);
    this.label(487, 25, 'SHIFT SCORE', 10, MUTED, true).setLetterSpacing(1);
    this.scoreText = this.label(487, 43, '00000', 26, INK, true);
    this.label(665, 25, 'TIME LEFT', 10, MUTED, true).setLetterSpacing(1);
    this.clockText = this.label(665, 43, '03:00', 26, '#edba6d', true);
    this.pauseText = this.textButton(817, 31, 'Ⅱ PAUSE', () => this.togglePause(), 12);
    this.soundText = this.textButton(817, 61, this.muted ? '♪ SOUND OFF' : '♪ SOUND ON', () => this.toggleSound(), 11);
    this.statusText = this.label(28, 98, '01   /   FIND YOUR RHYTHM', 12, '#76cbd1', true);
    this.viewText = this.textButton(244, 98, '[ V ] OVERVIEW', () => {
      if (this.state === 'playing') this.view.toggleOverview();
    }, 10);
    this.comboText = this.label(400, 98, '', 12, '#edba6d', true);
    this.label(703, 98, 'BACKLOG', 10, MUTED, true).setLetterSpacing(1);
    this.consoleGraphics = this.view.screen(this.add.graphics().setDepth(62));

    g.fillStyle(0x10232a).fillRect(0, 620, 960, 100);
    g.fillStyle(0x39515a).fillRect(0, 620, 960, 2);
    this.operatorText = this.label(28, 638, '● TERMITE', 14, '#76cbd1', true);
    this.actionText = this.label(205, 638, 'Approach a parcel to pick it up', 14, INK, true);
    this.brakeText = this.textButton(758, 638, '[ E ]  BRAKE READY', () => {
      if (this.state === 'playing') this.model.brake();
    }, 12);
    this.label(28, 676, 'WASD / ↑↓←→  MOVE', 11, MUTED, true);
    this.label(220, 676, 'TAB  SWITCH', 11, MUTED, true);
    this.label(370, 676, 'SPACE / CLICK  GRAB · DELIVER', 11, MUTED, true);
    this.label(640, 676, 'F  THROW', 11, MUTED, true);
    this.label(789, 676, 'ESC  PAUSE', 11, MUTED, true);
    this.label(28, 702, 'SORT FAST. MISS NOTHING. SURVIVE THE SHIFT.', 8, '#637f87', true).setLetterSpacing(1.5);
    this.label(470, 700, 'TERMITE  A · D · T        SKANKY  B · E · S        BOTH  C · BULK', 9, '#b0c1c1', true).setLetterSpacing(1);
    this.toast = this.label(480, 157, '', 14, INK, true).setOrigin(0.5).setDepth(96)
      .setPadding(14, 9).setBackgroundColor('#10232a').setVisible(false);
  }

  private updateConsole(): void {
    const m = this.model;
    const seconds = Math.ceil((m.phase === 'cleanup' ? m.cleanupLeftMs : m.timeLeftMs) / 1000);
    this.scoreText.setText(String(m.score).padStart(5, '0'));
    this.countText.setText(`${String(m.sorted).padStart(2, '0')} / ${m.goal}`);
    this.clockText.setText(`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    this.clockText.setColor(seconds <= 15 ? '#f3987c' : '#edba6d');
    const phases = { lesson: '01   /   FIND YOUR RHYTHM', flow: '02   /   KEEP IT MOVING', rush: '03   /   LAST DISPATCH', cleanup: '04   /   CLEAR THE LINE', ended: 'SHIFT COMPLETE' };
    this.statusText.setText(phases[m.phase]);
    this.comboText.setText(m.combo > 1 ? `${m.combo} IN A ROW  /  +${Math.min(m.combo * 15, 150)} NEXT` : `TARGET  /  ${m.goal} CLEAN DISPATCHES`);
    const player = m.activeWorker;
    this.operatorText.setText(`● ${player.id.toUpperCase()}${m.assistanceActive ? ' + AUTO' : ''}`).setColor(player.side === 'left' ? '#76cbd1' : '#a6cc9a');
    const held = m.packages.find(item => item.id === player.heldId);
    const nearby = m.nearestPackage();
    if (held) {
      const info = ROUTE_INFO[held.route];
      const wrongSide = info.side !== 'both' && info.side !== player.side;
      const inDock = m.currentDock() === held.route;
      const target = m.throwTarget();
      this.actionText.setText(wrongSide ? `ROUTE ${held.route} · return to belt, then TAB to hand off`
        : inDock ? `[ SPACE ]  DELIVER ${ROUTE_NAME[held.route]}`
        : `${held.label}  →  ${ROUTE_NAME[held.route]}  /  ${target?.ok ? `F THROWS (${Math.round(target.breakChance * 100)}% RISK)` : 'SPACE puts down'}`);
    } else this.actionText.setText(nearby ? `[ SPACE ] ${nearby.state === 'missed' ? 'RECOVER' : 'GRAB'} ${nearby.label} · ${nearby.route}` : 'Approach the belt · match letter to dock');
    this.brakeText.setText(m.eventStopped ? '■  VIC STOPPED THE BELT' : m.brakeRemainingMs > 0 ? '■  BELT BRAKED'
      : m.brakeCooldownMs > 0 ? `[ E ]  RECHARGE ${Math.ceil(m.brakeCooldownMs / 1000)}s` : '[ E ]  BRAKE READY');
    this.pauseText.setText(this.state === 'paused' ? '▶ RESUME' : 'Ⅱ PAUSE');
    this.viewText.setText(this.view.overview ? '[ V ] CLOSE VIEW' : '[ V ] OVERVIEW');
    if (this.state === 'interlude' || (this.state === 'paused' && this.pausedFrom === 'interlude')) {
      this.statusText.setText('BEN / DODGE TRAINING');
      this.comboText.setText('SHIFT & BELT PAUSED');
      this.operatorText.setText('◆ BEN’S BIG MOMENT');
      this.actionText.setText('Belt held · your freight is safe');
      this.brakeText.setText('■  BELT HELD');
    }
    this.consoleGraphics.clear();
    for (let i = 0; i < m.capacity; i++) {
      this.consoleGraphics.fillStyle(i < m.pileup ? 0xf3987c : 0x2b424b);
      this.consoleGraphics.fillRoundedRect(790 + i * 26, 96, 18, 9, 2);
    }
    this.consoleGraphics.fillStyle(0x26444c).fillRect(320, 80, 109, 3);
    this.consoleGraphics.fillStyle(0x76cbd1).fillRect(320, 80, 109 * Math.min(1, m.sorted / m.goal), 3);
    if (this.mobileLayer) {
      const live = this.state === 'playing' || this.state === 'story' || this.state === 'mall' || this.state === 'lot';
      this.mobileLayer.style.visibility = live ? 'visible' : 'hidden';
      const labels = this.state === 'story' ? ['SKIP', 'NEXT', '—', '—'] : this.state === 'mall' ? ['—', 'ACT', this.mall?.cart.pushed ? 'PARK' : 'CART', '—']
        : this.state === 'lot' ? ['—', 'ACT', '—', '—'] : ['SWITCH', 'GRAB / DELIVER', 'BRAKE', 'THROW'];
      ['switch', 'grab', 'brake', 'throw'].forEach((key, index) => {
        const button = this.mobileButtons[key];
        if (!button) return;
        if (button.textContent !== labels[index]) button.textContent = labels[index];
        button.style.visibility = labels[index] === '—' ? 'hidden' : '';
      });
    }
  }

  private handleEvent(event: ShiftEvent): void {
    this.life.onEvent(event);
    const sounds: Partial<Record<ShiftEvent['type'], SoundEffect>> = {
      grab: 'grab', drop: 'drop', sort: 'correct', wrong: 'wrong', miss: 'pile-up',
      recover: 'dig', brake: 'belt-stop', switch: 'switch', phase: 'event-alert', end: 'shift-end',
      brian: 'event-alert', spill: 'drop', throw: 'throw', damage: 'smash',
    };
    const sound = sounds[event.type];
    if (sound) audioSystem.play(sound);
    if (event.type === 'throw' && event.packageId !== undefined && event.workerId) this.throwers.set(event.packageId, event.workerId);
    if (event.type === 'sort') {
      const deliverySide = event.x < 480 ? 'left' : 'right';
      const delivered = event.packageId === undefined ? undefined : this.parcels.get(event.packageId);
      const floor = event.route === 'T' || event.route === 'S';
      if (delivered && event.packageId !== undefined) {
        this.parcels.delete(event.packageId);
        this.tweens.add({
          targets: delivered.container,
          x: event.route === 'C' ? SHIFT_LAYOUT.bulkPile.x : floor ? event.x : deliverySide === 'left' ? 296 : 664,
          y: event.y,
          scale: floor ? 0.7 : 0.8, alpha: 0,
          duration: this.reducedMotion ? 80 : 300,
          ease: 'Cubic.In',
          onComplete: () => delivered.container.destroy(true),
        });
      }
      if (floor) {
        const count = (route: 'T' | 'S') => this.model.packages.filter((parcel) => parcel.route === route && parcel.state === 'delivered' && parcel.pileIndex !== undefined).length;
        this.depot.setFloorPiles({ T: count('T'), S: count('S') });
      }
      if (event.route) this.depot.flashDock(event.route, deliverySide);
      this.floatText(event.x, event.y - 43, `+${event.score ?? 100}  ${event.message.startsWith('THROWN') ? 'THROWN IN' : 'DISPATCHED'}`, '#a6cc9a');
      if (!this.reducedMotion) {
        const ring = this.add.circle(event.x, event.y, 13).setStrokeStyle(2, event.route ? ROUTE[event.route] : 0xa6cc9a).setDepth(32);
        this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 330, onComplete: () => ring.destroy() });
      }
    }
    if (event.type === 'damage') {
      const lost = Math.abs(event.score ?? 0);
      this.floatText(event.x, event.y - 43, `BROKEN  −${lost}`, '#f3987c');
      this.tell(`${event.message.replace(/ · -\d+$/, '')} · no credit · −${lost} points`, '#f3987c', 3200);
      const thrower = this.model.workers.find((worker) => worker.id === (event.packageId !== undefined ? this.throwers.get(event.packageId) : undefined)) ?? this.model.activeWorker;
      this.life.shanBreakage(thrower);
      if (!this.reducedMotion) {
        for (let i = 0; i < 8; i += 1) {
          const bit = this.add.rectangle(event.x, event.y, 5, 5, 0xb8875a).setDepth(30);
          this.tweens.add({ targets: bit, x: event.x + Math.cos(i) * 30, y: event.y + Math.sin(i) * 20, alpha: 0, duration: 500, onComplete: () => bit.destroy() });
        }
      }
    }
    if (event.type === 'spill') {
      const spill = this.add.ellipse(event.x, event.y + 8, 34, 11, 0xda8db6, 0.62).setDepth(8);
      this.tweens.add({ targets: spill, scaleX: 1.35, alpha: 0, duration: 4200, onComplete: () => spill.destroy() });
    }
    if ((!event.workerId || event.workerId === this.model.activeWorker.id)
      && ['wrong', 'miss', 'phase', 'brian', 'recover', 'brake'].includes(event.type)) {
      this.tell(event.type === 'wrong' ? `NO SCORE · ${event.message}` : event.message, event.type === 'wrong' || event.type === 'miss' ? '#f3987c' : INK, 3300);
    }
  }

  private floatText(x: number, y: number, copy: string, color: string): void {
    const text = this.view.worldObject(this.label(x, y, copy, 12, color, true).setOrigin(0.5).setDepth(72).setPadding(7, 5).setBackgroundColor('#10232a'));
    this.tweens.add({ targets: text, y: y - (this.reducedMotion ? 0 : 25), alpha: 0, delay: 350, duration: 600, onComplete: () => text.destroy() });
  }

  private tell(copy: string, color: string, duration: number): void {
    this.toast.setText(copy).setColor(color).setVisible(true);
    this.toastUntil = this.time.now + duration;
  }

  private showBriefing(): void {
    this.showPanel('TERMITE & SKANKY / ONE MORE OVERNIGHT', 'ANOTHER NIGHT ON THE BELT.', [
      `Get in, survive the scrum, dispatch ${this.model.goal} parcels, then Skanky has a mall run.`,
      'TERMITE: A + D trucks, T down the stairs.   SKANKY: B + E trucks, S down the stairs.',
      'C goes to BULK. After 36 seconds your partner sorts their own routes automatically.',
      'SPACE grabs and delivers. F throws to save the walk, but it can break.',
      'WASD moves. TAB switches. E brakes. V overview. Story: SPACE next, ENTER skips.',
    ], 'START THE NIGHT  ↵', () => this.startShift());
    const original = this.textButton(480, 543, 'O  /  PLAY THE ORIGINAL FULL SHIFT', () => this.scene.start('TitleScene'), 11).setOrigin(0.5);
    this.overlay?.add(original);
  }

  private showResults(): void {
    this.state = 'results';
    this.story.go('results');
    this.model.paused = true;
    const m = this.model;
    audioSystem.startMusic('results');
    const dispatchRate = m.packages.length === 0 ? 0 : Math.round(m.sorted / m.packages.length * 100);
    const home = this.lot?.done === true;
    const mall = this.mall;
    this.showPanel(m.won ? `SHIFT COMPLETE / GRADE ${m.grade}` : 'SHIFT TERMINATED / YOU FAILED THE SORT',
      m.pileup >= m.capacity ? 'PILE-UP OVERFLOW' : home ? 'HOME. FINALLY.' : m.gradeQuote, [
        `${m.sorted} DISPATCHED       ${String(m.score).padStart(5, '0')} POINTS       ${m.bestCombo} BEST STREAK`,
        `${dispatchRate}% of freight dispatched · ${m.missed} parcels reached the belt end · ${m.bulkSorted} to bulk`,
        `${m.thrownDeliveries} thrown in clean · ${m.damaged} broken (−${m.breakagePenalty} points)${m.gradedBreaks ? ` · ${m.gradedBreaks} against the grade` : ''}`,
        mall ? `MALL RUN · ${mall.delivered}/6 delivered · ${mall.signatures}/6 signed · five-ton ${home ? 'returned' : 'not returned'} · +${this.mallBonus}`
          : m.pileup >= m.capacity ? 'Recover a missed parcel at the belt exit with SPACE.' : `${m.assistedSorted} partner deliveries · focus on your routes; use C for shared bulk.`,
        mall ? `NIGHT TOTAL ${String(m.score + this.mallBonus).padStart(5, '0')} · ${m.gradeQuote}` : 'The full original shift is still available.',
      ], 'ANOTHER NIGHT  ↵', () => this.scene.restart());
    const original = this.textButton(480, 543, 'PLAY THE ORIGINAL FULL SHIFT', () => this.scene.start('TitleScene'), 11).setOrigin(0.5);
    this.overlay?.add(original);
  }

  private showMesaCaught(): void {
    this.state = 'results'; this.model.paused = true;
    this.story.go('results');
    audioSystem.play('wrong');
    this.showPanel('SHIFT TERMINATED', MESA.caught, [
      MESA.caughtDetail, 'GAME OVER',
      'Vic offered a one-in-five risk. This time Shan caught you both.',
    ], 'ANOTHER SHIFT  ↵', () => this.scene.restart());
    this.updateConsole();
  }

  private showPanel(kicker: string, title: string, lines: string[], button: string, action: () => void): void {
    this.overlay?.destroy(true);
    const shade = this.add.rectangle(480, 374, 960, 492, 0x07171e, 0.77).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(0x1a333c).fillRoundedRect(145, 199, 670, 369, 10);
    panel.lineStyle(1, 0x486168).strokeRoundedRect(145, 199, 670, 369, 10);
    panel.fillStyle(0xedba6d).fillRect(174, 226, 29, 3);
    const items: Phaser.GameObjects.GameObject[] = [shade, panel,
      this.label(217, 221, kicker, 10, '#edba6d', true).setLetterSpacing(2),
      this.label(174, 252, title, 29, INK, true)];
    lines.forEach((line, index) => items.push(this.label(174, 305 + index * 28, line, 13, index === 0 ? INK : '#b0c1c1', index === 0)));
    const start = this.add.rectangle(480, 495, 320, 44, 0xedba6d).setInteractive({ useHandCursor: true });
    start.on('pointerover', () => start.setFillStyle(0xffd496));
    start.on('pointerout', () => start.setFillStyle(0xedba6d));
    start.on('pointerdown', action);
    items.push(start, this.label(480, 495, button, 15, '#142932', true).setOrigin(0.5));
    this.overlay = this.view.screen(this.add.container(0, 0, items).setDepth(100));
  }

  private label(x: number, y: number, copy: string, size: number, color: string, bold = false): Phaser.GameObjects.Text {
    return this.view.screen(this.add.text(x, y, copy, { fontFamily: '"Trebuchet MS", Arial, sans-serif', fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' }).setDepth(64));
  }

  private textButton(x: number, y: number, copy: string, action: () => void, size = 12): Phaser.GameObjects.Text {
    const text = this.label(x, y, copy, size, '#c0d2cf', true).setInteractive({ useHandCursor: true });
    text.on('pointerdown', action);
    text.on('pointerover', () => text.setColor('#edba6d'));
    text.on('pointerout', () => text.setColor('#c0d2cf'));
    return text;
  }

  private toggleSound(): void {
    this.muted = audioSystem.toggleMuted();
    this.soundText.setText(this.muted ? '♪ SOUND OFF' : '♪ SOUND ON');
  }

  private createTouchControls(): void {
    if (!this.sys.game.device.input.touch) return;
    const layer = document.createElement('div');
    layer.className = 'depot-touch';
    layer.setAttribute('aria-label', 'Game controls');
    const stick = document.createElement('div');
    stick.className = 'depot-stick';
    stick.setAttribute('aria-label', 'Drag to move worker');
    const knob = document.createElement('span');
    knob.textContent = '✥';
    stick.append(knob);
    let pointerId: number | null = null;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const rect = stick.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      this.touchMove = { x: Math.abs(x) > 9 ? Math.sign(x) : 0, y: Math.abs(y) > 9 ? Math.sign(y) : 0 };
      const length = Math.max(1, Math.hypot(x, y) / 28);
      knob.style.transform = `translate(${x / length}px, ${y / length}px)`;
    };
    stick.addEventListener('pointerdown', event => { pointerId = event.pointerId; stick.setPointerCapture(pointerId); move(event); });
    stick.addEventListener('pointermove', move);
    const release = () => { pointerId = null; this.touchMove = { x: 0, y: 0 }; knob.style.transform = ''; };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
    stick.addEventListener('lostpointercapture', release);
    const rail = document.createElement('div');
    rail.className = 'depot-actions';
    // The same buttons act per chapter: story SKIP/NEXT, mall ACT/CART.
    const actions: [string, string, () => void][] = [
      ['switch', 'SWITCH', () => { if (this.state === 'playing') this.model.switchWorker(); else if (this.state === 'story') this.cutscene?.skip(); }],
      ['grab', 'GRAB / DELIVER', () => {
        if (this.state === 'playing') this.model.action();
        else if (this.state === 'story') this.cutscene?.userNext();
        else if (this.state === 'mall') this.mall?.action();
        else if (this.state === 'lot') this.lot?.action();
      }],
      ['brake', 'BRAKE', () => { if (this.state === 'playing') this.model.brake(); else if (this.state === 'mall') this.mall?.toggleCart(); }],
      ['throw', 'THROW', () => { if (this.state === 'playing') this.model.throwHeld(); }],
    ];
    for (const [key, name, action] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.dataset.touch = key;
      button.addEventListener('pointerdown', event => { event.preventDefault(); action(); });
      rail.append(button);
      this.mobileButtons[key] = button;
    }
    layer.append(stick, rail);
    document.body.append(layer);
    this.mobileLayer = layer;
  }
}
