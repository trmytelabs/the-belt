import Phaser from 'phaser';

import { GAME_WIDTH } from '../config/gameConfig';
import { colors } from '../config/colors';
import { audioSystem } from '../systems/AudioSystem';
import { FlavorNpc } from './FlavorNpc';

type VicMassageState =
  | 'hidden'
  | 'vicEntering'
  | 'vicLyingDown'
  | 'massaging'
  | 'vicLeaving';

const VIC_MASSAGE_BUBBLE_TEXT_WIDTH = 150;
const VIC_MASSAGE_BUBBLE_WIDTH = 184;
const VIC_MASSAGE_BUBBLE_BASE_Y = -61;

export class VicMassageEvent {
  private readonly scene: Phaser.Scene;

  private readonly aj: FlavorNpc;

  private readonly vic: Phaser.GameObjects.Container;

  private readonly towel: Phaser.GameObjects.Rectangle;

  private readonly bubble: Phaser.GameObjects.Container;

  private readonly bubbleBackground: Phaser.GameObjects.Graphics;

  private readonly bubbleText: Phaser.GameObjects.Text;

  private state: VicMassageState = 'hidden';

  private stateTimerMs = 0;

  private animTime = 0;

  private readonly tablePoint = new Phaser.Math.Vector2(212, 268);

  private readonly ajMassagePoint = new Phaser.Math.Vector2(214, 238);

  private readonly vicStart = new Phaser.Math.Vector2(GAME_WIDTH + 70, 268);

  private readonly vicExit = new Phaser.Math.Vector2(GAME_WIDTH + 80, 268);

  constructor(scene: Phaser.Scene, aj: FlavorNpc) {
    this.scene = scene;
    this.aj = aj;

    const shadow = scene.add.ellipse(0, 18, 28, 8, colors.black, 0.28);
    const head = scene.add.rectangle(0, -13, 14, 12, colors.skinTone, 1);
    const body = scene.add.rectangle(0, 2, 18, 24, 0x5b5f66, 1);
    const leftArm = scene.add.rectangle(-11, 1, 4, 16, colors.skinTone, 1);
    const rightArm = scene.add.rectangle(11, 1, 4, 16, colors.skinTone, 1);
    const leftLeg = scene.add.rectangle(-4, 18, 6, 14, colors.warehouseFloorDark, 1);
    const rightLeg = scene.add.rectangle(4, 18, 6, 14, colors.warehouseFloorDark, 1);
    const brow = scene.add.rectangle(0, -17, 12, 2, colors.black, 0.5);
    this.towel = scene.add.rectangle(0, 7, 28, 14, colors.white, 0.82);
    this.towel.setVisible(false);

    const name = scene.add.text(0, -37, 'VIC', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '10px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    name.setOrigin(0.5);

    this.bubbleBackground = scene.add.graphics();
    this.bubbleText = scene.add.text(0, -66, '', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '10px',
      fontStyle: 'bold',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: VIC_MASSAGE_BUBBLE_TEXT_WIDTH, useAdvancedWrap: true },
    });
    this.bubbleText.setOrigin(0.5);
    this.bubble = scene.add.container(0, 0, [this.bubbleBackground, this.bubbleText]);
    this.bubble.setVisible(false);

    this.vic = scene.add.container(this.vicStart.x, this.vicStart.y, [
      this.bubble,
      name,
      shadow,
      head,
      brow,
      body,
      this.towel,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
    ]);
    this.vic.setDepth(42);
    this.vic.setVisible(false);
  }

  public isActive(): boolean {
    return this.state !== 'hidden';
  }

  public start(): boolean {
    if (this.isActive() || !this.aj.beginMassageWork(this.ajMassagePoint)) {
      return false;
    }

    this.state = 'vicEntering';
    this.stateTimerMs = 0;
    this.animTime = 0;
    this.vic.setPosition(this.vicStart.x, this.vicStart.y);
    this.vic.setScale(1);
    this.vic.setRotation(0);
    this.vic.setAlpha(1);
    this.vic.setVisible(true);
    this.towel.setVisible(false);
    this.bubble.setVisible(false);
    audioSystem.play('event-alert');

    return true;
  }

  public update(delta: number): void {
    if (this.state === 'hidden') {
      return;
    }

    this.animTime += delta;

    if (this.state === 'vicEntering') {
      this.moveContainerToward(this.vic, this.tablePoint, delta, 190);
      this.vic.rotation = Math.sin(this.animTime / 120) * 0.02;

      if (this.hasReached(this.vic, this.tablePoint)) {
        this.vic.setPosition(this.tablePoint.x, this.tablePoint.y);
        this.state = 'vicLyingDown';
        this.stateTimerMs = 450;
      }

      return;
    }

    if (this.state === 'vicLyingDown') {
      this.stateTimerMs -= delta;
      const progress = 1 - Math.max(0, this.stateTimerMs / 450);
      this.vic.setRotation(Phaser.Math.DegToRad(90 * progress));
      this.vic.setScale(1 + progress * 0.12, 1 - progress * 0.12);

      if (this.stateTimerMs <= 0) {
        this.vic.setRotation(Phaser.Math.DegToRad(90));
        this.vic.setPosition(this.tablePoint.x, this.tablePoint.y);
        this.towel.setVisible(true);
        this.showBubble('I NEED A\nQUICK TUNE UP', 0);
        this.state = 'massaging';
        this.stateTimerMs = 5200;
      }

      return;
    }

    if (this.state === 'massaging') {
      this.stateTimerMs -= delta;
      this.aj.setPosition(
        this.ajMassagePoint.x + Math.sin(this.animTime / 85) * 2,
        this.ajMassagePoint.y + Math.abs(Math.sin(this.animTime / 115)) * 4,
      );
      this.aj.setScale(1.02, 0.98 + Math.sin(this.animTime / 90) * 0.05);
      this.vic.setPosition(this.tablePoint.x + Math.sin(this.animTime / 140) * 1.2, this.tablePoint.y);

      if (this.stateTimerMs <= 0) {
        this.aj.finishMassageWork();
        this.towel.setVisible(false);
        this.bubble.setVisible(false);
        this.vic.setRotation(0);
        this.vic.setScale(1);
        this.state = 'vicLeaving';
      }

      return;
    }

    if (this.state === 'vicLeaving') {
      this.moveContainerToward(this.vic, this.vicExit, delta, 210);
      this.vic.rotation = Math.sin(this.animTime / 120) * 0.02;

      if (this.hasReached(this.vic, this.vicExit)) {
        this.forceHide();
      }
    }
  }

  public forceHide(): void {
    this.state = 'hidden';
    this.stateTimerMs = 0;
    this.vic.setVisible(false);
    this.vic.setPosition(this.vicStart.x, this.vicStart.y);
    this.vic.setRotation(0);
    this.vic.setScale(1);
    this.vic.setAlpha(1);
    this.bubble.setVisible(false);
    this.towel.setVisible(false);
    this.aj.finishMassageWork();
  }

  private moveContainerToward(
    object: Phaser.GameObjects.Container,
    target: Phaser.Math.Vector2,
    delta: number,
    speed: number,
  ): void {
    const current = new Phaser.Math.Vector2(object.x, object.y);
    const distance = current.distance(target);

    if (distance <= 0) {
      return;
    }

    const step = speed * (delta / 1000);
    const direction = target.clone().subtract(current).normalize();
    object.x += direction.x * Math.min(step, distance);
    object.y += direction.y * Math.min(step, distance);
  }

  private hasReached(
    object: Phaser.GameObjects.Container,
    target: Phaser.Math.Vector2,
  ): boolean {
    return Phaser.Math.Distance.Between(object.x, object.y, target.x, target.y) < 5;
  }

  private showBubble(text: string, durationMs: number): void {
    this.bubbleText.setText(text);
    this.bubbleText.setWordWrapWidth(VIC_MASSAGE_BUBBLE_TEXT_WIDTH, true);
    audioSystem.play('npc-talk');
    const width = VIC_MASSAGE_BUBBLE_WIDTH;
    const height = Math.max(44, this.bubbleText.height + 20);
    const top = VIC_MASSAGE_BUBBLE_BASE_Y - height;
    const bubbleX =
      Phaser.Math.Clamp(this.vic.x, width / 2 + 8, GAME_WIDTH - width / 2 - 8) -
      this.vic.x;
    const pointerX = Phaser.Math.Clamp(-bubbleX, -width / 2 + 12, width / 2 - 12);

    this.bubble.setX(bubbleX);
    this.bubbleBackground.clear();
    this.bubbleBackground.fillStyle(colors.black, 0.8);
    this.bubbleBackground.fillRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.lineStyle(2, colors.white, 0.18);
    this.bubbleBackground.strokeRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.fillTriangle(
      pointerX - 6,
      VIC_MASSAGE_BUBBLE_BASE_Y - 1,
      pointerX + 6,
      VIC_MASSAGE_BUBBLE_BASE_Y - 1,
      pointerX,
      VIC_MASSAGE_BUBBLE_BASE_Y + 11,
    );
    this.bubbleText.setPosition(0, top + height / 2);
    this.bubble.setVisible(true);

    if (durationMs > 0) {
      this.scene.time.delayedCall(durationMs, () => {
        if (this.state !== 'hidden') {
          this.bubble.setVisible(false);
        }
      });
    }
  }
}
