import Phaser from 'phaser';

import { colors } from '../config/colors';
import { audioSystem } from '../systems/AudioSystem';

export type RedButtonState = 'idle' | 'glowing' | 'pressed';

type RedButtonConfig = {
  id: string;
  x: number;
  y: number;
};

export class RedButton extends Phaser.GameObjects.Container {
  public readonly id: string;

  public currentState: RedButtonState = 'idle';

  private readonly glowHalo: Phaser.GameObjects.Ellipse;

  private glowTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, config: RedButtonConfig) {
    super(scene, config.x, config.y);

    this.id = config.id;

    const mount = scene.add.rectangle(0, 0, 28, 18, colors.beltRail, 1);
    mount.setStrokeStyle(2, colors.black, 0.35);

    const base = scene.add.rectangle(0, 2, 14, 8, colors.upsBrownDark, 1);
    const button = scene.add.circle(0, -3, 8, colors.warningRed, 1);
    button.setStrokeStyle(2, colors.white, 0.2);

    this.glowHalo = scene.add.ellipse(0, -3, 30, 30, colors.warningRed, 0);
    this.glowHalo.setStrokeStyle(2, colors.warningRed, 0.22);

    this.add([this.glowHalo, mount, base, button]);
    this.setDepth(14);

    scene.add.existing(this);
  }

  public flashGlow(): void {
    this.clearGlow();
    audioSystem.play('event-alert');
    this.currentState = 'glowing';
    this.glowHalo.setVisible(true);
    this.glowHalo.setAlpha(0.18);
    this.glowTween = this.scene.tweens.add({
      targets: this.glowHalo,
      alpha: { from: 0.12, to: 0.42 },
      scaleX: { from: 1, to: 1.18 },
      scaleY: { from: 1, to: 1.18 },
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  public flashPressed(): void {
    this.clearGlow();
    audioSystem.play('button');
    this.currentState = 'pressed';
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.16,
      scaleY: 1.16,
      duration: 70,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => {
        this.currentState = 'idle';
      },
    });
  }

  public clearGlow(): void {
    this.glowTween?.stop();
    this.glowTween = null;
    this.glowHalo.setAlpha(0);
    this.glowHalo.setScale(1);

    if (this.currentState !== 'pressed') {
      this.currentState = 'idle';
    }
  }

  public getPosition(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(this.x, this.y);
  }
}
