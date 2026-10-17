import Phaser from 'phaser';

import { colors } from '../config/colors';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  create(): void {
    const { centerX, centerY } = this.cameras.main;

    this.cameras.main.setBackgroundColor(colors.ceiling);

    this.add
      .text(centerX, centerY, 'LOADING', {
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '32px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.time.delayedCall(500, () => {
      this.scene.start(new URLSearchParams(window.location.search).get('mode') === 'classic' ? 'TitleScene' : 'DepotScene');
    });
  }
}
