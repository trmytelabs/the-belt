import Phaser from 'phaser';

import { colors } from '../config/colors';
import { GAME_WIDTH } from '../config/gameConfig';
import { audioSystem } from '../systems/AudioSystem';
import { isMobileBrowser } from '../utils/device';

export type VicState = 'hidden' | 'pathing' | 'pressing' | 'offering' | 'exiting';

type VicMode = 'button' | 'offer';

const VIC_BUBBLE_TEXT_WIDTH = 184;
const VIC_BUBBLE_WIDTH = 218;
const VIC_BUBBLE_BASE_Y = -54;

export class VicNpc extends Phaser.GameObjects.Container {
  public state: VicState = 'hidden';

  public moveSpeed = 220;

  public targetButton = new Phaser.Math.Vector2();

  private exitTarget = new Phaser.Math.Vector2();

  private pressTimer = 0;

  private pressTriggered = false;

  private cycleDone = false;

  private mode: VicMode = 'button';

  private readonly bubble: Phaser.GameObjects.Container;

  private readonly bubbleBackground: Phaser.GameObjects.Graphics;

  private readonly bubbleText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene, -80, -80);
    const isMobile = isMobileBrowser();

    const shadow = scene.add.ellipse(0, 20, 26, 8, colors.black, 0.35);
    const head = scene.add.rectangle(0, -12, 14, 12, colors.skinTone, 1);
    const body = scene.add.rectangle(0, 2, 18, 22, 0x5b5f66, 1);
    const leftArm = scene.add.rectangle(-11, 1, 4, 16, colors.skinTone, 1);
    const rightArm = scene.add.rectangle(11, 1, 4, 16, colors.skinTone, 1);
    const leftLeg = scene.add.rectangle(-4, 17, 6, 14, colors.warehouseFloorDark, 1);
    const rightLeg = scene.add.rectangle(4, 17, 6, 14, colors.warehouseFloorDark, 1);
    const brow = scene.add.rectangle(0, -16, 12, 2, colors.black, 0.5);

    this.bubbleBackground = scene.add.graphics();
    this.bubbleText = scene.add.text(0, -62, '', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: isMobile ? '14px' : '11px',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: isMobile ? 4 : 0,
      lineSpacing: 2,
      wordWrap: { width: VIC_BUBBLE_TEXT_WIDTH, useAdvancedWrap: true },
    });
    this.bubbleText.setOrigin(0.5);
    this.bubble = scene.add.container(0, 0, [this.bubbleBackground, this.bubbleText]);
    this.bubble.setVisible(false);

    this.add([shadow, head, body, leftArm, rightArm, leftLeg, rightLeg, brow, this.bubble]);
    this.setDepth(22);
    this.setVisible(false);

    scene.add.existing(this);
  }

  public enter(buttonPos: Phaser.Math.Vector2): void {
    this.mode = 'button';
    this.targetButton = buttonPos.clone();
    this.state = 'pathing';
    this.pressTimer = 0;
    this.pressTriggered = false;
    this.cycleDone = false;
    this.alpha = 0;
    this.setScale(1);
    this.setVisible(true);

    const fromLeft = buttonPos.x < 480;
    this.x = fromLeft ? -48 : 1008;
    this.y = buttonPos.y + 18;
    this.exitTarget = new Phaser.Math.Vector2(fromLeft ? -72 : 1032, this.y);

    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: 220,
      ease: 'Quad.Out',
    });
  }

  public offer(targetPos: Phaser.Math.Vector2, text: string): void {
    this.mode = 'offer';
    this.targetButton = targetPos.clone();
    this.state = 'pathing';
    this.pressTimer = 0;
    this.pressTriggered = false;
    this.cycleDone = false;
    this.alpha = 0;
    this.setScale(1);
    this.setVisible(true);

    const fromLeft = targetPos.x <= 480;
    this.x = fromLeft ? -48 : 1008;
    this.y = targetPos.y + 18;
    this.exitTarget = new Phaser.Math.Vector2(fromLeft ? -72 : 1032, this.y);
    this.setBubbleText(text);

    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: 220,
      ease: 'Quad.Out',
    });
  }

  public update(delta: number): void {
    if (this.state === 'hidden') {
      return;
    }

    if (this.state === 'pathing') {
      this.moveToward(this.targetButton.x, this.targetButton.y + 12, delta);

      if (Phaser.Math.Distance.Between(this.x, this.y, this.targetButton.x, this.targetButton.y + 12) < 6) {
        if (this.mode === 'button') {
          this.state = 'pressing';
          this.pressTimer = 180;
          this.scene.tweens.add({
            targets: this,
            scaleX: 1.08,
            scaleY: 1.08,
            duration: 80,
            yoyo: true,
            ease: 'Quad.Out',
          });
        } else {
          this.state = 'offering';
          this.redrawBubble();
          this.bubble.setVisible(true);
          this.scene.tweens.add({
            targets: this,
            scaleX: 1.04,
            scaleY: 1.04,
            duration: 90,
            yoyo: true,
            ease: 'Quad.Out',
          });
        }
      }

      return;
    }

    if (this.state === 'offering') {
      return;
    }

    if (this.state === 'pressing') {
      this.pressTimer -= delta;

      if (!this.pressTriggered && this.pressTimer <= 90) {
        this.pressTriggered = true;
      }

      if (this.pressTimer <= 0) {
        this.state = 'exiting';
        this.scene.tweens.add({
          targets: this,
          alpha: 0,
          duration: 280,
          ease: 'Quad.In',
        });
      }

      return;
    }

    if (this.state === 'exiting') {
      this.moveToward(this.exitTarget.x, this.exitTarget.y, delta);

      if (Phaser.Math.Distance.Between(this.x, this.y, this.exitTarget.x, this.exitTarget.y) < 6) {
        this.state = 'hidden';
        this.cycleDone = true;
        this.setVisible(false);
        this.alpha = 1;
      }
    }
  }

  public dismissOffer(): void {
    if (this.state !== 'offering') {
      return;
    }

    this.state = 'exiting';
    this.bubble.setVisible(false);
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 220,
      ease: 'Quad.In',
    });
  }

  public consumePressSignal(): boolean {
    if (!this.pressTriggered) {
      return false;
    }

    this.pressTriggered = false;
    return true;
  }

  public isDone(): boolean {
    return this.state === 'hidden' && this.cycleDone;
  }

  public forceHide(): void {
    this.scene.tweens.killTweensOf(this);
    this.state = 'hidden';
    this.cycleDone = false;
    this.pressTriggered = false;
    this.pressTimer = 0;
    this.alpha = 1;
    this.bubble.setVisible(false);
    this.setVisible(false);
    this.setScale(1);
    this.x = -80;
    this.y = -80;
  }

  private moveToward(targetX: number, targetY: number, delta: number): void {
    const current = new Phaser.Math.Vector2(this.x, this.y);
    const target = new Phaser.Math.Vector2(targetX, targetY);
    const distance = current.distance(target);

    if (distance === 0) {
      return;
    }

    const step = this.moveSpeed * (delta / 1000);
    const direction = target.subtract(current).normalize();

    this.x += direction.x * Math.min(step, distance);
    this.y += direction.y * Math.min(step, distance);
  }

  private setBubbleText(text: string): void {
    this.bubbleText.setText(text);
    this.bubbleText.setWordWrapWidth(VIC_BUBBLE_TEXT_WIDTH, true);
    audioSystem.play('npc-talk');
    this.redrawBubble();
    this.bubble.setVisible(false);
  }

  private redrawBubble(): void {
    const width = VIC_BUBBLE_WIDTH;
    const height = Math.max(46, this.bubbleText.height + 22);
    const top = VIC_BUBBLE_BASE_Y - height;
    const bubbleX = Phaser.Math.Clamp(this.x, width / 2 + 8, GAME_WIDTH - width / 2 - 8) - this.x;
    const pointerX = Phaser.Math.Clamp(-bubbleX, -width / 2 + 12, width / 2 - 12);

    this.bubble.setX(bubbleX);
    this.bubbleBackground.clear();
    this.bubbleBackground.fillStyle(colors.black, 0.82);
    this.bubbleBackground.fillRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.lineStyle(2, colors.white, 0.2);
    this.bubbleBackground.strokeRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.fillStyle(colors.black, 0.82);
    this.bubbleBackground.fillTriangle(
      pointerX - 6,
      VIC_BUBBLE_BASE_Y - 1,
      pointerX + 6,
      VIC_BUBBLE_BASE_Y - 1,
      pointerX,
      VIC_BUBBLE_BASE_Y + 10,
    );
    this.bubbleText.setPosition(0, top + height / 2);
  }
}
