import Phaser from 'phaser';

import { colors } from '../config/colors';
import { audioSystem } from '../systems/AudioSystem';
import type { ShiftResultsData } from '../systems/ShiftSystem';
import { isMobileBrowser } from '../utils/device';

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('ResultsScene');
  }

  create(data: ShiftResultsData): void {
    const { centerX } = this.cameras.main;

    this.cameras.main.setBackgroundColor(colors.warehouseFloorDark);
    audioSystem.startMusic('results');
    audioSystem.play('results');

    const bg = this.add.graphics();
    bg.fillStyle(colors.ceiling, 1);
    bg.fillRect(0, 0, 960, 110);
    bg.fillStyle(colors.warehouseFloor, 0.94);
    bg.fillRect(0, 110, 960, 610);
    bg.fillStyle(colors.black, 0.3);
    bg.fillRect(40, 140, 560, 450);
    bg.fillRect(640, 170, 240, 290);

    this.add
      .text(centerX, 70, 'SHIFT COMPLETE', {
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '42px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const lines = [
      `FINAL SCORE   ${data.score}`,
      `ACCURACY      ${data.accuracy}%`,
      `PACKAGES SORTED ${data.packagesSorted}`,
      `BULK SORTED   ${data.bulkSorted}`,
      `MISSED        ${data.missed}`,
      `ERRORS        ${data.errors}`,
    ];

    lines.forEach((line, index) => {
      this.add.text(80, 190 + index * 58, line, {
        color: '#ffffff',
        fontFamily: 'Courier New',
        fontSize: '24px',
        fontStyle: 'bold',
      });
    });

    const gradePanel = this.add.graphics();
    gradePanel.fillStyle(colors.black, 0.46);
    gradePanel.fillRoundedRect(660, 190, 200, 210, 18);
    gradePanel.lineStyle(3, colors.upsBrownHighlight, 0.65);
    gradePanel.strokeRoundedRect(660, 190, 200, 210, 18);

    const gradeLetter = this.add.text(760, 238, data.grade, {
      color: data.grade === 'F' ? '#ff5d5d' : '#fff8c4',
      fontFamily: 'Arial',
      fontSize: '110px',
      fontStyle: 'bold',
    });
    gradeLetter.setOrigin(0.5);
    gradeLetter.setScale(0.8);

    this.tweens.add({
      targets: gradeLetter,
      scaleX: 1,
      scaleY: 1,
      duration: 380,
      ease: 'Back.Out',
    });

    this.add
      .text(760, 360, data.gradeQuote, {
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '20px',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, 662, isMobileBrowser() ? 'TAP TO RETURN TO TITLE' : 'PRESS ENTER TO RETURN TO TITLE', {
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '24px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ENTER', () => {
      audioSystem.play('switch');
      audioSystem.startMusic('title');
      this.scene.start('TitleScene');
    });

    if (isMobileBrowser()) {
      this.input.once('pointerdown', () => {
        audioSystem.play('switch');
        audioSystem.startMusic('title');
        this.scene.start('TitleScene');
      });
    }
  }
}
