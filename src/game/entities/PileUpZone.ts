import Phaser from 'phaser';

import { colors } from '../config/colors';
import type { Package } from './Package';
import { PACKAGE_DIMENSIONS } from './Package';
import type { PackageDestination, PackageSize } from '../types/GameTypes';
import { audioSystem } from '../systems/AudioSystem';
import { isMobileBrowser } from '../utils/device';

type PileUpZoneConfig = {
  x: number;
  y: number;
};

export type PilePackageRecord = {
  destination: PackageDestination;
  size: PackageSize;
};

export class PileUpZone extends Phaser.GameObjects.Container {
  public readonly bounds: Phaser.Geom.Rectangle;

  public pileCount = 0;

  public readonly maxPile = 8;

  private readonly countText: Phaser.GameObjects.Text;

  private readonly baseGraphics: Phaser.GameObjects.Graphics;

  private readonly pileGraphics: Phaser.GameObjects.Graphics;

  private readonly warningGlow: Phaser.GameObjects.Ellipse;

  private warningTween: Phaser.Tweens.Tween | null = null;

  private readonly pilePackages: PilePackageRecord[] = [];

  private overflowHandler: (() => void) | null = null;

  private overflowTriggered = false;

  constructor(scene: Phaser.Scene, config: PileUpZoneConfig) {
    super(scene, config.x, config.y);

    const width = 136;
    const height = 44;
    const isMobile = isMobileBrowser();

    this.warningGlow = scene.add.ellipse(0, 2, width + 26, height + 18, colors.warningRed, 0);
    this.warningGlow.setStrokeStyle(2, colors.warningRed, 0.12);

    this.baseGraphics = scene.add.graphics();
    this.pileGraphics = scene.add.graphics();

    const label = scene.add.text(0, -26, 'PILE-UP', {
      color: '#ffb7b7',
      fontFamily: 'Arial',
      fontSize: isMobile ? '19px' : '12px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isMobile ? 6 : 0,
    });
    label.setOrigin(0.5);

    this.countText = scene.add.text(0, 0, '0 / 8', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: isMobile ? '19px' : '12px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isMobile ? 6 : 0,
    });
    this.countText.setOrigin(0.5);

    this.add([this.warningGlow, this.baseGraphics, this.pileGraphics, label, this.countText]);
    this.setDepth(9);

    this.bounds = new Phaser.Geom.Rectangle(config.x - width / 2, config.y - height / 2, width, height);

    scene.add.existing(this);
    this.redraw();
  }

  public addPackage(pkg: Package): void {
    this.pilePackages.push({
      destination: pkg.destination,
      size: pkg.size,
    });
    this.pileCount = this.pilePackages.length;
    this.redraw();

    if (this.pileCount >= this.maxPile && !this.overflowTriggered) {
      this.overflowTriggered = true;
      this.overflowHandler?.();
      return;
    }

    if (this.pileCount >= 7) {
      audioSystem.play('warning');
    }
  }

  public removeTopPackage(): PilePackageRecord | null {
    const removed = this.pilePackages.pop() ?? null;
    this.pileCount = this.pilePackages.length;

    if (removed) {
      this.redraw();
    }

    return removed;
  }

  public containsPoint(x: number, y: number): boolean {
    return Phaser.Geom.Rectangle.Contains(this.bounds, x, y);
  }

  public getTopPackage(): PilePackageRecord | null {
    return this.pilePackages.at(-1) ?? null;
  }

  public setOverflowHandler(handler: () => void): void {
    this.overflowHandler = handler;
  }

  private redraw(): void {
    this.redrawBase();
    this.redrawPile();
    this.countText.setText(`${this.pileCount} / ${this.maxPile}`);

    if (this.pileCount >= 7) {
      this.startWarningGlow(this.pileCount >= this.maxPile ? 0.45 : 0.22);
    } else {
      this.stopWarningGlow();
    }
  }

  private redrawBase(): void {
    this.baseGraphics.clear();
    this.baseGraphics.fillStyle(colors.black, 0.58);
    this.baseGraphics.fillRect(-68, -22, 136, 44);
    this.baseGraphics.fillStyle(colors.warningRed, 0.06);
    this.baseGraphics.fillEllipse(0, 4, 104, 18);
    this.baseGraphics.fillStyle(colors.black, 0.18);
    this.baseGraphics.fillEllipse(-18, 2, 44, 10);
    this.baseGraphics.fillEllipse(20, 6, 34, 8);
    this.baseGraphics.lineStyle(2, colors.warningRed, 0.28);
    this.baseGraphics.strokeRect(-68, -22, 136, 44);
  }

  private redrawPile(): void {
    this.pileGraphics.clear();

    const overflowLayout = [
      { x: -44, y: 4, rotation: -0.34 },
      { x: -22, y: -6, rotation: 0.2 },
      { x: -6, y: 8, rotation: -0.12 },
      { x: 16, y: -10, rotation: 0.24 },
      { x: 34, y: 2, rotation: -0.28 },
      { x: -30, y: -14, rotation: 0.38 },
      { x: 0, y: -18, rotation: -0.22 },
      { x: 42, y: -14, rotation: 0.44 },
    ];

    const standardLayout = [
      { x: 0, y: 6, rotation: 0.04 },
      { x: -16, y: 2, rotation: -0.08 },
      { x: 15, y: 0, rotation: 0.12 },
      { x: -28, y: -8, rotation: -0.24 },
      { x: 28, y: -10, rotation: 0.22 },
      { x: -8, y: -14, rotation: -0.18 },
      { x: 12, y: -18, rotation: 0.3 },
      { x: 0, y: -24, rotation: -0.1 },
    ];

    const layout = this.pileCount >= this.maxPile ? overflowLayout : standardLayout;

    this.pilePackages.forEach((pkg, index) => {
      const slot = layout[index] ?? layout[layout.length - 1];
      const { width, height } = PACKAGE_DIMENSIONS[pkg.size];
      const scale =
        this.pileCount <= 2 ? 0.55 : this.pileCount <= 4 ? 0.62 : this.pileCount <= 6 ? 0.7 : 0.76;
      const renderWidth = Math.max(18, width * scale);
      const renderHeight = Math.max(10, height * scale);
      const color = this.getPileColor(pkg.destination);
      const darkStroke = color === colors.destYellow ? colors.upsBrownDark : colors.black;
      const x = slot.x;
      const y = slot.y;

      this.pileGraphics.save();
      this.pileGraphics.translateCanvas(x, y);
      this.pileGraphics.rotateCanvas(slot.rotation);
      this.pileGraphics.fillStyle(color, 0.98);
      this.pileGraphics.fillRoundedRect(
        -renderWidth / 2,
        -renderHeight / 2,
        renderWidth,
        renderHeight,
        5,
      );
      this.pileGraphics.lineStyle(2, darkStroke, 0.38);
      this.pileGraphics.strokeRoundedRect(
        -renderWidth / 2,
        -renderHeight / 2,
        renderWidth,
        renderHeight,
        5,
      );
      this.pileGraphics.restore();
    });
  }

  private startWarningGlow(alpha: number): void {
    this.warningTween?.stop();
    this.warningGlow.setAlpha(alpha);
    this.warningTween = this.scene.tweens.add({
      targets: this.warningGlow,
      alpha: { from: alpha * 0.6, to: alpha },
      scaleX: { from: 1, to: 1.08 },
      scaleY: { from: 1, to: 1.08 },
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private stopWarningGlow(): void {
    this.warningTween?.stop();
    this.warningTween = null;
    this.warningGlow.setAlpha(0);
    this.warningGlow.setScale(1);
  }

  private getPileColor(destination: PackageDestination): number {
    switch (destination) {
      case 'HERES_UR_SOVICE':
        return colors.destBlue;
      case 'PAYTMAN':
        return colors.destOrange;
      case 'BULK':
        return colors.destYellow;
      case 'MISSED':
      default:
        return colors.warningRed;
    }
  }
}
