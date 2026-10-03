import Phaser from 'phaser';

import { colors } from '../config/colors';
import { fonts, textColors } from '../config/typography';
import { audioSystem } from '../systems/AudioSystem';
import type { GameOverData } from '../types/GameTypes';
import { isMobileBrowser } from '../utils/device';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create(): void {
    const { centerX, centerY } = this.cameras.main;
    const data = (this.scene.settings.data ?? {}) as GameOverData;
    const title = data.title ?? 'PILE-UP OVERFLOW';
    const subtitle = data.subtitle ?? 'YOU FAILED THE SORT';
    const detail = data.detail ?? null;
    const mobile = isMobileBrowser();

    this.cameras.main.setBackgroundColor(colors.warehouseFloorDark);
    audioSystem.startMusic('danger');
    audioSystem.play('game-over');
    this.drawFailureBackdrop();
    this.drawPile(centerX, centerY + 28);

    const eyebrow = this.add.text(centerX, 96, 'SHIFT TERMINATED', {
      color: textColors.accent,
      fontFamily: fonts.body,
      fontSize: '15px',
      fontStyle: 'bold',
    });
    eyebrow.setOrigin(0.5);
    eyebrow.setLetterSpacing(4);

    const titleText = this.add.text(centerX, 160, title, {
      color: '#ff5d5d',
      fontFamily: fonts.display,
      fontSize: '64px',
      stroke: '#140707',
      strokeThickness: 8,
      align: 'center',
      wordWrap: { width: 820 },
    });
    titleText.setOrigin(0.5);

    this.add
      .text(centerX, 236, subtitle, {
        color: '#ffffff',
        fontFamily: fonts.body,
        fontSize: '23px',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 700 },
      })
      .setOrigin(0.5);

    if (detail) {
      this.add
        .text(centerX, 286, detail, {
          color: '#ffd36b',
          fontFamily: fonts.body,
          fontSize: '18px',
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: 620 },
        })
        .setOrigin(0.5);
    }

    const restart = this.add.text(centerX, 622, mobile ? 'TAP TO START OVER' : 'PRESS ENTER TO START OVER', {
      color: '#160b08',
      fontFamily: fonts.body,
      fontSize: '23px',
      fontStyle: 'bold',
      backgroundColor: '#ffcf66',
      padding: { left: 26, right: 26, top: 10, bottom: 10 },
    });
    restart.setOrigin(0.5);

    if (!mobile) {
      this.add
        .text(centerX, 672, 'ESC RETURNS TO TITLE', {
          color: '#b8aea3',
          fontFamily: fonts.body,
          fontSize: '14px',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
    }

    this.input.keyboard?.once('keydown-ENTER', () => {
      audioSystem.play('ui-start');
      audioSystem.startMusic('game');
      this.scene.start('GameScene');
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      audioSystem.play('switch');
      audioSystem.startMusic('title');
      this.scene.start('TitleScene');
    });

    if (mobile) {
      this.input.once('pointerdown', () => {
        audioSystem.play('ui-start');
        audioSystem.startMusic('game');
        this.scene.start('GameScene');
      });
    }
  }

  private drawFailureBackdrop(): void {
    const background = this.add.graphics();
    background.fillStyle(colors.ceiling, 1);
    background.fillRect(0, 0, 960, 118);
    background.fillStyle(0x352b25, 1);
    background.fillRect(0, 118, 960, 602);
    background.fillStyle(colors.black, 0.42);
    background.fillRect(0, 592, 960, 128);
    background.fillStyle(colors.warningRed, 0.08);
    background.fillRect(0, 0, 960, 720);

    for (let x = 82; x <= 878; x += 190) {
      background.fillStyle(colors.warningRed, 0.86);
      background.fillRect(x - 42, 28, 84, 8);
      background.fillStyle(colors.warningRed, 0.16);
      background.fillRect(x - 56, 36, 112, 14);
    }

    background.lineStyle(2, colors.black, 0.18);
    for (let y = 142; y <= 568; y += 42) {
      background.beginPath();
      background.moveTo(0, y);
      background.lineTo(960, y - 18);
      background.strokePath();
    }

    const belt = this.add.graphics();
    belt.fillStyle(colors.black, 0.45);
    belt.fillRoundedRect(402, 0, 156, 720, 14);
    belt.fillStyle(colors.belt, 1);
    belt.fillRect(428, 0, 104, 720);
    belt.fillStyle(colors.beltMid, 0.88);
    belt.fillRect(446, 0, 68, 720);
    belt.fillStyle(colors.warningRed, 0.2);
    for (let y = -20; y < 720; y += 44) {
      belt.fillTriangle(450, y, 480, y + 20, 510, y);
    }
  }

  private drawPile(x: number, y: number): void {
    const pile = this.add.graphics();
    pile.fillStyle(colors.warningRed, 0.14);
    pile.fillEllipse(x, y + 54, 342, 152);
    pile.fillStyle(colors.black, 0.24);
    pile.fillEllipse(x, y + 106, 340, 58);

    const boxes = [
      { ox: -122, oy: 40, w: 102, h: 56, rot: -0.08 },
      { ox: -42, oy: 8, w: 90, h: 50, rot: 0.06 },
      { ox: 46, oy: 28, w: 98, h: 58, rot: -0.04 },
      { ox: -96, oy: -8, w: 78, h: 44, rot: 0.1 },
      { ox: 6, oy: -24, w: 90, h: 48, rot: -0.08 },
      { ox: 0, oy: 86, w: 118, h: 46, rot: 0.04 },
    ];

    for (const box of boxes) {
      const cx = x + box.ox;
      const cy = y + box.oy;
      pile.save();
      pile.translateCanvas(cx, cy);
      pile.rotateCanvas(box.rot);
      pile.fillStyle(colors.upsBrownLight, 1);
      pile.fillRoundedRect(-box.w / 2, -box.h / 2, box.w, box.h, 8);
      pile.fillStyle(colors.white, 0.08);
      pile.fillRoundedRect(-box.w / 2 + 5, -box.h / 2 + 5, box.w - 10, 10, 4);
      pile.fillStyle(0xc9a060, 0.52);
      pile.fillRect(-box.w / 2 + 4, -3, box.w - 8, 6);
      pile.lineStyle(2, colors.upsBrownDark, 1);
      pile.strokeRoundedRect(-box.w / 2, -box.h / 2, box.w, box.h, 8);
      pile.restore();
    }
  }
}
