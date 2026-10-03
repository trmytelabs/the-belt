import Phaser from 'phaser';

import { audioSystem } from './AudioSystem';
import { BeltEventSystem } from './BeltEventSystem';
import { BeltSystem } from './BeltSystem';
import type { ScoreState } from './ScoreSystem';
import { SpawnSystem } from './SpawnSystem';

export type ShiftGrade = 'S' | 'A' | 'B' | 'C' | 'F';

export type ShiftResultsData = {
  score: number;
  accuracy: number;
  packagesSorted: number;
  bulkSorted: number;
  missed: number;
  errors: number;
  grade: ShiftGrade;
  gradeQuote: string;
};

type ShiftSystemConfig = {
  beltSystem: BeltSystem;
  spawnSystem: SpawnSystem;
  beltEventSystem: BeltEventSystem;
  onShiftComplete: (results: ShiftResultsData) => void;
};

type ShiftPhase = 'countdown' | 'running' | 'cleanup' | 'complete';

const COUNTDOWN_STEPS = ['3', '2', '1', 'SORT!'] as const;

export class ShiftSystem {
  private scene!: Phaser.Scene;

  private beltSystem!: BeltSystem;

  private spawnSystem!: SpawnSystem;

  private beltEventSystem!: BeltEventSystem;

  private onShiftComplete!: (results: ShiftResultsData) => void;

  private phase: ShiftPhase = 'countdown';

  private readonly shiftDurationMs = 180_000;

  private remainingMs = this.shiftDurationMs;

  private cleanupTimerMs = 16_000;

  private cleanupElapsedMs = 0;

  private countdownIndex = 0;

  private countdownTimerMs = 900;

  private countdownText!: Phaser.GameObjects.Text;

  public create(scene: Phaser.Scene, config: ShiftSystemConfig): void {
    this.scene = scene;
    this.beltSystem = config.beltSystem;
    this.spawnSystem = config.spawnSystem;
    this.beltEventSystem = config.beltEventSystem;
    this.onShiftComplete = config.onShiftComplete;
    this.phase = 'countdown';
    this.remainingMs = this.shiftDurationMs;
    this.cleanupTimerMs = 16_000;
    this.cleanupElapsedMs = 0;
    this.countdownIndex = 0;
    this.countdownTimerMs = 900;

    this.spawnSystem.setSpawningEnabled(false);
    this.beltEventSystem.stopEvents();
    scene.input.enabled = false;

    this.countdownText = scene.add.text(480, 296, COUNTDOWN_STEPS[0], {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '76px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    });
    this.countdownText.setOrigin(0.5);
    this.countdownText.setDepth(60);
    audioSystem.play('countdown');
  }

  public update(
    delta: number,
    scoreState: ScoreState,
    activePackageCount: number,
    playersHoldingCount: number,
  ): void {
    if (this.phase === 'countdown') {
      this.updateCountdown(delta);
      return;
    }

    if (this.phase === 'running') {
      this.remainingMs = Math.max(0, this.remainingMs - delta);
      this.applyDifficultyRamp();

      if (this.remainingMs <= 0) {
        this.phase = 'cleanup';
        this.cleanupElapsedMs = 0;
        this.spawnSystem.setSpawningEnabled(false);
        this.beltEventSystem.stopEvents();
        this.beltSystem.stop();
        audioSystem.play('shift-end');
        this.scene.events.emit('shift-ended-horn');
      }

      return;
    }

    if (this.phase === 'cleanup') {
      this.cleanupTimerMs = Math.max(0, this.cleanupTimerMs - delta);
      this.cleanupElapsedMs += delta;

      if (
        (this.cleanupElapsedMs >= 6_000 && activePackageCount === 0 && playersHoldingCount === 0) ||
        this.cleanupTimerMs <= 0
      ) {
        this.phase = 'complete';
        this.onShiftComplete(this.buildResults(scoreState));
      }
    }
  }

  public getRemainingMs(): number {
    return this.phase === 'countdown' ? this.shiftDurationMs : Math.max(0, this.remainingMs);
  }

  public isGameplayActive(): boolean {
    return this.phase === 'running' || this.phase === 'cleanup';
  }

  private updateCountdown(delta: number): void {
    this.countdownTimerMs -= delta;

    if (this.countdownTimerMs > 0) {
      return;
    }

    this.countdownIndex += 1;

    if (this.countdownIndex >= COUNTDOWN_STEPS.length) {
      this.countdownText.destroy();
      this.phase = 'running';
      this.scene.input.enabled = true;
      this.spawnSystem.setSpawningEnabled(true);
      this.spawnSystem.setSpawnInterval(3800);
      this.beltSystem.setBeltSpeed(85);
      this.spawnSystem.setPackageSpeed(85);
      this.beltEventSystem.beginShift();
      return;
    }

    this.countdownText.setText(COUNTDOWN_STEPS[this.countdownIndex]);
    audioSystem.play(
      this.countdownIndex === COUNTDOWN_STEPS.length - 1 ? 'countdown-go' : 'countdown',
    );
    this.countdownText.setScale(this.countdownIndex === COUNTDOWN_STEPS.length - 1 ? 0.85 : 1);
    this.scene.tweens.add({
      targets: this.countdownText,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 120,
      yoyo: true,
      ease: 'Quad.Out',
    });
    this.countdownTimerMs = this.countdownIndex === COUNTDOWN_STEPS.length - 1 ? 650 : 900;
  }

  private applyDifficultyRamp(): void {
    const elapsedMs = this.shiftDurationMs - this.remainingMs;

    if (elapsedMs >= 140_000) {
      this.spawnSystem.setSpawnInterval(1600);
      this.beltSystem.setBeltSpeed(150);
      this.spawnSystem.setPackageSpeed(150);
      return;
    }

    if (elapsedMs >= 100_000) {
      this.spawnSystem.setSpawnInterval(2100);
      this.beltSystem.setBeltSpeed(135);
      this.spawnSystem.setPackageSpeed(135);
      return;
    }

    if (elapsedMs >= 45_000) {
      this.spawnSystem.setSpawnInterval(2800);
      this.beltSystem.setBeltSpeed(115);
      this.spawnSystem.setPackageSpeed(115);
      return;
    }

    this.spawnSystem.setSpawnInterval(3800);
    this.beltSystem.setBeltSpeed(85);
    this.spawnSystem.setPackageSpeed(85);
  }

  private buildResults(scoreState: ScoreState): ShiftResultsData {
    const total = scoreState.sortedCount + scoreState.errors;
    const accuracy = total === 0 ? 100 : Math.round((scoreState.sortedCount / total) * 100);
    const grade = this.getGrade(accuracy, scoreState.errors);

    return {
      score: scoreState.score,
      accuracy,
      packagesSorted: scoreState.sortedCount,
      bulkSorted: scoreState.bulkSortedCount,
      missed: scoreState.missedCount,
      errors: scoreState.errors,
      grade,
      gradeQuote: this.getGradeQuote(grade),
    };
  }

  private getGrade(accuracy: number, errors: number): ShiftGrade {
    if (accuracy >= 95 && errors === 0) {
      return 'S';
    }

    if (accuracy >= 90) {
      return 'A';
    }

    if (accuracy >= 80) {
      return 'B';
    }

    if (accuracy >= 70 && errors < 10) {
      return 'C';
    }

    return 'F';
  }

  private getGradeQuote(grade: ShiftGrade): string {
    switch (grade) {
      case 'S':
        return 'PERFECT SHIFT';
      case 'A':
        return 'GOOD WORK';
      case 'B':
        return 'ACCEPTABLE';
      case 'C':
        return 'SHAN IS WATCHING';
      case 'F':
      default:
        return 'DO NOT COME BACK MONDAY';
    }
  }
}
