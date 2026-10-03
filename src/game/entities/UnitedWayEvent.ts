import Phaser from 'phaser';

import { colors } from '../config/colors';
import { GAME_WIDTH } from '../config/gameConfig';
import { audioSystem } from '../systems/AudioSystem';
import { FlavorNpc } from './FlavorNpc';

type UnitedWayState = 'hidden' | 'entering' | 'announcing' | 'leaving';

const SHAN_LINE = 'TERMITE AND SKANKY\nHAVE BOTH WON\nA FREE PAID DAY OFF\nFROM UNITED WAY';
const SHAN_BUBBLE_TEXT_WIDTH = 178;
const SHAN_BUBBLE_WIDTH = 216;
const SHAN_BUBBLE_BASE_Y = -58;

const WORKER_SWEARS = [
  'WHAT THE FUCK',
  'BULLSHIT',
  'YOU GOTTA BE\nFUCKING KIDDING',
  'FUCK THIS',
  'ARE YOU\nFUCKING SERIOUS',
  'SON OF A BITCH',
] as const;

export class UnitedWayEvent {
  private readonly scene: Phaser.Scene;

  private readonly workers: FlavorNpc[];

  private readonly shan: Phaser.GameObjects.Container;

  private readonly bubble: Phaser.GameObjects.Container;

  private readonly bubbleBackground: Phaser.GameObjects.Graphics;

  private readonly bubbleText: Phaser.GameObjects.Text;

  private state: UnitedWayState = 'hidden';

  private stateTimerMs = 0;

  private hasStartedSwearing = false;

  private readonly startPoint = new Phaser.Math.Vector2(-92, 560);

  private readonly announcePoint = new Phaser.Math.Vector2(374, 560);

  private readonly exitPoint = new Phaser.Math.Vector2(-110, 560);

  constructor(scene: Phaser.Scene, workers: FlavorNpc[]) {
    this.scene = scene;
    this.workers = workers;

    const shadow = scene.add.ellipse(0, 22, 30, 8, colors.black, 0.38);
    const head = scene.add.rectangle(0, -12, 16, 14, 0xd06262, 1);
    const scalp = scene.add.rectangle(0, -20, 10, 4, colors.beltRail, 1);
    const shirt = scene.add.rectangle(0, 3, 22, 22, colors.white, 1);
    const tie = scene.add.rectangle(0, 4, 4, 18, colors.warningRed, 1);
    const leftArm = scene.add.rectangle(-13, 3, 5, 16, 0xd9b2a1, 1);
    const rightArm = scene.add.rectangle(13, 3, 5, 16, 0xd9b2a1, 1);
    const leftLeg = scene.add.rectangle(-5, 18, 6, 15, colors.warehouseFloorDark, 1);
    const rightLeg = scene.add.rectangle(5, 18, 6, 15, colors.warehouseFloorDark, 1);
    const name = scene.add.text(0, -42, 'SHAN O MACK', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '10px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    name.setOrigin(0.5);

    this.bubbleBackground = scene.add.graphics();
    this.bubbleText = scene.add.text(0, -76, '', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '10px',
      fontStyle: 'bold',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: SHAN_BUBBLE_TEXT_WIDTH, useAdvancedWrap: true },
    });
    this.bubbleText.setOrigin(0.5);
    this.bubble = scene.add.container(0, 0, [this.bubbleBackground, this.bubbleText]);
    this.bubble.setVisible(false);

    this.shan = scene.add.container(this.startPoint.x, this.startPoint.y, [
      this.bubble,
      name,
      shadow,
      head,
      scalp,
      shirt,
      tie,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
    ]);
    this.shan.setDepth(48);
    this.shan.setVisible(false);
  }

  public isActive(): boolean {
    return this.state !== 'hidden';
  }

  public start(): boolean {
    if (this.isActive()) {
      return false;
    }

    this.state = 'entering';
    this.stateTimerMs = 0;
    this.hasStartedSwearing = false;
    this.shan.setPosition(this.startPoint.x, this.startPoint.y);
    this.shan.setRotation(0);
    this.shan.setScale(1);
    this.shan.setVisible(true);
    this.bubble.setVisible(false);
    audioSystem.play('event-alert');

    return true;
  }

  public update(delta: number): void {
    if (this.state === 'hidden') {
      return;
    }

    if (this.state === 'entering') {
      this.moveToward(this.announcePoint, delta, 230);
      this.shan.rotation = Math.sin(this.scene.time.now / 110) * 0.025;

      if (this.hasReached(this.announcePoint)) {
        this.shan.setPosition(this.announcePoint.x, this.announcePoint.y);
        this.showBubble(SHAN_LINE);
        this.state = 'announcing';
        this.stateTimerMs = 4600;
      }

      return;
    }

    if (this.state === 'announcing') {
      this.stateTimerMs -= delta;
      this.shan.rotation = Math.sin(this.scene.time.now / 78) * 0.04;

      if (!this.hasStartedSwearing && this.stateTimerMs <= 3200) {
        this.hasStartedSwearing = true;
        this.startWorkerSwearing();
      }

      if (this.stateTimerMs <= 0) {
        this.bubble.setVisible(false);
        this.state = 'leaving';
      }

      return;
    }

    if (this.state === 'leaving') {
      this.moveToward(this.exitPoint, delta, 250);
      this.shan.rotation = Math.sin(this.scene.time.now / 110) * 0.025;

      if (this.hasReached(this.exitPoint)) {
        this.forceHide();
      }
    }
  }

  public forceHide(): void {
    this.state = 'hidden';
    this.stateTimerMs = 0;
    this.hasStartedSwearing = false;
    this.shan.setVisible(false);
    this.shan.setPosition(this.startPoint.x, this.startPoint.y);
    this.shan.setRotation(0);
    this.shan.setScale(1);
    this.bubble.setVisible(false);
  }

  private startWorkerSwearing(): void {
    const availableWorkers = this.workers.filter((worker) => worker.visible && worker.state !== 'dead');

    availableWorkers.forEach((worker, index) => {
      this.scene.time.delayedCall(index * 110, () => {
        if (worker.visible && worker.state !== 'dead') {
          worker.announce(Phaser.Utils.Array.GetRandom([...WORKER_SWEARS]), 3300);
        }
      });
    });
  }

  private moveToward(target: Phaser.Math.Vector2, delta: number, speed: number): void {
    const current = new Phaser.Math.Vector2(this.shan.x, this.shan.y);
    const distance = current.distance(target);

    if (distance <= 0) {
      return;
    }

    const step = speed * (delta / 1000);
    const direction = target.clone().subtract(current).normalize();
    this.shan.x += direction.x * Math.min(step, distance);
    this.shan.y += direction.y * Math.min(step, distance);
  }

  private hasReached(target: Phaser.Math.Vector2): boolean {
    return Phaser.Math.Distance.Between(this.shan.x, this.shan.y, target.x, target.y) < 5;
  }

  private showBubble(text: string): void {
    this.bubbleText.setText(text);
    this.bubbleText.setWordWrapWidth(SHAN_BUBBLE_TEXT_WIDTH, true);
    audioSystem.play('warning');
    const width = SHAN_BUBBLE_WIDTH;
    const height = Math.max(56, this.bubbleText.height + 24);
    const top = SHAN_BUBBLE_BASE_Y - height;
    const bubbleX =
      Phaser.Math.Clamp(this.shan.x, width / 2 + 8, GAME_WIDTH - width / 2 - 8) -
      this.shan.x;
    const pointerX = Phaser.Math.Clamp(-bubbleX, -width / 2 + 14, width / 2 - 14);

    this.bubble.setX(bubbleX);
    this.bubbleBackground.clear();
    this.bubbleBackground.fillStyle(colors.black, 0.84);
    this.bubbleBackground.fillRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.lineStyle(2, colors.white, 0.22);
    this.bubbleBackground.strokeRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.fillTriangle(
      pointerX - 7,
      SHAN_BUBBLE_BASE_Y - 1,
      pointerX + 7,
      SHAN_BUBBLE_BASE_Y - 1,
      pointerX,
      SHAN_BUBBLE_BASE_Y + 12,
    );
    this.bubbleText.setPosition(0, top + height / 2);
    this.bubble.setVisible(true);
  }
}
