import Phaser from 'phaser';

import { colors } from '../config/colors';
import { isMobileBrowser } from '../utils/device';

type BulkPileZoneConfig = {
  x: number;
  y: number;
};

export class BulkPileZone extends Phaser.GameObjects.Container {
  public readonly bounds: Phaser.Geom.Rectangle;

  public depositedCount = 0;

  private readonly flashOverlay: Phaser.GameObjects.Rectangle;

  private readonly stackBoxes: Phaser.GameObjects.Container[] = [];

  private readonly countText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: BulkPileZoneConfig) {
    super(scene, config.x, config.y);

    const width = 124;
    const height = 40;
    const isMobile = isMobileBrowser();

    const pallet = scene.add.graphics();
    pallet.fillStyle(colors.upsBrownMid, 1);
    pallet.fillRect(-width / 2, -height / 2, width, height);
    pallet.fillStyle(colors.upsBrownDark, 1);
    for (let x = -width / 2 + 8; x <= width / 2 - 20; x += 26) {
      pallet.fillRect(x, -height / 2 + 4, 18, height - 8);
    }
    pallet.fillStyle(colors.black, 0.2);
    pallet.fillRect(-width / 2, -height / 2 + 10, width, 3);
    pallet.fillRect(-width / 2, 4, width, 3);

    const glow = scene.add.rectangle(0, 0, width + 18, height + 14, colors.destYellow, 0);
    glow.setStrokeStyle(2, colors.destYellow, 0.22);

    const label = scene.add.text(0, -34, 'BULK PILE', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: isMobile ? '19px' : '12px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isMobile ? 6 : 0,
    });
    label.setOrigin(0.5);

    this.flashOverlay = scene.add.rectangle(0, 0, width, height, 0xffffff, 0);

    const stackPositions = [
      new Phaser.Math.Vector2(-38, -9),
      new Phaser.Math.Vector2(-14, -15),
      new Phaser.Math.Vector2(12, -11),
      new Phaser.Math.Vector2(38, -16),
      new Phaser.Math.Vector2(0, -20),
    ];

    for (const position of stackPositions) {
      const box = this.createStackBox(scene, position.x, position.y);
      box.setVisible(false);
      this.stackBoxes.push(box);
    }

    this.countText = scene.add.text(width / 2 - 10, -height / 2 - 6, '', {
      color: '#fff8c4',
      fontFamily: 'Arial',
      fontSize: isMobile ? '19px' : '12px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.countText.setOrigin(1, 0.5);
    this.countText.setVisible(false);

    this.add([glow, pallet, ...this.stackBoxes, this.flashOverlay, label, this.countText]);
    this.setDepth(9);

    this.bounds = new Phaser.Geom.Rectangle(config.x - width / 2, config.y - height / 2, width, height);

    scene.add.existing(this);
  }

  public containsPoint(x: number, y: number): boolean {
    return Phaser.Geom.Rectangle.Contains(this.bounds, x, y);
  }

  public incrementCount(): void {
    this.depositedCount += 1;
    this.updateStackVisuals();
  }

  public removeCount(amount = 1): number {
    const removed = Math.min(this.depositedCount, Math.max(0, amount));
    this.depositedCount -= removed;
    this.updateStackVisuals();
    return removed;
  }

  public getCount(): number {
    return this.depositedCount;
  }

  public flashAccept(): void {
    this.flash(0x3bd66c);
  }

  public flashReject(): void {
    this.flash(colors.warningRed);
  }

  private flash(color: number): void {
    this.flashOverlay.fillColor = color;
    this.flashOverlay.setAlpha(0.35);
    this.scene.tweens.add({
      targets: this.flashOverlay,
      alpha: 0,
      duration: 180,
      ease: 'Quad.Out',
    });
  }

  private createStackBox(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
    const boxBody = scene.add.rectangle(0, 0, 20, 14, colors.upsBrownLight, 1);
    boxBody.setStrokeStyle(1, colors.upsBrownDark, 1);
    const tape = scene.add.rectangle(0, 0, 4, 14, colors.destYellow, 0.9);
    const shadow = scene.add.rectangle(0, 7, 14, 2, colors.black, 0.12);
    return scene.add.container(x, y, [shadow, boxBody, tape]);
  }

  private updateStackVisuals(): void {
    const visibleBoxCount = Math.min(this.depositedCount, this.stackBoxes.length);

    for (let index = 0; index < this.stackBoxes.length; index += 1) {
      this.stackBoxes[index].setVisible(index < visibleBoxCount);
    }

    this.countText.setVisible(this.depositedCount > 0);
    this.countText.setText(`x${this.depositedCount}`);
  }
}
