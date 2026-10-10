import Phaser from 'phaser';

import { MESA } from './DepotReferences';
import type { Parcel, ShiftModel } from './ShiftModel';
import { audioSystem } from '../systems/AudioSystem';

export interface DepotMesaCallbacks {
  begin(): void;
  finish(): void;
  caught(): void;
  offer(visible: boolean): void;
  thought(): void;
}

/** The original Vic/Mesa choice, staged inside the current warehouse shift. */
export class DepotMesaEncounter {
  public readonly roll: () => number;

  private readonly scene: Phaser.Scene;
  private readonly model: ShiftModel;
  private readonly callbacks: DepotMesaCallbacks;
  private stage: 'idle' | 'approach' | 'choice' | 'transition' | 'dream' | 'caught' | 'done' = 'idle';
  private seen = false;
  private disposed = false;
  private parcel: Parcel | null = null;
  private panel: Phaser.GameObjects.Container | null = null;
  private notice: Phaser.GameObjects.Text | null = null;
  private timer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, model: ShiftModel, callbacks: DepotMesaCallbacks, roll: () => number = Math.random) {
    this.scene = scene;
    this.model = model;
    this.callbacks = callbacks;
    this.roll = roll;
    scene.input.keyboard?.on('keydown-Y', this.onStealKey, this);
    scene.input.keyboard?.on('keydown-N', this.onLeaveKey, this);
    scene.events.on('mesa-dream-finished', this.onDreamFinished, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  public get active(): boolean {
    return this.stage !== 'idle' && this.stage !== 'done';
  }

  public update(): void {
    if (this.disposed || this.seen || this.model.paused || this.model.ended || this.model.elapsedMs < 34_000) return;
    const parcel = this.model.packages.find((item) => item.kind === 'mesa' && (item.state === 'belt' || item.state === 'held' || item.state === 'floor'));
    if (!parcel) return;
    this.seen = true;
    this.parcel = parcel;
    this.stage = 'approach';
    this.model.paused = true;
    this.callbacks.begin();
    this.callbacks.offer(true);
    audioSystem.play('warning');
    this.notice = this.text(480, 165, MESA.spotted, 15, '#edba6d').setOrigin(0.5)
      .setPadding(14, 8).setBackgroundColor('#10232a').setDepth(115);
    this.schedule(1100, () => {
      this.notice?.destroy();
      this.notice = null;
      this.stage = 'choice';
      this.showChoice();
    });
  }

  private onStealKey(event: KeyboardEvent): void {
    if (event.repeat || this.stage !== 'choice') return;
    event.preventDefault();
    this.chooseSteal();
  }

  private onLeaveKey(event: KeyboardEvent): void {
    if (event.repeat || this.stage !== 'choice') return;
    event.preventDefault();
    this.chooseLeave();
  }

  private chooseLeave(): void {
    if (this.disposed || this.stage !== 'choice') return;
    audioSystem.play('button');
    this.clearPanel();
    this.callbacks.offer(false);
    this.resumeWarehouse();
    this.notice = this.text(480, 165, MESA.leave, 15, '#a6cc9a').setOrigin(0.5)
      .setPadding(14, 8).setBackgroundColor('#10232a').setDepth(115);
    this.schedule(2_200, () => {
      this.notice?.destroy();
      this.notice = null;
    });
  }

  private chooseSteal(): void {
    if (this.disposed || this.stage !== 'choice' || !this.parcel) return;
    this.stage = 'transition';
    this.clearPanel();
    this.callbacks.offer(false);
    // Consuming stolen freight is intentionally not a successful dispatch.
    // Release either worker so the returned shift cannot retain a ghost carry.
    for (const worker of this.model.workers) {
      if (worker.heldId === this.parcel.id) worker.heldId = null;
    }
    this.parcel.state = 'delivered';
    this.parcel.workerId = null;
    this.callbacks.thought();
    audioSystem.play('switch');
    if (this.roll() < 0.2) {
      this.stage = 'caught';
      this.showCaught();
      audioSystem.play('warning');
      this.schedule(1_300, () => {
        this.clearPanel();
        this.stage = 'done';
        this.callbacks.caught();
      });
      return;
    }
    this.schedule(900, () => {
      this.stage = 'dream';
      this.scene.scene.launch('MesaDreamScene', { returnScene: 'DepotScene' });
      this.scene.scene.pause();
    });
  }

  private onDreamFinished(): void {
    if (this.disposed || this.stage !== 'dream') return;
    this.resumeWarehouse();
  }

  private resumeWarehouse(): void {
    this.stage = 'done';
    this.model.paused = false;
    this.callbacks.finish();
  }

  private showChoice(): void {
    const children = this.panelBase();
    children.push(
      this.text(480, 226, MESA.spotted, 11, '#edba6d').setOrigin(0.5),
      this.text(480, 261, MESA.title, 29, '#edf0de').setOrigin(0.5),
      this.text(480, 298, MESA.offer.replace(/\n/g, ' '), 14, '#edba6d').setOrigin(0.5),
      this.text(480, 349, MESA.body, 16, '#d1dfd5').setOrigin(0.5),
      this.text(480, 403, 'Y / N  ·  OR TAP A CHOICE', 12, '#8da7ac').setOrigin(0.5),
      ...this.choiceButton(376, 451, 'STEAL IT', 0xa6cc9a, () => this.chooseSteal()),
      ...this.choiceButton(584, 451, 'LEAVE IT', 0xedba6d, () => this.chooseLeave()),
    );
    this.panel = this.scene.add.container(0, 0, children).setDepth(120);
  }

  private showCaught(): void {
    const children = this.panelBase();
    children.push(
      this.text(480, 247, MESA.caught, 28, '#f3987c').setOrigin(0.5),
      this.text(480, 324, MESA.caughtDetail, 18, '#edf0de').setOrigin(0.5),
      this.text(480, 414, 'GAME OVER', 18, '#edba6d').setOrigin(0.5),
    );
    this.panel = this.scene.add.container(0, 0, children).setDepth(120);
  }

  private panelBase(): Phaser.GameObjects.GameObject[] {
    const shade = this.scene.add.rectangle(480, 360, 960, 720, 0x06161d, 0.82).setInteractive();
    const frame = this.scene.add.graphics();
    frame.fillStyle(0x1a333c).fillRoundedRect(145, 194, 670, 322, 10);
    frame.lineStyle(1, 0x6a8582).strokeRoundedRect(145, 194, 670, 322, 10);
    frame.fillStyle(0xedba6d).fillRect(171, 214, 24, 3);
    return [shade, frame];
  }

  private text(x: number, y: number, copy: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, copy, {
      fontFamily: '"Trebuchet MS", Arial, sans-serif', fontSize: `${size}px`,
      fontStyle: 'bold', color, align: 'center', lineSpacing: 5,
      wordWrap: { width: 590, useAdvancedWrap: true },
    });
  }

  private choiceButton(x: number, y: number, label: string, color: number, action: () => void): Phaser.GameObjects.GameObject[] {
    const button = this.scene.add.rectangle(x, y, 180, 46, color).setInteractive({ useHandCursor: true });
    button.on('pointerover', () => button.setAlpha(0.82));
    button.on('pointerout', () => button.setAlpha(1));
    button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.preventDefault();
      action();
    });
    return [button, this.text(x, y, label, 15, '#142932').setOrigin(0.5)];
  }

  private schedule(delay: number, action: () => void): void {
    this.timer?.remove(false);
    this.timer = this.scene.time.delayedCall(delay, () => {
      this.timer = null;
      if (!this.disposed) action();
    });
  }

  private clearPanel(): void {
    this.panel?.destroy(true);
    this.panel = null;
  }

  private destroy(): void {
    this.disposed = true;
    this.stage = 'done';
    this.timer?.remove(false);
    this.timer = null;
    this.clearPanel();
    this.notice?.destroy();
    this.notice = null;
    this.scene.input.keyboard?.off('keydown-Y', this.onStealKey, this);
    this.scene.input.keyboard?.off('keydown-N', this.onLeaveKey, this);
    this.scene.events.off('mesa-dream-finished', this.onDreamFinished, this);
  }
}
