import Phaser from 'phaser';

import { colors } from '../config/colors';
import { fonts } from '../config/typography';
import { BELT_BOTTOM, BELT_LEFT, BELT_RIGHT, BELT_TOP } from '../systems/BeltSystem';
import type {
  PackageDestination,
  PackageSize,
  PlayerId,
} from '../types/GameTypes';

type PackageDimensions = {
  width: number;
  height: number;
};

export type PackageVariant = 'standard' | 'mallwood' | 'panchetters' | 'makeup';

const DESTINATION_COLORS: Record<PackageDestination, number> = {
  HERES_UR_SOVICE: colors.destBlue,
  PAYTMAN: colors.destOrange,
  BULK: colors.destYellow,
  MISSED: colors.warningRed,
};

export const PACKAGE_DIMENSIONS: Record<PackageSize, PackageDimensions> = {
  small_envelope: { width: 38, height: 22 },
  small_box: { width: 40, height: 34 },
  medium_box: { width: 52, height: 40 },
  large_box: { width: 66, height: 52 },
  long_box: { width: 82, height: 30 },
  mesa_boogie: { width: 74, height: 56 },
  quad_bike: { width: 90, height: 56 },
  goji_berries: { width: 40, height: 48 },
  live_lobsters: { width: 78, height: 42 },
};

export type PackageConfig = {
  id: string;
  destination: PackageDestination;
  size: PackageSize;
  speed: number;
  isBeltRunning: () => boolean;
  labelText?: string;
  variant?: PackageVariant;
  playerPickable?: boolean;
  showSticker?: boolean;
  showGlow?: boolean;
  wasDugOut?: boolean;
};

export class Package extends Phaser.GameObjects.Container {
  public readonly id: string;

  public readonly destination: PackageDestination;

  public readonly size: PackageSize;

  public speed: number;

  public isHeld = false;

  public holderId: PlayerId | null = null;

  public isSorted = false;

  public wasDugOut = false;

  public ignoreBeltPause = false;

  public readonly labelText: string;

  public readonly variant: PackageVariant;

  public readonly playerPickable: boolean;

  private readonly isBeltRunning: () => boolean;

  private readonly packageBody: Phaser.GameObjects.Graphics;

  private readonly crackOverlay: Phaser.GameObjects.Graphics;

  private readonly spillOverlay: Phaser.GameObjects.Graphics;

  private readonly smellOverlay: Phaser.GameObjects.Graphics | null;

  private smellAnimMs = 0;

  private makeupBroken = false;

  private readonly makeupBreakY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, config: PackageConfig) {
    super(scene, x, y);

    const { width, height } = PACKAGE_DIMENSIONS[config.size];
    const destinationColor = DESTINATION_COLORS[config.destination];
    const cornerRadius = Math.max(4, Math.min(width, height) * 0.18);
    const fillColor = destinationColor;

    this.id = config.id;
    this.destination = config.destination;
    this.size = config.size;
    this.speed = config.speed;
    this.isBeltRunning = config.isBeltRunning;
    this.labelText = config.labelText ?? this.getDefaultLabelText(config.size, config.destination);
    this.variant = config.variant ?? 'standard';
    this.playerPickable = config.playerPickable ?? true;
    this.wasDugOut = config.wasDugOut ?? false;
    this.makeupBreakY = Phaser.Math.Between(220, 520);

    const glow = scene.add.graphics();
    if (config.showGlow ?? true) {
      glow.fillStyle(destinationColor, 0.18);
      glow.fillRoundedRect(
        -width / 2 - 4,
        -height / 2 - 4,
        width + 8,
        height + 8,
        cornerRadius + 2,
      );
    }

    const shadow = scene.add.graphics();
    shadow.fillStyle(colors.black, 0.24);
    shadow.fillEllipse(2, height / 2 + 5, width * 0.92, Math.max(7, height * 0.24));

    this.packageBody = scene.add.graphics();
    this.redrawBody(width, height, cornerRadius, fillColor);

    const labelWidth = Math.max(34, width * 0.86);
    const labelFontSize = this.getLabelFontSize(width, height);
    const formattedLabelText = this.formatLabelText(this.labelText, labelWidth - 8, labelFontSize);
    const labelLineCount = formattedLabelText.split('\n').length;
    const nameBlockHeight = labelLineCount * labelFontSize * 0.82;
    const labelHeight = Math.max(16, nameBlockHeight + 8);
    const labelX = -labelWidth / 2;
    const labelY = -labelHeight / 2 + height * 0.08;

    const label = scene.add.graphics();
    label.fillStyle(colors.black, 0.18);
    label.fillRoundedRect(labelX + 1, labelY + 2, labelWidth, labelHeight, 3);
    label.fillStyle(0xe8d3aa, 0.94);
    label.fillRoundedRect(labelX, labelY, labelWidth, labelHeight, 3);
    label.lineStyle(1, 0x5b3d1e, 0.62);
    label.strokeRoundedRect(labelX, labelY, labelWidth, labelHeight, 3);

    const labelText = scene.add.text(0, labelY + labelHeight / 2, formattedLabelText, {
      color: '#2b1a0d',
      fontFamily: fonts.body,
      fontSize: `${labelFontSize}px`,
      fontStyle: 'bold',
      align: 'center',
      stroke: '#e8d3aa',
      strokeThickness: 1,
      lineSpacing: labelLineCount > 1 ? -2 : 0,
      wordWrap: { width: labelWidth - 8 },
    });
    labelText.setOrigin(0.5);

    const recoveredBadge = this.wasDugOut
      ? scene.add.star(-width / 2 + 8, -height / 2 + 8, 4, 2, 4, colors.white, 1)
      : null;

    if (recoveredBadge) {
      recoveredBadge.setStrokeStyle(1, colors.black, 0.5);
    }

    this.crackOverlay = scene.add.graphics();
    this.crackOverlay.setVisible(false);

    this.spillOverlay = scene.add.graphics();
    this.spillOverlay.setVisible(false);

    this.smellOverlay =
      this.variant === 'mallwood' ? this.createSmellOverlay(scene, width, height) : null;

    const contents: Phaser.GameObjects.GameObject[] = [
      glow,
      shadow,
      this.spillOverlay,
      ...(this.smellOverlay ? [this.smellOverlay] : []),
      this.packageBody,
      label,
      labelText,
      this.crackOverlay,
    ];

    if (recoveredBadge) {
      contents.push(recoveredBadge);
    }

    this.add(contents);
    this.setSize(width, height);
    this.setDepth(12);

    scene.add.existing(this);
  }

  public update(delta: number): void {
    this.updateSmellLines(delta);

    if (
      (!this.isBeltRunning() && !this.ignoreBeltPause) ||
      this.isHeld ||
      this.isSorted ||
      !this.isOnBelt()
    ) {
      return;
    }

    this.y += this.speed * (delta / 1000);

    if (this.variant === 'makeup' && !this.makeupBroken && this.y >= this.makeupBreakY) {
      this.breakOpen();
    }
  }

  public setHeldVisual(isHeld: boolean, depth: number): void {
    this.setDepth(depth);
    this.rotation = 0;

    if (!isHeld) {
      this.setScale(1);
    }
  }

  public markDropped(): void {
    this.ignoreBeltPause = false;
  }

  public isOnBelt(): boolean {
    return (
      this.x >= BELT_LEFT - 6 &&
      this.x <= BELT_RIGHT + 6 &&
      this.y >= BELT_TOP - 12 &&
      this.y <= BELT_BOTTOM + 24
    );
  }

  private getDefaultLabelText(size: PackageSize, destination: PackageDestination): string {
    if (destination === 'MISSED') {
      return 'MISS';
    }

    if (size === 'small_envelope') {
      return 'ENVELOPE';
    }

    if (size === 'small_box') {
      return 'SMALL BOX';
    }

    if (size === 'medium_box') {
      return 'PARCEL';
    }

    if (size === 'large_box') {
      return 'BIG BOX';
    }

    if (size === 'long_box') {
      return 'LONG BOX';
    }

    if (size === 'mesa_boogie') {
      return 'MESA';
    }

    if (size === 'quad_bike') {
      return 'ATV';
    }

    if (size === 'goji_berries') {
      return 'GOJI';
    }

    if (size === 'live_lobsters') {
      return 'LOBSTERS';
    }

    switch (destination) {
      case 'HERES_UR_SOVICE':
      case 'PAYTMAN':
      case 'BULK':
        return 'PARCEL';
    }
  }

  private getLabelFontSize(width: number, height: number): number {
    if (width <= 42 || height <= 24) {
      return 11;
    }

    return Math.min(14, Math.max(11, Math.floor(Math.min(width, height) * 0.34)));
  }

  private formatLabelText(text: string, maxWidth: number, fontSize: number): string {
    const words = text.trim().split(/\s+/).filter(Boolean);

    if (words.length <= 1) {
      return words[0] ?? '';
    }

    const singleLine = words.join(' ');
    const approximateTextWidth = singleLine.length * fontSize * 0.62;

    if (approximateTextWidth <= maxWidth) {
      return singleLine;
    }

    return words.join('\n');
  }

  private redrawBody(width: number, height: number, cornerRadius: number, fillColor: number): void {
    this.packageBody.clear();
    this.packageBody.fillStyle(fillColor, 1);
    this.packageBody.lineStyle(2, colors.upsBrownDark, 1);
    this.packageBody.fillRoundedRect(-width / 2, -height / 2, width, height, cornerRadius);
    this.packageBody.strokeRoundedRect(-width / 2, -height / 2, width, height, cornerRadius);
    this.packageBody.fillStyle(colors.white, 0.08);
    this.packageBody.fillRoundedRect(
      -width / 2 + 3,
      -height / 2 + 3,
      width - 6,
      Math.max(4, height * 0.22),
      Math.max(2, cornerRadius - 2),
    );
    this.packageBody.fillStyle(colors.black, 0.14);
    this.packageBody.fillRoundedRect(
      -width / 2 + 3,
      height / 2 - Math.max(5, height * 0.18) - 2,
      width - 6,
      Math.max(5, height * 0.18),
      Math.max(2, cornerRadius - 2),
    );

    if (
      this.size !== 'mesa_boogie' &&
      this.size !== 'quad_bike' &&
      this.size !== 'goji_berries' &&
      this.size !== 'live_lobsters'
    ) {
      const tapeColor = 0xc9a060;
      this.packageBody.fillStyle(tapeColor, 0.55);
      this.packageBody.fillRect(-width / 2 + 2, -3, width - 4, 6);
      this.packageBody.lineStyle(1, 0x8a6c30, 0.4);
      this.packageBody.beginPath();
      this.packageBody.moveTo(-width / 2 + 2, -3);
      this.packageBody.lineTo(width / 2 - 2, -3);
      this.packageBody.strokePath();
      this.packageBody.beginPath();
      this.packageBody.moveTo(-width / 2 + 2, 3);
      this.packageBody.lineTo(width / 2 - 2, 3);
      this.packageBody.strokePath();

      this.packageBody.fillStyle(colors.black, 0.18);
      const stripeCount = Math.max(2, Math.floor(width / 12));
      for (let i = 0; i < stripeCount; i += 1) {
        const sx = -width / 2 + 4 + (i * (width - 8)) / stripeCount;
        this.packageBody.fillRect(sx, -height / 2 + 4, 1, height - 8);
      }

      const barcodeW = Math.min(20, width * 0.32);
      const barcodeH = Math.min(8, height * 0.18);
      const barcodeX = width / 2 - barcodeW - 4;
      const barcodeY = height / 2 - barcodeH - 4;
      this.packageBody.fillStyle(colors.white, 0.85);
      this.packageBody.fillRect(barcodeX, barcodeY, barcodeW, barcodeH);
      this.packageBody.fillStyle(colors.black, 0.95);
      const bars = 7;
      for (let i = 0; i < bars; i += 1) {
        if (i % 2 === 0) {
          const bw = barcodeW / (bars * 2);
          this.packageBody.fillRect(
            barcodeX + 1 + (i * (barcodeW - 2)) / bars,
            barcodeY + 1,
            bw,
            barcodeH - 2,
          );
        }
      }
    }

    if (this.size === 'mesa_boogie') {
      this.packageBody.fillStyle(0x25262c, 1);
      this.packageBody.fillRoundedRect(-width / 2 + 6, -height / 2 + 8, width - 12, height - 16, 5);
      this.packageBody.lineStyle(1, 0x8d8f94, 0.85);
      for (let row = -height / 2 + 12; row < height / 2 - 8; row += 5) {
        this.packageBody.beginPath();
        this.packageBody.moveTo(-width / 2 + 10, row);
        this.packageBody.lineTo(width / 2 - 10, row);
        this.packageBody.strokePath();
      }
      this.packageBody.fillStyle(colors.black, 1);
      this.packageBody.fillCircle(-14, 0, 9);
      this.packageBody.fillCircle(14, 0, 9);
      this.packageBody.fillStyle(0x8d8f94, 1);
      this.packageBody.fillCircle(-14, 0, 5);
      this.packageBody.fillCircle(14, 0, 5);
      this.packageBody.fillStyle(colors.termiteHat, 1);
      this.packageBody.fillRect(-18, -height / 2 + 3, 5, 3);
      this.packageBody.fillRect(-9, -height / 2 + 3, 5, 3);
      this.packageBody.fillRect(0, -height / 2 + 3, 5, 3);
      this.packageBody.fillRect(9, -height / 2 + 3, 5, 3);
    }

    if (this.size === 'quad_bike') {
      this.packageBody.fillStyle(0x2c2c2c, 1);
      this.packageBody.fillCircle(-24, 12, 10);
      this.packageBody.fillCircle(24, 12, 10);
      this.packageBody.fillStyle(0x1a1a1a, 1);
      this.packageBody.fillCircle(-24, 12, 5);
      this.packageBody.fillCircle(24, 12, 5);
      this.packageBody.fillStyle(0xe45b42, 1);
      this.packageBody.fillRoundedRect(-18, -6, 36, 16, 5);
      this.packageBody.fillRect(-4, -12, 8, 8);
      this.packageBody.fillStyle(0x353535, 1);
      this.packageBody.fillRect(-2, -18, 4, 8);
      this.packageBody.fillRect(-18, -18, 16, 3);
      this.packageBody.fillRect(2, -18, 16, 3);
    }

    if (this.size === 'goji_berries') {
      this.packageBody.fillStyle(0x6d4d22, 1);
      this.packageBody.fillRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 4);
      this.packageBody.lineStyle(1, 0x9c7440, 0.9);
      this.packageBody.strokeRect(-width / 2 + 6, -height / 2 + 7, width - 12, height - 14);
      this.packageBody.fillStyle(0xd53a3a, 1);
      this.packageBody.fillCircle(-7, -4, 4);
      this.packageBody.fillCircle(2, -7, 4);
      this.packageBody.fillCircle(8, 0, 4);
      this.packageBody.fillCircle(-2, 4, 4);
      this.packageBody.fillStyle(0x7fa348, 1);
      this.packageBody.fillRect(-8, -10, 3, 2);
      this.packageBody.fillRect(1, -13, 3, 2);
      this.packageBody.fillRect(7, -6, 3, 2);
    }

    if (this.size === 'live_lobsters') {
      this.packageBody.fillStyle(0x17474f, 1);
      this.packageBody.fillRoundedRect(-width / 2 + 4, -height / 2 + 5, width - 8, height - 10, 5);
      this.packageBody.lineStyle(2, 0x74b8bd, 0.9);
      this.packageBody.strokeRoundedRect(-width / 2 + 7, -height / 2 + 8, width - 14, height - 16, 4);
      this.packageBody.fillStyle(0x74b8bd, 0.3);
      this.packageBody.fillRect(-width / 2 + 10, -2, width - 20, 5);
      this.packageBody.lineStyle(1, 0x0d2f35, 0.75);
      for (let x = -width / 2 + 14; x < width / 2 - 10; x += 12) {
        this.packageBody.beginPath();
        this.packageBody.moveTo(x, -height / 2 + 8);
        this.packageBody.lineTo(x + 5, height / 2 - 8);
        this.packageBody.strokePath();
      }
      this.packageBody.fillStyle(0xc0392b, 1);
      this.packageBody.fillEllipse(-16, 2, 12, 7);
      this.packageBody.fillEllipse(3, -4, 13, 8);
      this.packageBody.fillEllipse(17, 5, 10, 6);
      this.packageBody.fillStyle(0xf06b48, 1);
      this.packageBody.fillCircle(-23, -3, 4);
      this.packageBody.fillCircle(11, -10, 4);
      this.packageBody.lineStyle(1, 0x8c1f17, 0.9);
      this.packageBody.beginPath();
      this.packageBody.moveTo(-21, -4);
      this.packageBody.lineTo(-27, -9);
      this.packageBody.moveTo(12, -10);
      this.packageBody.lineTo(18, -15);
      this.packageBody.strokePath();
    }
  }

  private createSmellOverlay(
    scene: Phaser.Scene,
    width: number,
    height: number,
  ): Phaser.GameObjects.Graphics {
    const smellOverlay = scene.add.graphics();
    this.drawSmellLines(smellOverlay, width, height, 0);
    return smellOverlay;
  }

  private updateSmellLines(delta: number): void {
    if (!this.smellOverlay) {
      return;
    }

    this.smellAnimMs += delta;
    const { width, height } = PACKAGE_DIMENSIONS[this.size];
    this.drawSmellLines(this.smellOverlay, width, height, this.smellAnimMs);
  }

  private drawSmellLines(
    target: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    animMs: number,
  ): void {
    target.clear();

    const phase = animMs / 360;
    const curryGold = 0xd18a1f;
    const spiceRed = 0xb94a2f;
    const steamTop = -height / 2 - 18;
    const steamBottom = -height / 2 + 2;
    const starts = [-width * 0.28, 0, width * 0.28];

    starts.forEach((startX, index) => {
      const wave = Math.sin(phase + index * 1.4) * 2;
      const alpha = 0.54 + Math.sin(phase * 1.5 + index) * 0.14;
      target.lineStyle(2, index === 1 ? spiceRed : curryGold, alpha);
      target.beginPath();
      target.moveTo(startX, steamBottom);
      for (let step = 1; step <= 5; step += 1) {
        const progress = step / 5;
        const y = Phaser.Math.Linear(steamBottom, steamTop, progress);
        const x = startX + Math.sin(phase + index + progress * Math.PI * 1.7) * 6 + wave;
        target.lineTo(x, y);
      }
      target.strokePath();
    });

    target.fillStyle(curryGold, 0.7);
    target.fillCircle(-width * 0.42, -height / 2 - 8 + Math.sin(phase) * 2, 2);
    target.fillStyle(spiceRed, 0.65);
    target.fillCircle(width * 0.42, -height / 2 - 12 + Math.cos(phase * 1.2) * 2, 2);
  }

  private breakOpen(): void {
    this.makeupBroken = true;
    const { width, height } = PACKAGE_DIMENSIONS[this.size];
    this.crackOverlay.clear();
    this.crackOverlay.lineStyle(2, 0x7a4258, 0.95);
    this.crackOverlay.beginPath();
    this.crackOverlay.moveTo(-width / 2 + 5, -2);
    this.crackOverlay.lineTo(-6, -8);
    this.crackOverlay.lineTo(4, 2);
    this.crackOverlay.lineTo(width / 2 - 6, -5);
    this.crackOverlay.strokePath();
    this.crackOverlay.setVisible(true);

    this.spillOverlay.clear();
    this.spillOverlay.fillStyle(0xf3c0d8, 0.92);
    this.spillOverlay.fillEllipse(0, height / 2 + 4, width * 0.8, 10);
    this.spillOverlay.fillEllipse(-10, height / 2 + 7, width * 0.34, 6);
    this.spillOverlay.fillEllipse(12, height / 2 + 9, width * 0.28, 5);
    this.spillOverlay.setVisible(true);

    const puddle = this.scene.add.graphics();
    puddle.fillStyle(0xf0bfd7, 0.68);
    puddle.fillEllipse(this.x, this.y + height / 2 + 8, width * 0.95, 12);
    puddle.setDepth(9);

    this.scene.tweens.add({
      targets: puddle,
      alpha: 0.18,
      duration: 2200,
      ease: 'Quad.Out',
      onComplete: () => puddle.destroy(),
    });

    this.scene.tweens.add({
      targets: this,
      angle: 6,
      duration: 80,
      yoyo: true,
      ease: 'Quad.Out',
    });
  }
}
