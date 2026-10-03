import Phaser from 'phaser';

import { colors } from '../config/colors';
import { fonts, textColors } from '../config/typography';
import { audioSystem } from '../systems/AudioSystem';
import { isMobileBrowser } from '../utils/device';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create(): void {
    const { centerX, centerY } = this.cameras.main;
    const mobile = isMobileBrowser();

    this.cameras.main.setBackgroundColor(colors.ceiling);
    audioSystem.startMusic('title');

    this.drawWarehouseBackdrop();
    this.drawBeltHero();
    this.drawPackageStack(182, 520, 1);
    this.drawPackageStack(780, 512, -1);
    this.drawVignette();

    const label = this.add.text(centerX, 110, 'NIGHT SORT SIMULATOR', {
      color: textColors.accent,
      fontFamily: fonts.body,
      fontSize: '16px',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);
    label.setLetterSpacing(4);

    const titleShadow = this.add.text(centerX + 6, centerY - 98, 'THE BELT', {
      color: '#120c08',
      fontFamily: fonts.display,
      fontSize: '132px',
    });
    titleShadow.setOrigin(0.5);

    const title = this.add.text(centerX, centerY - 108, 'THE BELT', {
      color: '#d79a45',
      fontFamily: fonts.display,
      fontSize: '132px',
      stroke: '#2b1709',
      strokeThickness: 8,
    });
    title.setOrigin(0.5);

    const subtitle = this.add.text(centerX, centerY + 6, 'SORT FAST. MISS NOTHING. SURVIVE THE SHIFT.', {
      color: '#ffffff',
      fontFamily: fonts.body,
      fontSize: '23px',
      fontStyle: 'bold',
      align: 'center',
    });
    subtitle.setOrigin(0.5);
    subtitle.setLetterSpacing(1);

    this.drawInstructionStrip(centerX, centerY + 84, mobile);

    const pressEnter = this.add.text(centerX, 628, mobile ? 'TAP TO START' : 'PRESS ENTER TO START', {
      color: '#10100d',
      fontFamily: fonts.body,
      fontSize: '24px',
      fontStyle: 'bold',
      backgroundColor: '#fff8c4',
      padding: { left: 26, right: 26, top: 10, bottom: 10 },
    });
    pressEnter.setOrigin(0.5);

    this.tweens.add({
      targets: [pressEnter, title],
      alpha: { from: 1, to: 0.72 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    const startGame = () => {
      void audioSystem.unlock();
      audioSystem.play('ui-start');
      audioSystem.startMusic('game');
      this.scene.start('GameScene');
    };

    this.input.keyboard?.once('keydown-ENTER', startGame);

    if (mobile) {
      this.input.once('pointerdown', startGame);
    }
  }

  private drawWarehouseBackdrop(): void {
    const background = this.add.graphics();
    background.fillStyle(colors.ceiling, 1);
    background.fillRect(0, 0, 960, 720);
    background.fillStyle(0x211c18, 1);
    background.fillRect(0, 338, 960, 382);
    background.fillStyle(colors.black, 0.2);
    background.fillRect(0, 608, 960, 112);
    background.lineStyle(1, colors.black, 0.18);
    for (let x = 0; x <= 960; x += 48) {
      background.beginPath();
      background.moveTo(x, 338);
      background.lineTo(x - 80, 720);
      background.strokePath();
    }
    for (let y = 378; y <= 650; y += 46) {
      background.beginPath();
      background.moveTo(0, y);
      background.lineTo(960, y);
      background.strokePath();
    }

    background.fillStyle(colors.fluorescent, 0.95);
    for (let x = 100; x <= 860; x += 190) {
      background.fillRect(x - 44, 24, 88, 8);
      background.fillStyle(colors.fluorescent, 0.15);
      background.fillRect(x - 54, 32, 108, 10);
      background.fillStyle(colors.fluorescent, 0.95);
    }
  }

  private drawBeltHero(): void {
    const belt = this.add.graphics();
    belt.fillStyle(colors.black, 0.34);
    belt.fillRoundedRect(380, 0, 200, 720, 18);
    belt.fillStyle(colors.belt, 1);
    belt.fillRect(406, 0, 148, 720);
    belt.fillStyle(colors.beltMid, 1);
    belt.fillRect(430, 0, 100, 720);
    belt.fillStyle(colors.beltRail, 1);
    belt.fillRect(406, 0, 10, 720);
    belt.fillRect(544, 0, 10, 720);
    belt.fillStyle(colors.white, 0.08);
    belt.fillRect(420, 0, 8, 720);
    belt.fillStyle(colors.black, 0.18);
    belt.fillRect(528, 0, 10, 720);

    for (let y = -20; y <= 740; y += 32) {
      belt.fillStyle(colors.fluorescent, 0.16);
      belt.fillTriangle(438, y, 480, y + 18, 522, y);
      belt.lineStyle(1, colors.black, 0.2);
      belt.beginPath();
      belt.moveTo(428, y + 27);
      belt.lineTo(532, y + 27);
      belt.strokePath();
    }
  }

  private drawPackageStack(x: number, y: number, direction: 1 | -1): void {
    const stack = this.add.graphics();
    const boxes = [
      { ox: 0, oy: 0, w: 92, h: 44 },
      { ox: -42 * direction, oy: -38, w: 76, h: 42 },
      { ox: 36 * direction, oy: -76, w: 88, h: 48 },
      { ox: -8 * direction, oy: -116, w: 104, h: 42 },
    ];

    stack.fillStyle(colors.black, 0.22);
    stack.fillEllipse(x, y + 32, 210, 46);

    for (const box of boxes) {
      const left = x + box.ox - box.w / 2;
      const top = y + box.oy - box.h / 2;
      stack.fillStyle(colors.upsBrownLight, 1);
      stack.fillRoundedRect(left, top, box.w, box.h, 7);
      stack.fillStyle(colors.white, 0.08);
      stack.fillRoundedRect(left + 4, top + 4, box.w - 8, 9, 4);
      stack.fillStyle(0xc9a060, 0.58);
      stack.fillRect(left + 4, top + box.h / 2 - 3, box.w - 8, 6);
      stack.lineStyle(2, colors.upsBrownDark, 0.95);
      stack.strokeRoundedRect(left, top, box.w, box.h, 7);
    }
  }

  private drawInstructionStrip(x: number, y: number, mobile: boolean): void {
    const panel = this.add.graphics();
    panel.fillStyle(colors.black, 0.64);
    panel.fillRoundedRect(x - 315, y - 32, 630, 64, 8);
    panel.lineStyle(1, colors.fluorescent, 0.32);
    panel.strokeRoundedRect(x - 315, y - 32, 630, 64, 8);

    const copy = mobile
      ? 'TOUCH STICK TO MOVE  |  SWITCH WORKERS  |  GRAB AND DROP'
      : 'TAB SWITCHES WORKERS  |  SPACE GRABS AND DROPS  |  SORT TO THE RIGHT DOCK';

    const text = this.add.text(x, y, copy, {
      color: '#f5eee4',
      fontFamily: fonts.body,
      fontSize: '16px',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 580 },
    });
    text.setOrigin(0.5);
  }

  private drawVignette(): void {
    const vignette = this.add.graphics();
    vignette.fillStyle(colors.black, 0.38);
    vignette.fillRect(0, 0, 960, 70);
    vignette.fillRect(0, 650, 960, 70);
    vignette.fillStyle(colors.black, 0.24);
    vignette.fillRect(0, 0, 74, 720);
    vignette.fillRect(886, 0, 74, 720);
    for (let i = 0; i < 8; i += 1) {
      vignette.lineStyle(10, colors.black, 0.02 + i * 0.012);
      vignette.strokeRect(i * 8, i * 8, 960 - i * 16, 720 - i * 16);
    }
  }
}
