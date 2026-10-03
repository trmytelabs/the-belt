import Phaser from 'phaser';

import { colors } from '../config/colors';
import { GAME_WIDTH } from '../config/gameConfig';
import { audioSystem } from '../systems/AudioSystem';
import { randomTimedEventDelayMs } from '../utils/eventTiming';
import { isMobileBrowser } from '../utils/device';

const KYLIE_QUOTES = [
  'WHERE IS MY\nTIMMY HORTANS',
  'MY TIMMY\nHORTANS?!',
  'WHO TOOK MY\nTIMMY HORTANS',
] as const;

const KYLIE_BUBBLE_TEXT_WIDTH = 166;
const KYLIE_BUBBLE_WIDTH = 200;
const KYLIE_BUBBLE_BASE_Y = -57;

export class KylieNpc extends Phaser.GameObjects.Container {
  private direction: 1 | -1 = 1;

  private speed = 140;

  private appearanceTimerMs = randomTimedEventDelayMs();

  private hasAppeared = false;

  private bubbleTimerMs = Phaser.Math.Between(2000, 3000);

  private readonly bubble: Phaser.GameObjects.Container;

  private readonly bubbleText: Phaser.GameObjects.Text;

  private readonly bubbleBackground: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    super(scene, 560, 120);
    const isMobile = isMobileBrowser();

    const shadow = scene.add.ellipse(0, 18, 24, 8, colors.black, 0.28);
    const hair = scene.add.rectangle(0, -18, 16, 8, 0x7b2f71, 1);
    const head = scene.add.rectangle(0, -12, 14, 12, colors.skinTone, 1);
    const mouth = scene.add.rectangle(0, -7, 6, 2, colors.warningRed, 1);
    const body = scene.add.rectangle(0, 2, 18, 22, 0xff38b8, 1);
    const leftLeg = scene.add.rectangle(-4, 17, 6, 14, colors.warehouseFloorDark, 1);
    const rightLeg = scene.add.rectangle(4, 17, 6, 14, colors.warehouseFloorDark, 1);

    this.bubbleBackground = scene.add.graphics();
    this.bubbleText = scene.add.text(0, -62, KYLIE_QUOTES[0], {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: isMobile ? '14px' : '11px',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: isMobile ? 4 : 0,
      lineSpacing: 2,
      wordWrap: { width: KYLIE_BUBBLE_TEXT_WIDTH, useAdvancedWrap: true },
    });
    this.bubbleText.setOrigin(0.5);
    this.bubble = scene.add.container(0, 0, [this.bubbleBackground, this.bubbleText]);
    this.redrawBubble();

    this.add([shadow, hair, head, mouth, body, leftLeg, rightLeg, this.bubble]);
    this.setDepth(19);
    this.setVisible(false);
    this.bubble.setVisible(false);

    scene.add.existing(this);
  }

  public update(delta: number): void {
    if (!this.visible) {
      if (this.hasAppeared) {
        return;
      }

      this.appearanceTimerMs -= delta;

      if (this.appearanceTimerMs <= 0) {
        this.beginAppearance();
      }

      return;
    }

    this.y += this.direction * this.speed * (delta / 1000);
    this.x = 560 + Math.sin(this.y / 28) * 18;

    if ((this.direction === 1 && this.y >= 760) || (this.direction === -1 && this.y <= -60)) {
      this.endAppearance();
      return;
    }

    this.bubbleTimerMs -= delta;

    if (this.bubbleTimerMs <= 0) {
      this.bubble.setVisible(!this.bubble.visible);

      if (this.bubble.visible) {
        this.bubbleText.setText(Phaser.Utils.Array.GetRandom([...KYLIE_QUOTES]));
        this.redrawBubble();
        audioSystem.play('npc-talk');
      }

      this.bubbleTimerMs = Phaser.Math.Between(2000, 3000);
    }

  }

  private beginAppearance(): void {
    this.hasAppeared = true;
    this.appearanceTimerMs = randomTimedEventDelayMs();
    this.direction = Phaser.Math.Between(0, 1) === 0 ? 1 : -1;
    this.y = this.direction === 1 ? -40 : 760;
    this.x = 560;
    this.setVisible(true);
    this.bubble.setVisible(true);
    this.bubbleText.setText(Phaser.Utils.Array.GetRandom([...KYLIE_QUOTES]));
    this.redrawBubble();
    audioSystem.play('npc-talk');
    this.bubbleTimerMs = Phaser.Math.Between(2000, 3000);
  }

  private endAppearance(): void {
    this.setVisible(false);
    this.bubble.setVisible(false);
  }

  private redrawBubble(): void {
    this.bubbleText.setWordWrapWidth(KYLIE_BUBBLE_TEXT_WIDTH, true);
    const width = KYLIE_BUBBLE_WIDTH;
    const height = Math.max(44, this.bubbleText.height + 20);
    const top = KYLIE_BUBBLE_BASE_Y - height;
    const bubbleX = Phaser.Math.Clamp(this.x, width / 2 + 8, GAME_WIDTH - width / 2 - 8) - this.x;
    const pointerX = Phaser.Math.Clamp(-bubbleX, -width / 2 + 12, width / 2 - 12);

    this.bubble.setX(bubbleX);
    this.bubbleBackground.clear();
    this.bubbleBackground.fillStyle(colors.black, 0.76);
    this.bubbleBackground.fillRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.lineStyle(2, colors.white, 0.16);
    this.bubbleBackground.strokeRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.fillTriangle(
      pointerX - 6,
      KYLIE_BUBBLE_BASE_Y - 1,
      pointerX + 6,
      KYLIE_BUBBLE_BASE_Y - 1,
      pointerX,
      KYLIE_BUBBLE_BASE_Y + 9,
    );
    this.bubbleText.setPosition(0, top + height / 2);
  }
}
