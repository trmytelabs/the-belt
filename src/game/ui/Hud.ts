import Phaser from 'phaser';

import { colors } from '../config/colors';
import { fonts, textColors } from '../config/typography';
import type { PlayerId } from '../types/GameTypes';
import type { ScoreState } from '../systems/ScoreSystem';

const HUD_Y = 642;
const HUD_HEIGHT = 78;
const GAME_WIDTH = 960;
const ERROR_LIMIT = 10;
const TIME_TOTAL_HINT_MS = 180_000;

export class Hud extends Phaser.GameObjects.Container {
  private readonly scoreValue: Phaser.GameObjects.Text;

  private readonly comboBadge: Phaser.GameObjects.Container;

  private readonly comboBadgeBg: Phaser.GameObjects.Graphics;

  private readonly comboValue: Phaser.GameObjects.Text;

  private readonly timeText: Phaser.GameObjects.Text;

  private readonly timeBarFill: Phaser.GameObjects.Graphics;

  private readonly errorDots: Phaser.GameObjects.Graphics;

  private readonly activePill: Phaser.GameObjects.Graphics;

  private readonly activeText: Phaser.GameObjects.Text;

  private readonly vicChip: Phaser.GameObjects.Graphics;

  private readonly vicText: Phaser.GameObjects.Text;

  private readonly beltPill: Phaser.GameObjects.Graphics;

  private readonly beltText: Phaser.GameObjects.Text;

  private lastCombo = 0;

  private lastErrors = 0;

  private lastBeltRunning = true;

  private lastVicWarning = false;

  private lastActiveId: PlayerId | null = null;

  private currentTimeFraction = -1;

  constructor(scene: Phaser.Scene, controlsHint: string) {
    super(scene, 0, 0);

    const panel = scene.add.graphics();
    this.drawPanel(panel);

    const controlsText = scene.add.text(GAME_WIDTH / 2, HUD_Y + 12, controlsHint, {
      color: '#d2c8bc',
      fontFamily: fonts.body,
      fontSize: '12px',
      fontStyle: 'bold',
    });
    controlsText.setOrigin(0.5);
    controlsText.setLetterSpacing(1);

    const scoreLabel = this.createLabel(scene, 30, HUD_Y + 28, 'SCORE');
    this.scoreValue = scene.add.text(30, HUD_Y + 51, '0', {
      color: textColors.primary,
      fontFamily: fonts.display,
      fontSize: '42px',
    });
    this.scoreValue.setOrigin(0, 0.5);

    const comboLabel = this.createLabel(scene, 164, HUD_Y + 28, 'COMBO');
    this.comboBadgeBg = scene.add.graphics();
    this.comboValue = scene.add.text(194, HUD_Y + 56, 'x0', {
      color: textColors.accent,
      fontFamily: fonts.display,
      fontSize: '30px',
    });
    this.comboValue.setOrigin(0.5);
    this.comboBadge = scene.add.container(0, 0, [this.comboBadgeBg, this.comboValue]);

    const timeLabel = this.createLabel(scene, 268, HUD_Y + 28, 'TIME');
    this.timeText = scene.add.text(268, HUD_Y + 52, '03:00', {
      color: textColors.primary,
      fontFamily: fonts.mono,
      fontSize: '25px',
      fontStyle: 'bold',
    });
    this.timeText.setOrigin(0, 0.5);
    this.timeBarFill = scene.add.graphics();

    const errorsLabel = this.createLabel(scene, 402, HUD_Y + 28, 'ERRORS');
    this.errorDots = scene.add.graphics();

    const activeLabel = this.createLabel(scene, 604, HUD_Y + 28, 'ACTIVE');
    this.activePill = scene.add.graphics();
    this.activeText = scene.add.text(674, HUD_Y + 56, 'TERMITE', {
      color: textColors.primary,
      fontFamily: fonts.body,
      fontSize: '15px',
      fontStyle: 'bold',
    });
    this.activeText.setOrigin(0.5);
    this.activeText.setLetterSpacing(1);

    const eventLabel = this.createLabel(scene, 752, HUD_Y + 28, 'EVENT');
    this.vicChip = scene.add.graphics();
    this.vicText = scene.add.text(800, HUD_Y + 56, '0:00', {
      color: textColors.accent,
      fontFamily: fonts.mono,
      fontSize: '16px',
      fontStyle: 'bold',
    });
    this.vicText.setOrigin(0.5);

    const beltLabel = this.createLabel(scene, 864, HUD_Y + 28, 'BELT');
    this.beltPill = scene.add.graphics();
    this.beltText = scene.add.text(902, HUD_Y + 56, 'RUN', {
      color: '#a8f5c4',
      fontFamily: fonts.body,
      fontSize: '14px',
      fontStyle: 'bold',
    });
    this.beltText.setOrigin(0.5);
    this.beltText.setLetterSpacing(1);

    this.add([
      controlsText,
      panel,
      scoreLabel,
      this.scoreValue,
      comboLabel,
      this.comboBadge,
      timeLabel,
      this.timeText,
      this.timeBarFill,
      errorsLabel,
      this.errorDots,
      activeLabel,
      this.activePill,
      this.activeText,
      eventLabel,
      this.vicChip,
      this.vicText,
      beltLabel,
      this.beltPill,
      this.beltText,
    ]);
    this.setDepth(50);

    scene.add.existing(this);

    this.drawComboBadge(0);
    this.drawTimeBar(1);
    this.drawErrorDots(0);
    this.drawActivePill('termite');
    this.drawVicChip(false);
    this.drawBeltPill(true);
  }

  public updateHud(
    state: ScoreState,
    activePlayerId: PlayerId,
    remainingMs: number,
    nextVicSeconds: number,
    beltRunning: boolean,
  ): void {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    const vicMinutes = Math.floor(nextVicSeconds / 60);
    const vicSeconds = String(nextVicSeconds % 60).padStart(2, '0');

    this.scoreValue.setText(String(state.score));
    this.fitScoreValue();
    this.timeText.setText(`${minutes}:${seconds}`);
    this.vicText.setText(`${vicMinutes}:${vicSeconds}`);

    const fraction = Math.max(0, Math.min(1, remainingMs / TIME_TOTAL_HINT_MS));
    if (Math.abs(fraction - this.currentTimeFraction) > 0.005) {
      this.currentTimeFraction = fraction;
      this.drawTimeBar(fraction);
    }

    if (state.combo !== this.lastCombo) {
      this.comboValue.setText(`x${state.combo}`);
      this.drawComboBadge(state.combo);
      if (state.combo > this.lastCombo && state.combo > 0) {
        this.flashCombo();
      }
      this.lastCombo = state.combo;
    }

    if (state.errors !== this.lastErrors) {
      this.drawErrorDots(state.errors);
      this.lastErrors = state.errors;
    }

    if (activePlayerId !== this.lastActiveId) {
      this.activeText.setText(activePlayerId.toUpperCase());
      this.drawActivePill(activePlayerId);
      this.lastActiveId = activePlayerId;
    }

    if (beltRunning !== this.lastBeltRunning) {
      this.drawBeltPill(beltRunning);
      this.lastBeltRunning = beltRunning;
    }

    const vicWarning = nextVicSeconds <= 10;
    if (vicWarning !== this.lastVicWarning) {
      this.drawVicChip(vicWarning);
      this.lastVicWarning = vicWarning;
    }
  }

  private createLabel(scene: Phaser.Scene, x: number, y: number, label: string): Phaser.GameObjects.Text {
    const text = scene.add.text(x, y, label, {
      color: '#9c9288',
      fontFamily: fonts.body,
      fontSize: '11px',
      fontStyle: 'bold',
    });
    text.setOrigin(0, 0.5);
    text.setLetterSpacing(2);
    return text;
  }

  private drawPanel(panel: Phaser.GameObjects.Graphics): void {
    panel.clear();
    panel.fillStyle(colors.black, 0.26);
    panel.fillRect(0, HUD_Y - 10, GAME_WIDTH, HUD_HEIGHT + 10);
    panel.fillStyle(0x100d0b, 0.94);
    panel.fillRoundedRect(14, HUD_Y, GAME_WIDTH - 28, HUD_HEIGHT - 6, 8);
    panel.lineStyle(1, colors.upsBrownHighlight, 0.38);
    panel.strokeRoundedRect(14, HUD_Y, GAME_WIDTH - 28, HUD_HEIGHT - 6, 8);
    panel.fillStyle(colors.fluorescent, 0.08);
    panel.fillRect(16, HUD_Y + 1, GAME_WIDTH - 32, 1);

    const dividers = [144, 244, 384, 584, 734, 854];
    panel.lineStyle(1, colors.white, 0.08);
    for (const x of dividers) {
      panel.beginPath();
      panel.moveTo(x, HUD_Y + 24);
      panel.lineTo(x, HUD_Y + 68);
      panel.strokePath();
    }
  }

  private drawComboBadge(combo: number): void {
    const g = this.comboBadgeBg;
    g.clear();
    const hot = combo >= 5;
    g.fillStyle(hot ? 0x4a2a0e : 0x201710, 0.92);
    g.fillRoundedRect(164, HUD_Y + 41, 60, 30, 7);
    g.lineStyle(1.5, hot ? 0xffd866 : 0x6a5530, 0.92);
    g.strokeRoundedRect(164, HUD_Y + 41, 60, 30, 7);
  }

  private flashCombo(): void {
    this.scene.tweens.add({
      targets: this.comboBadge,
      scale: { from: 1.16, to: 1 },
      duration: 220,
      ease: 'Cubic.easeOut',
    });
  }

  private drawTimeBar(fraction: number): void {
    const g = this.timeBarFill;
    g.clear();
    const x = 268;
    const y = HUD_Y + 68;
    const w = 92;
    const h = 7;
    const lowTime = fraction < 0.2;
    const fillColor = lowTime ? 0xff5d5d : fraction < 0.5 ? 0xffb347 : 0x61f29b;

    g.fillStyle(0x30251d, 1);
    g.fillRoundedRect(x, y, w, h, 4);
    g.fillStyle(fillColor, 0.96);
    g.fillRoundedRect(x, y, Math.max(4, w * fraction), h, 4);
  }

  private drawErrorDots(errors: number): void {
    const g = this.errorDots;
    g.clear();
    const startX = 402;
    const y = HUD_Y + 56;
    const spacing = 17;

    for (let i = 0; i < ERROR_LIMIT; i += 1) {
      const cx = startX + i * spacing;
      const filled = i < errors;
      if (filled) {
        const dangerLevel = errors >= ERROR_LIMIT - 2 ? 1 : errors / ERROR_LIMIT;
        const color =
          dangerLevel >= 0.8 ? 0xff3b3b : dangerLevel >= 0.5 ? 0xffb347 : 0xffd866;
        g.fillStyle(color, 0.96);
        g.fillCircle(cx, y, 5);
        g.lineStyle(1, colors.black, 0.45);
        g.strokeCircle(cx, y, 5);
      } else {
        g.fillStyle(0x2a241e, 0.92);
        g.fillCircle(cx, y, 4.5);
        g.lineStyle(1, 0x5a5148, 0.72);
        g.strokeCircle(cx, y, 4.5);
      }
    }
  }

  private drawActivePill(activeId: PlayerId): void {
    const g = this.activePill;
    g.clear();
    const accent = activeId === 'termite' ? 0x3a78c8 : 0xa04020;
    g.fillStyle(accent, 0.24);
    g.fillRoundedRect(604, HUD_Y + 41, 138, 30, 7);
    g.lineStyle(1.5, accent, 0.95);
    g.strokeRoundedRect(604, HUD_Y + 41, 138, 30, 7);
  }

  private drawVicChip(warning: boolean): void {
    const g = this.vicChip;
    g.clear();
    const accent = warning ? 0xff5d5d : 0x6a5530;
    const fill = warning ? 0x3a1414 : 0x201710;
    g.fillStyle(fill, 0.92);
    g.fillRoundedRect(752, HUD_Y + 41, 96, 30, 7);
    g.lineStyle(1.5, accent, 0.94);
    g.strokeRoundedRect(752, HUD_Y + 41, 96, 30, 7);
    this.vicText.setColor(warning ? '#ffb0b0' : '#ffd866');
  }

  private drawBeltPill(running: boolean): void {
    const g = this.beltPill;
    g.clear();
    const accent = running ? 0x2a8a4a : 0xb02828;
    const fill = running ? 0x143a22 : 0x3a1414;
    g.fillStyle(fill, 0.92);
    g.fillRoundedRect(864, HUD_Y + 41, 76, 30, 7);
    g.lineStyle(1.5, accent, 0.95);
    g.strokeRoundedRect(864, HUD_Y + 41, 76, 30, 7);
    g.fillStyle(running ? 0x61f29b : 0xff5d5d, 1);
    g.fillCircle(878, HUD_Y + 56, 4);
    this.beltText.setText(running ? 'RUN' : 'STOP');
    this.beltText.setColor(running ? '#a8f5c4' : '#ffb0b0');
  }

  private fitScoreValue(): void {
    this.scoreValue.setScale(1);
    const maxWidth = 104;
    if (this.scoreValue.width <= maxWidth) {
      return;
    }

    const scale = Math.max(0.72, maxWidth / this.scoreValue.width);
    this.scoreValue.setScale(scale, 1);
  }
}
