import Phaser from 'phaser';

import { colors } from '../config/colors';

type SidePileConfig = {
  x: number;
  y: number;
};

export class SidePile extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, config: SidePileConfig) {
    super(scene, config.x, config.y);

    const graphics = scene.add.graphics();
    graphics.fillStyle(colors.upsBrownLight, 1);
    graphics.fillRoundedRect(-26, 4, 32, 18, 4);
    graphics.fillRoundedRect(-4, -6, 28, 20, 4);
    graphics.fillRoundedRect(-24, -14, 22, 16, 4);
    graphics.fillStyle(colors.upsBrownDark, 1);
    graphics.lineStyle(2, colors.upsBrownDark, 1);
    graphics.strokeRoundedRect(-26, 4, 32, 18, 4);
    graphics.strokeRoundedRect(-4, -6, 28, 20, 4);
    graphics.strokeRoundedRect(-24, -14, 22, 16, 4);

    this.add([graphics]);
    this.setDepth(7);

    scene.add.existing(this);
  }
}
