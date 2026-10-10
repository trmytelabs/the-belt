import Phaser from 'phaser';

import { DepotArt, createParcelArt, createWorkerArt, updateParcelArt } from '../slice/DepotArt';
import { DepotLife } from '../slice/DepotLife';
import { DepotMesaEncounter } from '../slice/DepotMesaEncounter';
import { MESA } from '../slice/DepotReferences';
import { ShiftModel, type ShiftEvent, type Route } from '../slice/ShiftModel';
import { audioSystem, type SoundEffect } from '../systems/AudioSystem';

const INK = '#edf0de';
const MUTED = '#8da7ac';
const ROUTE: Record<Route, number> = { A: 0x76cbd1, B: 0xa6cc9a, C: 0xedba6d };
const ROUTE_NAME: Record<Route, string> = { A: 'A · HERES UR SOVICE', B: 'B · PAYTMAN', C: 'C · BULK' };
type ParcelView = { container: Phaser.GameObjects.Container; state: string; transferUntil: number };

/** A bounded art/gameplay review slice. The original full shift remains accessible. */
export class DepotScene extends Phaser.Scene {
  public model!: ShiftModel;
  public state: 'briefing' | 'countdown' | 'playing' | 'paused' | 'mesa' | 'celebrating' | 'results' = 'briefing';
  private depot!: DepotArt;
  private life!: DepotLife;
  private mesa!: DepotMesaEncounter;
  private workers: ReturnType<typeof createWorkerArt>[] = [];
  private parcels = new Map<number, ParcelView>();
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
  private toast!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Container | null = null;
  private toastUntil = 0;
  private mobileLayer: HTMLDivElement | null = null;
  private touchMove = { x: 0, y: 0 };
  private muted = false;
  private reducedMotion = false;
  private lostFocus = false;

  constructor() { super('DepotScene'); }

  create(): void {
    this.model = new ShiftModel();
    this.model.paused = true;
    this.state = 'briefing';
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
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.cameras.main.setBackgroundColor('#11252c');
    this.depot = new DepotArt(this);
    this.life = new DepotLife(this, this.model, this.depot);
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
    this.workers = this.model.workers.map(worker => createWorkerArt(this, worker.side));
    this.drawConsole();
    this.bindControls();
    this.createTouchControls();
    this.showBriefing();
    this.syncWorld(0);
    this.updateConsole();
    audioSystem.stopMusic();
    const blur = () => {
      this.lostFocus = true;
      if (this.state === 'playing') this.togglePause();
    };
    const focus = () => { this.lostFocus = false; };
    this.game.events.on(Phaser.Core.Events.BLUR, blur);
    this.game.events.on(Phaser.Core.Events.FOCUS, focus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, blur);
      this.game.events.off(Phaser.Core.Events.FOCUS, focus);
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

  update(_time: number, delta: number): void {
    if (this.state === 'celebrating') {
      if (this.life.updateCelebration(delta)) this.showResults();
      return;
    }
    if (this.state === 'playing') this.mesa.update();
    const movement = this.state === 'playing' ? this.movement() : { x: 0, y: 0 };
    this.model.update(delta, movement);
    for (const event of this.model.drainEvents()) this.handleEvent(event);
    if (this.state === 'playing') this.life.update();
    this.syncWorld(this.state === 'playing' ? delta : 0);
    this.updateConsole();
    if (this.model.ended && this.state !== 'results') {
      if (this.model.won) {
        this.state = 'celebrating'; this.model.paused = true;
        this.life.beginCelebration(); audioSystem.play('truck');
        this.tell('SHIFT COMPLETE', INK, 13000);
        this.updateConsole();
      } else this.showResults();
    }
    if (this.toastUntil < this.time.now) this.toast.setVisible(false);
  }

  public startShift(): void {
    if (this.state !== 'briefing') return;
    this.overlay?.destroy(true);
    this.overlay = null;
    this.state = 'countdown';
    void audioSystem.unlock();
    audioSystem.play('ui-start');
    const counter = this.add.text(480, 348, '3', {
      fontFamily: 'Arial', fontSize: '76px', fontStyle: 'bold', color: '#f0dfb3',
      stroke: '#11252c', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(110);
    audioSystem.play('countdown');
    ['2', '1', 'SORT!'].forEach((copy, index) => this.time.delayedCall((index + 1) * 1000, () => {
      counter.setText(copy);
      audioSystem.play(copy === 'SORT!' ? 'countdown-go' : 'countdown');
    }));
    this.time.delayedCall(3350, () => {
      counter.destroy();
      this.state = 'playing';
      this.model.paused = false;
      audioSystem.startMusic('game');
      this.tell('First pickup: approach the belt, then press SPACE.', '#edf0de', 6000);
      if (this.lostFocus) this.togglePause();
    });
  }

  public togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.model.paused = true;
      this.touchMove = { x: 0, y: 0 };
      audioSystem.stopMusic();
      this.showPanel('TAKE A BREATHER', 'SHIFT PAUSED', [
        'Your parcels and shift clock are waiting.',
        'Move: WASD / arrows     Switch: TAB     Grab / deliver: SPACE',
        'Brake: E     Pause: ESC     Sound: M',
      ], 'RESUME SHIFT', () => this.togglePause());
    } else if (this.state === 'paused') {
      this.overlay?.destroy(true);
      this.overlay = null;
      this.state = 'playing';
      this.model.paused = false;
      audioSystem.startMusic('game');
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
        else if (this.state === 'paused') this.togglePause();
        else if (this.state === 'results') this.scene.restart();
        else if (this.state === 'celebrating') this.showResults();
        return;
      }
      if (event.code === 'KeyO' && this.state === 'briefing') { this.scene.start('TitleScene'); return; }
      if (this.state !== 'playing') return;
      if (event.code === 'Tab') this.model.switchWorker();
      else if (event.code === 'Space') this.model.action();
      else if (event.code === 'KeyE') this.model.brake();
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, hitObjects: Phaser.GameObjects.GameObject[]) => {
      if (this.state !== 'playing' || hitObjects.length > 0) return;
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
      visual.update(this.reducedMotion ? 0 : this.time.now, moving, index === this.model.activeIndex, worker.heldId !== null);
    });
    const visibleIds = new Set<number>();
    let backlogIndex = 0;
    for (const parcel of this.model.packages) {
      if (parcel.state === 'delivered') continue;
      visibleIds.add(parcel.id);
      let view = this.parcels.get(parcel.id);
      if (!view) {
        view = { container: createParcelArt(this, parcel.route, parcel.size === 'heavy', parcel.kind), state: parcel.state, transferUntil: 0 };
        view.container.setPosition(parcel.x, parcel.y);
        this.parcels.set(parcel.id, view);
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
      } else container.setPosition(parcel.x, parcel.y);
      if (parcel.state === 'missed') {
        container.setPosition(478 + (backlogIndex % 2) * 6, 600 - backlogIndex * 7);
        backlogIndex += 1;
      }
      container.setDepth(isHeld ? 28 : parcel.state === 'missed' ? 21 + backlogIndex / 10 : 20);
    }
    for (const [id, view] of this.parcels) {
      if (!visibleIds.has(id)) { view.container.destroy(true); this.parcels.delete(id); }
    }
    this.drawGuidance();
  }

  private drawGuidance(): void {
    this.guide.clear();
    const worker = this.model.activeWorker;
    const parcel = this.model.packages.find(item => item.id === worker.heldId);
    this.depot.setDockActive(parcel?.route ?? null);
    if (this.state !== 'playing') return;
    if (parcel) {
      const routeSide = parcel.route === 'A' ? 'left' : parcel.route === 'B' ? 'right' : worker.side;
      const targetX = routeSide === 'left' ? 275 : 685;
      const targetY = parcel.route === 'C' ? 492 : 300;
      if (routeSide === worker.side) {
        this.guide.lineStyle(2, ROUTE[parcel.route], 0.32);
        const length = Phaser.Math.Distance.Between(worker.x, worker.y, targetX, targetY);
        for (let distance = 24; distance < length - 20; distance += 15) {
          const t = distance / length;
          this.guide.fillStyle(ROUTE[parcel.route], 0.55);
          this.guide.fillCircle(Phaser.Math.Linear(worker.x, targetX, t), Phaser.Math.Linear(worker.y, targetY, t), 2);
        }
        this.guide.strokeCircle(targetX, targetY, 25);
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
    const g = this.add.graphics().setDepth(60);
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
    this.comboText = this.label(400, 98, '', 12, '#edba6d', true);
    this.label(703, 98, 'BACKLOG', 10, MUTED, true).setLetterSpacing(1);
    this.consoleGraphics = this.add.graphics().setDepth(62);

    g.fillStyle(0x10232a).fillRect(0, 620, 960, 100);
    g.fillStyle(0x39515a).fillRect(0, 620, 960, 2);
    this.operatorText = this.label(28, 638, '● TERMITE', 14, '#76cbd1', true);
    this.actionText = this.label(205, 638, 'Approach a parcel to pick it up', 14, INK, true);
    this.brakeText = this.textButton(758, 638, '[ E ]  BRAKE READY', () => {
      if (this.state === 'playing') this.model.brake();
    }, 12);
    this.label(28, 676, 'WASD / ↑↓←→  MOVE', 11, MUTED, true);
    this.label(260, 676, 'TAB  SWITCH', 11, MUTED, true);
    this.label(447, 676, 'SPACE / CLICK  GRAB · DELIVER', 11, MUTED, true);
    this.label(789, 676, 'ESC  PAUSE', 11, MUTED, true);
    this.label(28, 702, 'SORT FAST. MISS NOTHING. SURVIVE THE SHIFT.', 8, '#637f87', true).setLetterSpacing(1.5);
    this.toast = this.label(480, 157, '', 14, INK, true).setOrigin(0.5).setDepth(75)
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
    this.operatorText.setText(`● ${player.id.toUpperCase()}`).setColor(player.side === 'left' ? '#76cbd1' : '#a6cc9a');
    const held = m.packages.find(item => item.id === player.heldId);
    const nearby = m.nearestPackage();
    if (held) {
      const wrongSide = (held.route === 'A' && player.side === 'right') || (held.route === 'B' && player.side === 'left');
      const inDock = (player.side === 'left' ? player.x <= 312 : player.x >= 648)
        && Math.abs(player.y - (held.route === 'C' ? 492 : 300)) <= 56;
      this.actionText.setText(wrongSide ? `ROUTE ${held.route} · return to belt, then TAB to hand off`
        : inDock ? `[ SPACE ]  DELIVER ${ROUTE_NAME[held.route]}`
        : `${held.label}  →  ${held.route === 'C' ? 'C BULK' : held.route === 'A' ? 'A LEFT' : 'B RIGHT'}  /  SPACE puts down`);
    } else this.actionText.setText(nearby ? `[ SPACE ] ${nearby.state === 'missed' ? 'RECOVER' : 'GRAB'} ${nearby.label} · ${nearby.route}` : 'Approach the belt · match letter to dock');
    this.brakeText.setText(m.eventStopped ? '■  VIC STOPPED THE BELT' : m.brakeRemainingMs > 0 ? '■  BELT BRAKED'
      : m.brakeCooldownMs > 0 ? `[ E ]  RECHARGE ${Math.ceil(m.brakeCooldownMs / 1000)}s` : '[ E ]  BRAKE READY');
    this.pauseText.setText(this.state === 'paused' ? '▶ RESUME' : 'Ⅱ PAUSE');
    this.consoleGraphics.clear();
    for (let i = 0; i < m.capacity; i++) {
      this.consoleGraphics.fillStyle(i < m.pileup ? 0xf3987c : 0x2b424b);
      this.consoleGraphics.fillRoundedRect(790 + i * 26, 96, 18, 9, 2);
    }
    this.consoleGraphics.fillStyle(0x26444c).fillRect(320, 80, 109, 3);
    this.consoleGraphics.fillStyle(0x76cbd1).fillRect(320, 80, 109 * Math.min(1, m.sorted / m.goal), 3);
    if (this.mobileLayer) this.mobileLayer.style.visibility = this.state === 'playing' ? 'visible' : 'hidden';
  }

  private handleEvent(event: ShiftEvent): void {
    this.life.onEvent(event);
    const sounds: Partial<Record<ShiftEvent['type'], SoundEffect>> = {
      grab: 'grab', drop: 'drop', sort: 'correct', wrong: 'wrong', miss: 'pile-up',
      recover: 'dig', brake: 'belt-stop', switch: 'switch', phase: 'event-alert', end: 'shift-end',
      brian: 'event-alert', spill: 'drop',
    };
    const sound = sounds[event.type];
    if (sound) audioSystem.play(sound);
    if (event.type === 'sort') {
      const deliverySide = event.x < 480 ? 'left' : 'right';
      const delivered = event.packageId === undefined ? undefined : this.parcels.get(event.packageId);
      if (delivered && event.packageId !== undefined) {
        this.parcels.delete(event.packageId);
        this.tweens.add({
          targets: delivered.container,
          x: deliverySide === 'left' ? 178 : 782,
          y: event.y,
          scale: 0.8, alpha: 0,
          duration: this.reducedMotion ? 80 : 300,
          ease: 'Cubic.In',
          onComplete: () => delivered.container.destroy(true),
        });
      }
      if (event.route) this.depot.flashDock(event.route, deliverySide);
      this.floatText(event.x, event.y - 43, `+${event.score ?? 100}  DISPATCHED`, '#a6cc9a');
      if (!this.reducedMotion) {
        const ring = this.add.circle(event.x, event.y, 13).setStrokeStyle(2, event.route ? ROUTE[event.route] : 0xa6cc9a).setDepth(32);
        this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 330, onComplete: () => ring.destroy() });
      }
    }
    if (event.type === 'spill') {
      const spill = this.add.ellipse(event.x, event.y + 8, 34, 11, 0xda8db6, 0.62).setDepth(8);
      this.tweens.add({ targets: spill, scaleX: 1.35, alpha: 0, duration: 4200, onComplete: () => spill.destroy() });
    }
    if (['wrong', 'miss', 'phase', 'brian', 'recover', 'brake'].includes(event.type)) {
      this.tell(event.type === 'wrong' ? `NO SCORE · ${event.message}` : event.message, event.type === 'wrong' || event.type === 'miss' ? '#f3987c' : INK, 3300);
    }
  }

  private floatText(x: number, y: number, copy: string, color: string): void {
    const text = this.label(x, y, copy, 12, color, true).setOrigin(0.5).setDepth(72).setPadding(7, 5).setBackgroundColor('#10232a');
    this.tweens.add({ targets: text, y: y - (this.reducedMotion ? 0 : 25), alpha: 0, delay: 350, duration: 600, onComplete: () => text.destroy() });
  }

  private tell(copy: string, color: string, duration: number): void {
    this.toast.setText(copy).setColor(color).setVisible(true);
    this.toastUntil = this.time.now + duration;
  }

  private showBriefing(): void {
    this.showPanel('TERMITE & SKANKY / THE WHOLE CREW IS HERE', 'ANOTHER NIGHT ON THE BELT.', [
      `Dispatch ${this.model.goal} parcels in a three-minute night shift.`,
      'A goes left. B goes right. C goes to either bulk bay.',
      'Move with WASD / arrows. TAB switches your worker.',
      'SPACE grabs, delivers at a dock, or puts a parcel down.',
      'E brakes the belt. Recover misses at the bottom before 5 pile up.',
    ], 'START SHIFT  ↵', () => this.startShift());
    const original = this.textButton(480, 543, 'O  /  PLAY THE ORIGINAL FULL SHIFT', () => this.scene.start('TitleScene'), 11).setOrigin(0.5);
    this.overlay?.add(original);
  }

  private showResults(): void {
    this.state = 'results';
    this.model.paused = true;
    const m = this.model;
    audioSystem.startMusic('results');
    const dispatchRate = m.packages.length === 0 ? 0 : Math.round(m.sorted / m.packages.length * 100);
    this.showPanel(m.won ? `SHIFT COMPLETE / GRADE ${m.grade}` : 'SHIFT TERMINATED / YOU FAILED THE SORT',
      m.pileup >= m.capacity ? 'PILE-UP OVERFLOW' : m.gradeQuote, [
        `${m.sorted} DISPATCHED       ${String(m.score).padStart(5, '0')} POINTS       ${m.bestCombo} BEST STREAK`,
        `${dispatchRate}% of freight dispatched · ${m.missed} parcels reached the belt end`,
        m.pileup >= m.capacity ? 'Recover a missed parcel at the belt exit with SPACE.' : 'Park each worker near their dock. Switch early. Brake when crowded.',
        'This is the first section. The full original shift is still available.',
      ], 'ANOTHER SHIFT  ↵', () => this.scene.restart());
    const original = this.textButton(480, 543, 'PLAY THE ORIGINAL FULL SHIFT', () => this.scene.start('TitleScene'), 11).setOrigin(0.5);
    this.overlay?.add(original);
  }

  private showMesaCaught(): void {
    this.state = 'results'; this.model.paused = true;
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
    lines.forEach((line, index) => items.push(this.label(174, 311 + index * 30, line, 13, index === 0 ? INK : '#b0c1c1', index === 0)));
    const start = this.add.rectangle(480, 495, 320, 44, 0xedba6d).setInteractive({ useHandCursor: true });
    start.on('pointerover', () => start.setFillStyle(0xffd496));
    start.on('pointerout', () => start.setFillStyle(0xedba6d));
    start.on('pointerdown', action);
    items.push(start, this.label(480, 495, button, 15, '#142932', true).setOrigin(0.5));
    this.overlay = this.add.container(0, 0, items).setDepth(100);
  }

  private label(x: number, y: number, copy: string, size: number, color: string, bold = false): Phaser.GameObjects.Text {
    return this.add.text(x, y, copy, { fontFamily: '"Trebuchet MS", Arial, sans-serif', fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' }).setDepth(64);
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
    for (const [name, action] of [
      ['SWITCH', () => this.model.switchWorker()], ['GRAB / DELIVER', () => this.model.action()], ['BRAKE', () => this.model.brake()],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.addEventListener('pointerdown', event => { event.preventDefault(); if (this.state === 'playing') action(); });
      rail.append(button);
    }
    layer.append(stick, rail);
    document.body.append(layer);
    this.mobileLayer = layer;
  }
}
