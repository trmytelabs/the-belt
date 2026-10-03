import Phaser from 'phaser';

import { colors } from '../config/colors';
import { fonts, fontSizes } from '../config/typography';

export type CalloutPointer = 'down' | 'up' | 'none';

export type CalloutOptions = {
  fontSize?: string;
  textColor?: string;
  bgColor?: number;
  bgAlpha?: number;
  borderColor?: number;
  borderAlpha?: number;
  pointer?: CalloutPointer;
  offsetY?: number;
  maxWidth?: number;
};

export class Callout extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Graphics;

  private readonly textObj: Phaser.GameObjects.Text;

  private readonly options: Required<Omit<CalloutOptions, 'maxWidth'>> & {
    maxWidth?: number;
  };

  constructor(scene: Phaser.Scene, options: CalloutOptions = {}) {
    super(scene, 0, 0);

    this.options = {
      fontSize: options.fontSize ?? fontSizes.xs,
      textColor: options.textColor ?? '#ffffff',
      bgColor: options.bgColor ?? colors.black,
      bgAlpha: options.bgAlpha ?? 0.82,
      borderColor: options.borderColor ?? colors.white,
      borderAlpha: options.borderAlpha ?? 0.2,
      pointer: options.pointer ?? 'down',
      offsetY: options.offsetY ?? -70,
      maxWidth: options.maxWidth,
    };

    this.background = scene.add.graphics();
    this.textObj = scene.add.text(0, this.options.offsetY, '', {
      color: this.options.textColor,
      fontFamily: fonts.body,
      fontSize: this.options.fontSize,
      fontStyle: 'bold',
      align: 'center',
      ...(this.options.maxWidth
        ? { wordWrap: { width: this.options.maxWidth } }
        : {}),
    });
    this.textObj.setOrigin(0.5);

    this.add([this.background, this.textObj]);
    this.setVisible(false);
    scene.add.existing(this);
  }

  public show(text: string): void {
    this.textObj.setText(text);
    this.redraw();
    this.setVisible(true);
  }

  public hide(): void {
    this.setVisible(false);
  }

  public setColors(opts: { bgColor?: number; borderColor?: number; textColor?: string }): void {
    if (opts.bgColor !== undefined) this.options.bgColor = opts.bgColor;
    if (opts.borderColor !== undefined) this.options.borderColor = opts.borderColor;
    if (opts.textColor !== undefined) {
      this.options.textColor = opts.textColor;
      this.textObj.setColor(opts.textColor);
    }
    if (this.visible) this.redraw();
  }

  private redraw(): void {
    const bounds = this.textObj.getBounds();
    const padX = 10;
    const padY = 6;
    const width = Math.max(28, bounds.width + padX * 2);
    const height = bounds.height + padY * 2;
    const top = this.options.offsetY - height / 2;

    this.background.clear();
    this.background.fillStyle(this.options.bgColor, this.options.bgAlpha);
    this.background.fillRoundedRect(-width / 2, top, width, height, 8);
    this.background.lineStyle(2, this.options.borderColor, this.options.borderAlpha);
    this.background.strokeRoundedRect(-width / 2, top, width, height, 8);

    if (this.options.pointer === 'down') {
      const baseY = top + height;
      this.background.fillStyle(this.options.bgColor, this.options.bgAlpha);
      this.background.fillTriangle(-6, baseY - 1, 6, baseY - 1, 0, baseY + 10);
    } else if (this.options.pointer === 'up') {
      this.background.fillStyle(this.options.bgColor, this.options.bgAlpha);
      this.background.fillTriangle(-6, top + 1, 6, top + 1, 0, top - 10);
    }
  }
}
