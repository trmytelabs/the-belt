import Phaser from 'phaser';

import { createMesaBedroom, type MesaBedroom } from '../art/MesaBedroomArt';
import { audioSystem } from '../systems/AudioSystem';

export class MesaDreamScene extends Phaser.Scene {
  private bedroom!: MesaBedroom;
  private dreamElapsed = 0;

  constructor() {
    super('MesaDreamScene');
  }

  create(data: { returnScene?: string } = {}): void {
    this.dreamElapsed = 0;
    audioSystem.startMusic('results');
    this.cameras.main.setBackgroundColor(0x161e2a);
    this.bedroom = createMesaBedroom(this);
    this.bedroom.animate(0);

    this.cameras.main.fadeIn(260, 255, 246, 210);
    this.time.delayedCall(5000, () => {
      this.cameras.main.fadeOut(420, 18, 12, 8);
      this.time.delayedCall(450, () => {
        audioSystem.startMusic('game');
        if (data.returnScene) {
          this.scene.stop();
          this.scene.resume(data.returnScene);
          this.scene.get(data.returnScene).events.emit('mesa-dream-finished');
        } else {
          this.scene.start('GameScene');
        }
      });
    });
  }

  update(_time: number, delta: number): void {
    this.dreamElapsed += delta;
    this.bedroom.animate(this.dreamElapsed);
  }
}
