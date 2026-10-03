import Phaser from 'phaser';

import { colors } from '../config/colors';
import { audioSystem } from './AudioSystem';

export type BeltState = 'running' | 'stopped';

export const BELT_CENTER_X = 480;
export const BELT_WIDTH = 104;
export const BELT_LEFT = 428;
export const BELT_RIGHT = 532;
export const BELT_TOP = 60;
export const BELT_BOTTOM = 660;

const BELT_HEIGHT = BELT_BOTTOM - BELT_TOP;
const CHEVRON_SPACING = 30;
const CHEVRON_TOP_PADDING = 52;
const CHEVRON_BOTTOM_PADDING = 12;

export class BeltSystem {
  public currentState: BeltState = 'running';

  public beltGraphics!: Phaser.GameObjects.Container;

  private _beltSpeed = 80;

  private chevronGraphics!: Phaser.GameObjects.Graphics;

  private treadGraphics!: Phaser.GameObjects.Graphics;

  private treadOffset = 0;

  public create(scene: Phaser.Scene): void {
    const baseGraphics = scene.add.graphics();
    baseGraphics.fillStyle(colors.black, 0.32);
    baseGraphics.fillRoundedRect(BELT_LEFT - 14, BELT_TOP - 4, BELT_WIDTH + 28, BELT_HEIGHT + 8, 10);
    baseGraphics.fillStyle(colors.belt, 1);
    baseGraphics.fillRect(BELT_LEFT, BELT_TOP, BELT_WIDTH, BELT_HEIGHT);
    baseGraphics.fillStyle(colors.beltMid, 1);
    baseGraphics.fillRect(BELT_LEFT + 8, BELT_TOP, BELT_WIDTH - 16, BELT_HEIGHT);
    baseGraphics.fillStyle(0x383838, 0.45);
    baseGraphics.fillRect(BELT_LEFT + 12, BELT_TOP, 8, BELT_HEIGHT);
    baseGraphics.fillStyle(colors.black, 0.28);
    baseGraphics.fillRect(BELT_RIGHT - 20, BELT_TOP, 10, BELT_HEIGHT);
    baseGraphics.fillStyle(colors.beltRail, 1);
    baseGraphics.fillRect(BELT_LEFT, BELT_TOP, 6, BELT_HEIGHT);
    baseGraphics.fillRect(BELT_RIGHT - 6, BELT_TOP, 6, BELT_HEIGHT);
    baseGraphics.fillStyle(0x8a8a8a, 0.7);
    baseGraphics.fillRect(BELT_LEFT + 1, BELT_TOP, 2, BELT_HEIGHT);
    baseGraphics.fillRect(BELT_RIGHT - 3, BELT_TOP, 2, BELT_HEIGHT);
    baseGraphics.fillStyle(colors.black, 0.35);
    baseGraphics.fillRect(BELT_LEFT + 6, BELT_TOP, 4, BELT_HEIGHT);
    baseGraphics.fillRect(BELT_RIGHT - 10, BELT_TOP, 4, BELT_HEIGHT);
    this.drawRollers(baseGraphics);

    this.treadGraphics = scene.add.graphics();
    this.treadGraphics.setDepth(5.5);

    this.chevronGraphics = scene.add.graphics();
    this.chevronGraphics.setDepth(6);

    this.beltGraphics = scene.add.container(0, 0, [
      baseGraphics,
      this.treadGraphics,
      this.chevronGraphics,
    ]);
    this.beltGraphics.setDepth(5);

    this.redrawTreads();
    this.redrawChevrons();
  }

  public update(delta: number): void {
    if (this.currentState === 'running') {
      this.treadOffset =
        (this.treadOffset + this._beltSpeed * (delta / 1000)) % CHEVRON_SPACING;
      this.redrawTreads();
      this.redrawChevrons();
    }
  }

  public stop(): void {
    if (this.currentState === 'stopped') {
      return;
    }

    this.currentState = 'stopped';
    audioSystem.play('belt-stop');
  }

  public start(): void {
    if (this.currentState === 'running') {
      return;
    }

    this.currentState = 'running';
    audioSystem.play('belt-start');
  }

  public isRunning(): boolean {
    return this.currentState === 'running';
  }

  public get beltSpeed(): number {
    return this._beltSpeed;
  }

  public setBeltSpeed(speed: number): void {
    this._beltSpeed = speed;
  }

  private drawRollers(target: Phaser.GameObjects.Graphics): void {
    const rollerYs = [BELT_TOP + 18, BELT_BOTTOM - 18];

    for (const y of rollerYs) {
      target.fillStyle(colors.black, 0.42);
      target.fillRoundedRect(BELT_LEFT + 6, y - 12, BELT_WIDTH - 12, 24, 8);
      target.fillStyle(0x444444, 1);
      target.fillRoundedRect(BELT_LEFT + 10, y - 8, BELT_WIDTH - 20, 16, 7);
      target.fillStyle(0x777777, 0.7);
      target.fillRect(BELT_LEFT + 14, y - 6, BELT_WIDTH - 28, 3);
      target.fillStyle(colors.black, 0.28);
      target.fillRect(BELT_LEFT + 14, y + 4, BELT_WIDTH - 28, 3);
    }
  }

  private redrawTreads(): void {
    this.treadGraphics.clear();
    this.treadGraphics.lineStyle(1, colors.black, 0.24);

    for (let y = BELT_TOP - 14 + this.treadOffset; y <= BELT_BOTTOM + 12; y += 15) {
      this.treadGraphics.beginPath();
      this.treadGraphics.moveTo(BELT_LEFT + 10, y);
      this.treadGraphics.lineTo(BELT_RIGHT - 10, y);
      this.treadGraphics.strokePath();
    }

    this.treadGraphics.lineStyle(1, colors.white, 0.055);
    for (let y = BELT_TOP - 10 + this.treadOffset; y <= BELT_BOTTOM + 12; y += 30) {
      this.treadGraphics.beginPath();
      this.treadGraphics.moveTo(BELT_LEFT + 13, y);
      this.treadGraphics.lineTo(BELT_RIGHT - 13, y + 4);
      this.treadGraphics.strokePath();
    }
  }

  private redrawChevrons(): void {
    this.chevronGraphics.clear();
    this.chevronGraphics.lineStyle(4, colors.warehouseFloorDark, 0.95);

    const centerX = BELT_CENTER_X;
    const leftX = BELT_LEFT + 14;
    const rightX = BELT_RIGHT - 14;
    const chevronStartY = BELT_TOP + CHEVRON_TOP_PADDING;
    const chevronEndY = BELT_BOTTOM - CHEVRON_BOTTOM_PADDING;

    for (
      let y = chevronStartY - CHEVRON_SPACING + this.treadOffset;
      y <= chevronEndY + CHEVRON_SPACING;
      y += CHEVRON_SPACING
    ) {
      if (y < chevronStartY || y > chevronEndY) {
        continue;
      }

      this.chevronGraphics.beginPath();
      this.chevronGraphics.moveTo(leftX, y - 8);
      this.chevronGraphics.lineTo(centerX, y + 8);
      this.chevronGraphics.lineTo(rightX, y - 8);
      this.chevronGraphics.strokePath();

      this.chevronGraphics.lineStyle(2, colors.fluorescent, 0.18);
      this.chevronGraphics.beginPath();
      this.chevronGraphics.moveTo(leftX + 2, y - 8);
      this.chevronGraphics.lineTo(centerX, y + 6);
      this.chevronGraphics.lineTo(rightX - 2, y - 8);
      this.chevronGraphics.strokePath();
      this.chevronGraphics.lineStyle(4, colors.warehouseFloorDark, 0.95);
    }
  }
}
