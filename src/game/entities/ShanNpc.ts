import Phaser from 'phaser';

import { colors } from '../config/colors';
import { GAME_WIDTH } from '../config/gameConfig';
import { audioSystem } from '../systems/AudioSystem';
import { isMobileBrowser } from '../utils/device';

export type ShanState = 'hidden' | 'entering' | 'pressing' | 'confronting' | 'exiting';

type ShanMode = 'button' | 'confront';

const RANT_POOL = [
  '!@#%!',
  'WHO STOPPED THE\n#@%! BELT?!',
  'BACK TO #@%!\nWORK!',
  '#@%! AGAIN?!',
  "I'D RATHER BE\nDIGGING GRAVES",
  'I WONDER HOW MUCH\nA 50 FOOTER\nWOULD SELL FOR',
  'UGH MY ULCERS\nAGAIN!',
] as const;

const SHAN_RANT_TEXT_WIDTH = 190;
const SHAN_RANT_BUBBLE_WIDTH = 224;
const SHAN_RANT_BUBBLE_BASE_Y = -57;

export class ShanNpc extends Phaser.GameObjects.Container {
  public state: ShanState = 'hidden';

  public moveSpeed = 200;

  public targetButton = new Phaser.Math.Vector2();

  private exitTarget = new Phaser.Math.Vector2();

  private pressTimer = 0;

  private pressTriggered = false;

  private cycleDone = false;

  private mode: ShanMode = 'button';

  private holdTimer = 0;

  private readonly bubble: Phaser.GameObjects.Container;

  private readonly bubbleBackground: Phaser.GameObjects.Graphics;

  private readonly bubbleText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene, -100, -100);
    const isMobile = isMobileBrowser();

    const shadow = scene.add.ellipse(0, 22, 30, 8, colors.black, 0.38);
    const head = scene.add.rectangle(0, -12, 16, 14, 0xd06262, 1);
    const scalp = scene.add.rectangle(0, -20, 10, 4, colors.beltRail, 1);
    const shirt = scene.add.rectangle(0, 3, 22, 22, colors.white, 1);
    const tie = scene.add.rectangle(0, 4, 4, 18, colors.warningRed, 1);
    const leftArm = scene.add.rectangle(-13, 3, 5, 16, 0xd9b2a1, 1);
    const rightArm = scene.add.rectangle(13, 3, 5, 16, 0xd9b2a1, 1);
    const leftLeg = scene.add.rectangle(-5, 18, 6, 15, colors.warehouseFloorDark, 1);
    const rightLeg = scene.add.rectangle(5, 18, 6, 15, colors.warehouseFloorDark, 1);

    this.bubbleBackground = scene.add.graphics();
    this.bubbleText = scene.add.text(0, -64, '', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: isMobile ? '14px' : '11px',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: isMobile ? 4 : 0,
      lineSpacing: 2,
      wordWrap: { width: SHAN_RANT_TEXT_WIDTH, useAdvancedWrap: true },
    });
    this.bubbleText.setOrigin(0.5);
    this.bubble = scene.add.container(0, 0, [this.bubbleBackground, this.bubbleText]);
    this.bubble.setVisible(false);

    this.add([
      shadow,
      head,
      scalp,
      shirt,
      tie,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      this.bubble,
    ]);
    this.setDepth(23);
    this.setVisible(false);

    scene.add.existing(this);
  }

  public enter(buttonPos: Phaser.Math.Vector2): void {
    this.mode = 'button';
    this.targetButton = buttonPos.clone();
    this.state = 'entering';
    this.pressTimer = 0;
    this.pressTriggered = false;
    this.cycleDone = false;
    this.holdTimer = 0;
    this.alpha = 0;
    this.setScale(1);
    this.setVisible(true);

    const fromLeft = buttonPos.x < 480;
    this.x = fromLeft ? -62 : 1022;
    this.y = buttonPos.y + 20;
    this.exitTarget = new Phaser.Math.Vector2(fromLeft ? -90 : 1050, this.y);

    const targetDistance = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      buttonPos.x,
      buttonPos.y + 12,
    );
    const desiredTravelMs = Phaser.Math.Between(1500, 3000);
    this.moveSpeed = targetDistance / (desiredTravelMs / 1000);

    this.setRantText(Phaser.Utils.Array.GetRandom([...RANT_POOL]));

    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: 260,
      ease: 'Quad.Out',
    });
  }

  public confront(targetPos: Phaser.Math.Vector2, rantText: string, holdMs = 1100): void {
    this.mode = 'confront';
    this.targetButton = targetPos.clone();
    this.state = 'entering';
    this.pressTimer = 0;
    this.pressTriggered = false;
    this.cycleDone = false;
    this.holdTimer = holdMs;
    this.alpha = 0;
    this.setScale(1);
    this.setVisible(true);

    const fromLeft = targetPos.x <= 480;
    this.x = fromLeft ? -62 : 1022;
    this.y = targetPos.y + 20;
    this.exitTarget = new Phaser.Math.Vector2(fromLeft ? -90 : 1050, this.y);

    const targetDistance = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      targetPos.x,
      targetPos.y + 12,
    );
    this.moveSpeed = targetDistance / (900 / 1000);

    this.setRantText(rantText);

    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: 260,
      ease: 'Quad.Out',
    });
  }

  public update(delta: number): void {
    if (this.state === 'hidden') {
      return;
    }

    if (this.bubble.visible) {
      this.redrawBubble();
    }

    if (this.state === 'entering') {
      this.moveToward(this.targetButton.x, this.targetButton.y + 12, delta);

      if (Phaser.Math.Distance.Between(this.x, this.y, this.targetButton.x, this.targetButton.y + 12) < 6) {
        if (this.mode === 'button') {
          this.state = 'pressing';
          this.pressTimer = 220;
          this.scene.tweens.add({
            targets: this,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 90,
            yoyo: true,
            ease: 'Quad.Out',
          });
        } else {
          this.state = 'confronting';
          this.scene.tweens.add({
            targets: this,
            scaleX: 1.08,
            scaleY: 1.08,
            duration: 100,
            yoyo: true,
            ease: 'Quad.Out',
          });
        }
      }

      return;
    }

    if (this.state === 'pressing') {
      this.pressTimer -= delta;

      if (!this.pressTriggered && this.pressTimer <= 110) {
        this.pressTriggered = true;
      }

      if (this.pressTimer <= 0) {
        this.state = 'exiting';
        this.bubble.setVisible(false);
        this.scene.tweens.add({
          targets: this,
          alpha: 0,
          duration: 320,
          ease: 'Quad.In',
        });
      }

      return;
    }

    if (this.state === 'confronting') {
      this.holdTimer -= delta;

      if (this.holdTimer <= 0) {
        this.state = 'exiting';
        this.bubble.setVisible(false);
        this.scene.tweens.add({
          targets: this,
          alpha: 0,
          duration: 320,
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
    this.mode = 'button';
    this.cycleDone = false;
    this.pressTriggered = false;
    this.pressTimer = 0;
    this.holdTimer = 0;
    this.alpha = 1;
    this.bubble.setVisible(false);
    this.setVisible(false);
    this.setScale(1);
    this.x = -100;
    this.y = -100;
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

  private setRantText(text: string): void {
    this.bubbleText.setText(text);
    this.bubbleText.setWordWrapWidth(SHAN_RANT_TEXT_WIDTH, true);
    audioSystem.play('warning');
    this.redrawBubble();
    this.bubble.setVisible(true);
  }

  private redrawBubble(): void {
    const width = SHAN_RANT_BUBBLE_WIDTH;
    const height = Math.max(46, this.bubbleText.height + 22);
    const top = SHAN_RANT_BUBBLE_BASE_Y - height;
    const bubbleX = Phaser.Math.Clamp(this.x, width / 2 + 8, GAME_WIDTH - width / 2 - 8) - this.x;
    const pointerX = Phaser.Math.Clamp(-bubbleX, -width / 2 + 12, width / 2 - 12);

    this.bubble.setX(bubbleX);
    this.bubbleBackground.clear();
    this.bubbleBackground.fillStyle(colors.black, 0.78);
    this.bubbleBackground.fillRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.lineStyle(2, colors.white, 0.2);
    this.bubbleBackground.strokeRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.fillStyle(colors.black, 0.78);
    this.bubbleBackground.fillTriangle(
      pointerX - 6,
      SHAN_RANT_BUBBLE_BASE_Y - 1,
      pointerX + 6,
      SHAN_RANT_BUBBLE_BASE_Y - 1,
      pointerX,
      SHAN_RANT_BUBBLE_BASE_Y + 10,
    );
    this.bubbleText.setPosition(0, top + height / 2);
  }
}
