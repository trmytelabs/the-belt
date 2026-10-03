import Phaser from 'phaser';

import { colors } from '../config/colors';
import { GAME_WIDTH } from '../config/gameConfig';
import { audioSystem } from '../systems/AudioSystem';

type JohnRushtonState = 'hidden' | 'entering' | 'yelling' | 'crouching' | 'leaving';

const JOHN_LINE = "DON'T STACK\nBOXES ON BOXES!";
const JOHN_BUBBLE_TEXT_WIDTH = 150;
const JOHN_BUBBLE_WIDTH = 184;
const JOHN_BUBBLE_BASE_Y = -64;

export class JohnRushtonEvent {
  private readonly john: Phaser.GameObjects.Container;

  private readonly body: Phaser.GameObjects.Rectangle;

  private readonly leftArm: Phaser.GameObjects.Rectangle;

  private readonly rightArm: Phaser.GameObjects.Rectangle;

  private readonly leftLeg: Phaser.GameObjects.Rectangle;

  private readonly rightLeg: Phaser.GameObjects.Rectangle;

  private readonly bubble: Phaser.GameObjects.Container;

  private readonly bubbleBackground: Phaser.GameObjects.Graphics;

  private readonly bubbleText: Phaser.GameObjects.Text;

  private state: JohnRushtonState = 'hidden';

  private stateTimerMs = 0;

  private animTime = 0;

  private readonly enterPoint = new Phaser.Math.Vector2(372, 118);

  private readonly shoutPoint = new Phaser.Math.Vector2(372, 246);

  private readonly exitPoint = new Phaser.Math.Vector2(372, 82);

  private readonly walkSpeed = 175;

  constructor(scene: Phaser.Scene) {
    const shadow = scene.add.ellipse(0, 23, 34, 10, colors.black, 0.32);
    const head = scene.add.rectangle(0, -20, 17, 15, colors.skinTone, 1);
    const hair = scene.add.rectangle(0, -29, 18, 6, 0x3a2a19, 1);
    this.body = scene.add.rectangle(0, 0, 24, 28, 0x2f4f64, 1);
    const vest = scene.add.rectangle(0, 0, 11, 28, colors.destYellow, 0.9);
    this.leftArm = scene.add.rectangle(-15, -2, 5, 22, colors.skinTone, 1);
    this.rightArm = scene.add.rectangle(15, -2, 5, 22, colors.skinTone, 1);
    this.leftLeg = scene.add.rectangle(-6, 20, 7, 17, colors.warehouseFloorDark, 1);
    this.rightLeg = scene.add.rectangle(6, 20, 7, 17, colors.warehouseFloorDark, 1);

    const name = scene.add.text(0, -43, 'JOHN RUSHTON', {
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
      fontSize: '11px',
      fontStyle: 'bold',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: JOHN_BUBBLE_TEXT_WIDTH, useAdvancedWrap: true },
    });
    this.bubbleText.setOrigin(0.5);
    this.bubble = scene.add.container(0, 0, [this.bubbleBackground, this.bubbleText]);
    this.bubble.setVisible(false);

    this.john = scene.add.container(this.enterPoint.x, this.enterPoint.y, [
      this.bubble,
      name,
      shadow,
      head,
      hair,
      this.body,
      vest,
      this.leftArm,
      this.rightArm,
      this.leftLeg,
      this.rightLeg,
    ]);
    this.john.setDepth(44);
    this.john.setVisible(false);
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
    this.animTime = 0;
    this.john.setPosition(this.enterPoint.x, this.enterPoint.y);
    this.john.setScale(1);
    this.john.setRotation(0);
    this.resetPose();
    this.bubble.setVisible(false);
    this.john.setVisible(true);

    return true;
  }

  public update(delta: number): void {
    if (this.state === 'hidden') {
      return;
    }

    this.animTime += delta;

    if (this.state === 'entering') {
      this.walkTo(this.shoutPoint, delta);
      this.applyWalkPose();

      if (this.hasReached(this.shoutPoint)) {
        this.john.setPosition(this.shoutPoint.x, this.shoutPoint.y);
        this.showBubble(JOHN_LINE);
        this.state = 'yelling';
        this.stateTimerMs = 1500;
      }

      return;
    }

    if (this.state === 'yelling') {
      this.stateTimerMs -= delta;
      this.john.rotation = Math.sin(this.animTime / 55) * 0.035;
      this.leftArm.setRotation(-0.82 + Math.sin(this.animTime / 80) * 0.09);
      this.rightArm.setRotation(0.82 - Math.sin(this.animTime / 80) * 0.09);

      if (this.stateTimerMs <= 0) {
        this.state = 'crouching';
        this.stateTimerMs = 1850;
      }

      return;
    }

    if (this.state === 'crouching') {
      this.stateTimerMs -= delta;
      this.applyCrouchPose();

      if (this.stateTimerMs <= 0) {
        this.resetPose();
        this.bubble.setVisible(false);
        this.state = 'leaving';
      }

      return;
    }

    if (this.state === 'leaving') {
      this.walkTo(this.exitPoint, delta);
      this.applyWalkPose();

      if (this.hasReached(this.exitPoint)) {
        this.forceHide();
      }
    }
  }

  public forceHide(): void {
    this.state = 'hidden';
    this.stateTimerMs = 0;
    this.john.setVisible(false);
    this.john.setPosition(this.enterPoint.x, this.enterPoint.y);
    this.john.setScale(1);
    this.john.setRotation(0);
    this.bubble.setVisible(false);
    this.resetPose();
  }

  private walkTo(target: Phaser.Math.Vector2, delta: number): void {
    const current = new Phaser.Math.Vector2(this.john.x, this.john.y);
    const distance = current.distance(target);

    if (distance <= 0) {
      return;
    }

    const step = this.walkSpeed * (delta / 1000);
    const direction = target.clone().subtract(current).normalize();
    this.john.x += direction.x * Math.min(step, distance);
    this.john.y += direction.y * Math.min(step, distance);
  }

  private hasReached(target: Phaser.Math.Vector2): boolean {
    return Phaser.Math.Distance.Between(this.john.x, this.john.y, target.x, target.y) < 5;
  }

  private applyWalkPose(): void {
    const swing = Math.sin(this.animTime / 110);
    this.john.rotation = swing * 0.025;
    this.leftArm.setRotation(swing * 0.18);
    this.rightArm.setRotation(-swing * 0.18);
    this.leftLeg.setRotation(-swing * 0.14);
    this.rightLeg.setRotation(swing * 0.14);
  }

  private applyCrouchPose(): void {
    const bounce = Math.sin(this.animTime / 82) * 0.045;
    this.john.setScale(1.12, 0.72 + bounce);
    this.john.rotation = Math.sin(this.animTime / 68) * 0.025;
    this.body.y = 7;
    this.leftArm.setPosition(-17, 8);
    this.rightArm.setPosition(17, 8);
    this.leftArm.setRotation(-1.15);
    this.rightArm.setRotation(1.15);
    this.leftLeg.setPosition(-9, 26);
    this.rightLeg.setPosition(9, 26);
    this.leftLeg.setRotation(0.52);
    this.rightLeg.setRotation(-0.52);
  }

  private resetPose(): void {
    this.body.setPosition(0, 0);
    this.leftArm.setPosition(-15, -2);
    this.rightArm.setPosition(15, -2);
    this.leftLeg.setPosition(-6, 20);
    this.rightLeg.setPosition(6, 20);
    this.leftArm.setRotation(0);
    this.rightArm.setRotation(0);
    this.leftLeg.setRotation(0);
    this.rightLeg.setRotation(0);
  }

  private showBubble(text: string): void {
    this.bubbleText.setText(text);
    this.bubbleText.setWordWrapWidth(JOHN_BUBBLE_TEXT_WIDTH, true);
    audioSystem.play('warning');
    const width = JOHN_BUBBLE_WIDTH;
    const height = Math.max(44, this.bubbleText.height + 22);
    const top = JOHN_BUBBLE_BASE_Y - height;
    const bubbleX =
      Phaser.Math.Clamp(this.john.x, width / 2 + 8, GAME_WIDTH - width / 2 - 8) -
      this.john.x;
    const pointerX = Phaser.Math.Clamp(-bubbleX, -width / 2 + 14, width / 2 - 14);

    this.bubble.setX(bubbleX);
    this.bubbleBackground.clear();
    this.bubbleBackground.fillStyle(colors.warningRed, 0.92);
    this.bubbleBackground.fillRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.lineStyle(3, colors.white, 0.26);
    this.bubbleBackground.strokeRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.fillTriangle(
      pointerX - 7,
      JOHN_BUBBLE_BASE_Y - 1,
      pointerX + 7,
      JOHN_BUBBLE_BASE_Y - 1,
      pointerX,
      JOHN_BUBBLE_BASE_Y + 12,
    );
    this.bubbleText.setPosition(0, top + height / 2);
    this.bubble.setVisible(true);
  }
}
