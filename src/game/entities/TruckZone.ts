import Phaser from 'phaser';

import { colors } from '../config/colors';
import type { PackageDestination } from '../types/GameTypes';
import { isMobileBrowser } from '../utils/device';

type TruckSide = 'left' | 'right';

const DESTINATION_COLOR_MAP: Record<
  PackageDestination | 'PAULA_ABDUL',
  number
> = {
  HERES_UR_SOVICE: colors.destBlue,
  PAYTMAN: colors.destOrange,
  BULK: colors.destYellow,
  MISSED: colors.warningRed,
  PAULA_ABDUL: colors.destPurple,
};

type TruckZoneConfig = {
  id: string;
  label: string;
  acceptedDestination: PackageDestination;
  side: TruckSide;
  x: number;
  y: number;
  color?: number;
  width?: number;
  height?: number;
};

export class TruckZone extends Phaser.GameObjects.Container {
  public readonly id: string;

  public readonly label: string;

  public readonly acceptedDestination: PackageDestination;

  public readonly side: TruckSide;

  public readonly bounds: Phaser.Geom.Rectangle;

  private readonly dropZone: Phaser.Geom.Rectangle;

  private readonly flashOverlay: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, config: TruckZoneConfig) {
    super(scene, config.x, config.y);

    const width = config.width ?? 148;
    const height = config.height ?? 84;
    const isMobile = isMobileBrowser();
    const truckColor = config.color ?? DESTINATION_COLOR_MAP[config.acceptedDestination];
    const cargoWidth = 98;
    const cargoHeight = 58;
    const rearDoorWidth = 28;
    const cargoX = config.side === 'left' ? 14 : -14;
    const cabX = config.side === 'left' ? -46 : 46;
    const dropX =
      config.side === 'left'
        ? cargoX + cargoWidth / 2 + 12
        : cargoX - cargoWidth / 2 - 12;
    const dropWidth = 34;
    const dropHeight = cargoHeight - 8;

    this.id = config.id;
    this.label = config.label;
    this.acceptedDestination = config.acceptedDestination;
    this.side = config.side;

    const base = scene.add.graphics();
    base.fillStyle(colors.black, 0.22);
    base.fillRect(-width / 2 + 6, height / 2 - 8, width - 12, 8);
    base.fillStyle(truckColor, 1);
    base.fillRoundedRect(
      cargoX - cargoWidth / 2,
      -cargoHeight / 2,
      cargoWidth,
      cargoHeight,
      8,
    );
    base.fillStyle(colors.upsBrownDark, 0.35);
    base.fillRect(
      cargoX +
        (config.side === 'left'
          ? cargoWidth / 2 - rearDoorWidth - 6
          : -cargoWidth / 2 + 6),
      -cargoHeight / 2 + 6,
      rearDoorWidth,
      cargoHeight - 12,
    );
    base.fillStyle(colors.upsBrownLight, 0.95);
    base.fillRoundedRect(cabX - 18, -16, 34, 40, 6);
    base.fillStyle(colors.black, 0.18);
    base.fillRect(cabX - 10, -10, 16, 14);
    base.fillStyle(colors.beltRail, 1);
    base.fillRect(cargoX - cargoWidth / 2, cargoHeight / 2 - 8, cargoWidth, 5);

    const leftWheel = scene.add.circle(-28, 30, 10, colors.black, 1);
    const rightWheel = scene.add.circle(28, 30, 10, colors.black, 1);
    leftWheel.setStrokeStyle(2, colors.beltRail, 0.5);
    rightWheel.setStrokeStyle(2, colors.beltRail, 0.5);

    const label = scene.add.text(cargoX, -2, config.label, {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: isMobile ? '20px' : '13px',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: isMobile ? 6 : 0,
      wordWrap: { width: cargoWidth - 8 },
    });
    label.setOrigin(0.5);

    const dropZoneOutline = scene.add.graphics();
    dropZoneOutline.lineStyle(2, truckColor, 0.35);
    const dashLength = 8;
    const halfDropWidth = dropWidth / 2;
    const halfDropHeight = dropHeight / 2;
    for (let x = -halfDropWidth; x < halfDropWidth; x += dashLength * 2) {
      dropZoneOutline.beginPath();
      dropZoneOutline.moveTo(dropX + x, -halfDropHeight);
      dropZoneOutline.lineTo(dropX + Math.min(x + dashLength, halfDropWidth), -halfDropHeight);
      dropZoneOutline.strokePath();
      dropZoneOutline.beginPath();
      dropZoneOutline.moveTo(dropX + x, halfDropHeight);
      dropZoneOutline.lineTo(dropX + Math.min(x + dashLength, halfDropWidth), halfDropHeight);
      dropZoneOutline.strokePath();
    }
    for (let y = -halfDropHeight; y < halfDropHeight; y += dashLength * 2) {
      dropZoneOutline.beginPath();
      dropZoneOutline.moveTo(dropX - halfDropWidth, y);
      dropZoneOutline.lineTo(dropX - halfDropWidth, Math.min(y + dashLength, halfDropHeight));
      dropZoneOutline.strokePath();
      dropZoneOutline.beginPath();
      dropZoneOutline.moveTo(dropX + halfDropWidth, y);
      dropZoneOutline.lineTo(dropX + halfDropWidth, Math.min(y + dashLength, halfDropHeight));
      dropZoneOutline.strokePath();
    }

    this.flashOverlay = scene.add.rectangle(cargoX, 0, cargoWidth, cargoHeight, 0xffffff, 0);

    this.add([
      base,
      leftWheel,
      rightWheel,
      label,
      dropZoneOutline,
      this.flashOverlay,
    ]);
    this.setDepth(8);

    this.bounds = new Phaser.Geom.Rectangle(config.x - width / 2, config.y - height / 2, width, height);
    this.dropZone = new Phaser.Geom.Rectangle(
      config.x + dropX - dropWidth / 2,
      config.y - dropHeight / 2,
      dropWidth,
      dropHeight,
    );

    scene.add.existing(this);
  }

  public containsPoint(x: number, y: number): boolean {
    return Phaser.Geom.Rectangle.Contains(this.dropZone, x, y);
  }

  public flashAccept(): void {
    this.flash(0x3bd66c);
  }

  public flashReject(): void {
    this.flash(colors.warningRed);
  }

  private flash(color: number): void {
    this.flashOverlay.fillColor = color;
    this.flashOverlay.setAlpha(0.45);
    this.scene.tweens.add({
      targets: this.flashOverlay,
      alpha: 0,
      duration: 180,
      ease: 'Quad.Out',
    });
  }
}
