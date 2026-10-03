import Phaser from 'phaser';

import { colors } from '../config/colors';
import { GAME_WIDTH } from '../config/gameConfig';
import { Package } from '../entities/Package';
import { PileUpZone, type PilePackageRecord } from '../entities/PileUpZone';
import { audioSystem } from '../systems/AudioSystem';
import { BELT_LEFT, BELT_RIGHT } from '../systems/BeltSystem';
import type { Direction, PackageSize, PlayerId } from '../types/GameTypes';

type SideConstraint = 'left' | 'right';

export type PlayerControls = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

type PlayerConfig = {
  id: PlayerId;
  sideConstraint: SideConstraint;
  moveSpeed?: number;
};

const PLAYER_MIN_Y = 80;
const PLAYER_MAX_Y = 640;
const CALLOUT_TEXT_WIDTH = 170;
const CALLOUT_BUBBLE_WIDTH = 204;
const CALLOUT_BUBBLE_BASE_Y = -50;

const CARRY_SPEED_MULTIPLIER: Record<PackageSize, number> = {
  small_envelope: 1.0,
  small_box: 0.95,
  medium_box: 0.85,
  large_box: 0.7,
  long_box: 0.7,
  mesa_boogie: 0.4,
  quad_bike: 0.4,
  goji_berries: 0.9,
  live_lobsters: 0.55,
};

export class Player extends Phaser.GameObjects.Container {
  public readonly id: PlayerId;

  public facing: Direction = 'down';

  public isActive = false;

  public isFrozen = true;

  public moveSpeed: number;

  public heldPackage: Package | null = null;

  public grabRadius = 124;

  public readonly sideConstraint: SideConstraint;

  private readonly activeIndicator: Phaser.GameObjects.Triangle;

  private readonly inactiveIndicator: Phaser.GameObjects.Text;

  private readonly dropShadow: Phaser.GameObjects.Ellipse;

  private readonly grabRadiusIndicator: Phaser.GameObjects.Ellipse;

  private readonly calloutBubble: Phaser.GameObjects.Container;

  private readonly calloutBackground: Phaser.GameObjects.Graphics;

  private readonly calloutText: Phaser.GameObjects.Text;

  private calloutTimerMs = 0;

  private bobTime = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, config: PlayerConfig) {
    super(scene, x, y);

    this.id = config.id;
    this.sideConstraint = config.sideConstraint;
    this.moveSpeed = config.moveSpeed ?? 160;

    this.dropShadow = scene.add.ellipse(0, 18, 32, 11, colors.black, 0.18);
    const innerShadow = scene.add.ellipse(0, 18, 22, 7, colors.black, 0.32);
    const coreShadow = scene.add.ellipse(0, 18, 14, 4, colors.black, 0.45);
    this.grabRadiusIndicator = scene.add.ellipse(
      0,
      0,
      this.grabRadius * 2,
      this.grabRadius * 2,
      colors.white,
      0,
    );
    this.grabRadiusIndicator.setVisible(false);

    this.activeIndicator = scene.add.triangle(0, -32, 0, 0, 12, 0, 6, 10, colors.termiteHat, 1);
    this.activeIndicator.setStrokeStyle(1, colors.white, 0.25);

    this.inactiveIndicator = scene.add.text(0, -38, 'zZz', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '12px',
      fontStyle: 'bold',
    });
    this.inactiveIndicator.setOrigin(0.5);

    this.calloutBackground = scene.add.graphics();
    this.calloutText = scene.add.text(0, -70, '', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '10px',
      fontStyle: 'bold',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: CALLOUT_TEXT_WIDTH, useAdvancedWrap: true },
    });
    this.calloutText.setOrigin(0.5);
    this.calloutBubble = scene.add.container(0, 0, [this.calloutBackground, this.calloutText]);
    this.calloutBubble.setVisible(false);

    const bodyParts =
      this.id === 'termite'
        ? this.createTermiteVisual(scene)
        : this.createSkankyVisual(scene);

    this.add([
      this.calloutBubble,
      this.grabRadiusIndicator,
      this.dropShadow,
      innerShadow,
      coreShadow,
      ...bodyParts,
      this.activeIndicator,
      this.inactiveIndicator,
    ]);
    this.setSize(24, 40);
    this.setDepth(20);

    scene.add.existing(this);
    this.setActive(false);
  }

  public update(delta: number, controls: PlayerControls): void {
    this.bobTime += delta;

    if (this.calloutTimerMs > 0) {
      this.calloutTimerMs -= delta;

      if (this.calloutTimerMs <= 0) {
        this.calloutBubble.setVisible(false);
      }
    }

    if (this.isActive) {
      this.activeIndicator.y = -32 + Math.sin(this.bobTime / 160) * 2;
    }

    if (!this.isActive || this.isFrozen) {
      return;
    }

    const movement = new Phaser.Math.Vector2(
      Number(controls.right) - Number(controls.left),
      Number(controls.down) - Number(controls.up),
    );

    if (movement.lengthSq() > 0) {
      movement
        .normalize()
        .scale(this.moveSpeed * this.getCarrySpeedMultiplier() * (delta / 1000));
      this.x += movement.x;
      this.y += movement.y;

      if (Math.abs(movement.x) > Math.abs(movement.y)) {
        this.facing = movement.x >= 0 ? 'right' : 'left';
      } else {
        this.facing = movement.y >= 0 ? 'down' : 'up';
      }
    }

    this.applyConstraints();
  }

  public tryGrab(packages: Package[]): Package | null {
    if (this.heldPackage) {
      return null;
    }

    let nearestPackage: Package | null = null;
    let nearestDistance = this.grabRadius;

    for (const candidate of packages) {
      if (candidate.isHeld || candidate.isSorted || !candidate.playerPickable) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(this.x, this.y, candidate.x, candidate.y);

      if (distance <= nearestDistance) {
        nearestPackage = candidate;
        nearestDistance = distance;
      }
    }

    if (!nearestPackage) {
      return null;
    }

    this.heldPackage = nearestPackage;
    nearestPackage.isHeld = true;
    nearestPackage.holderId = this.id;
    nearestPackage.setHeldVisual(true, this.depth + 2);
    this.syncHeldPackagePosition();

    this.scene.tweens.add({
      targets: nearestPackage,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 50,
      yoyo: true,
      ease: 'Quad.Out',
    });

    return nearestPackage;
  }

  public drop(): Package | null {
    if (!this.heldPackage) {
      return null;
    }

    const droppedPackage = this.heldPackage;
    this.syncHeldPackagePosition();
    droppedPackage.holderId = null;
    droppedPackage.isHeld = false;
    droppedPackage.markDropped();
    droppedPackage.setHeldVisual(false, 12);
    this.heldPackage = null;

    return droppedPackage;
  }

  public releaseHeldPackageForSort(item: Package): void {
    if (this.heldPackage !== item) {
      return;
    }

    this.heldPackage = null;
  }

  public tryAutoDrop(
    handler: (item: Package, player: Player) => void,
  ): void {
    if (!this.heldPackage) {
      return;
    }

    handler(this.heldPackage, this);
  }

  public tryDigOut(
    pileUpZone: PileUpZone,
    createRecoveredPackage: (record: PilePackageRecord) => Package,
  ): Package | null {
    if (this.heldPackage || !pileUpZone.containsPoint(this.x, this.y)) {
      return null;
    }

    const pileRecord = pileUpZone.removeTopPackage();

    if (!pileRecord) {
      return null;
    }

    const recoveredPackage = createRecoveredPackage(pileRecord);
    return this.attachPackage(recoveredPackage);
  }

  public override setActive(isActive: boolean): this {
    this.isActive = isActive;
    this.isFrozen = !isActive;
    this.alpha = isActive ? 1 : 0.6;
    this.activeIndicator.setVisible(isActive);
    this.inactiveIndicator.setVisible(!isActive);

    if (isActive) {
      this.activeIndicator.y = -32;
    }

    return this;
  }

  public announce(message: string, durationMs = 2600): void {
    this.calloutText.setText(message);
    this.redrawCallout();
    this.calloutBubble.setVisible(true);
    this.calloutTimerMs = durationMs;
    audioSystem.play('npc-talk');
  }

  public syncHeldPackagePosition(): void {
    if (!this.heldPackage) {
      return;
    }

    const offset = this.getCarryOffset();
    this.heldPackage.x = this.x + offset.x;
    this.heldPackage.y = this.y + offset.y;
    this.heldPackage.setDepth(this.depth + 2);
  }

  private attachPackage(nextPackage: Package): Package {
    this.heldPackage = nextPackage;
    nextPackage.isHeld = true;
    nextPackage.holderId = this.id;
    nextPackage.setHeldVisual(true, this.depth + 2);
    this.syncHeldPackagePosition();

    this.scene.tweens.add({
      targets: nextPackage,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 50,
      yoyo: true,
      ease: 'Quad.Out',
    });

    return nextPackage;
  }

  private applyConstraints(): void {
    const minX = this.sideConstraint === 'left' ? 20 : BELT_RIGHT;
    const maxX = this.sideConstraint === 'left' ? BELT_LEFT : 940;

    this.x = Phaser.Math.Clamp(this.x, minX, maxX);
    this.y = Phaser.Math.Clamp(this.y, PLAYER_MIN_Y, PLAYER_MAX_Y);
  }

  private getCarryOffset(): Phaser.Math.Vector2 {
    switch (this.facing) {
      case 'up':
        return new Phaser.Math.Vector2(0, -24);
      case 'left':
        return new Phaser.Math.Vector2(-18, -8);
      case 'right':
        return new Phaser.Math.Vector2(18, -8);
      case 'down':
      default:
        return new Phaser.Math.Vector2(0, -4);
    }
  }

  private getCarrySpeedMultiplier(): number {
    if (!this.heldPackage) {
      return 1;
    }

    return CARRY_SPEED_MULTIPLIER[this.heldPackage.size];
  }

  private createTermiteVisual(scene: Phaser.Scene): Phaser.GameObjects.Shape[] {
    const hatBrim = scene.add.rectangle(0, -18, 18, 4, colors.termiteHat, 1);
    const hatTop = scene.add.rectangle(0, -22, 12, 6, colors.termiteHat, 1);
    const head = scene.add.rectangle(0, -12, 14, 12, colors.skinTone, 1);
    const body = scene.add.rectangle(0, 1, 16, 22, colors.termiteShirt, 1);
    const shirtHighlight = scene.add.rectangle(-4, -2, 3, 16, colors.white, 0.16);
    const leftEye = scene.add.rectangle(-3, -13, 2, 2, colors.black, 1);
    const rightEye = scene.add.rectangle(3, -13, 2, 2, colors.black, 1);
    const leftArm = scene.add.rectangle(-10, 1, 4, 16, colors.skinTone, 1);
    const rightArm = scene.add.rectangle(10, 1, 4, 16, colors.skinTone, 1);
    const leftLeg = scene.add.rectangle(-4, 16, 5, 14, colors.skankyHair, 1);
    const rightLeg = scene.add.rectangle(4, 16, 5, 14, colors.skankyHair, 1);

    for (const part of [hatBrim, hatTop, head, body, leftArm, rightArm, leftLeg, rightLeg]) {
      part.setStrokeStyle(1, colors.black, 0.28);
    }

    return [
      hatBrim,
      hatTop,
      head,
      body,
      shirtHighlight,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      leftEye,
      rightEye,
    ];
  }

  private createSkankyVisual(scene: Phaser.Scene): Phaser.GameObjects.Shape[] {
    const hairBack = scene.add.rectangle(0, -6, 20, 28, colors.skankyHair, 1);
    const head = scene.add.rectangle(0, -12, 14, 12, colors.skinTone, 1);
    const hairTop = scene.add.rectangle(0, -18, 16, 6, colors.skankyHair, 1);
    const leftHair = scene.add.rectangle(-9, -1, 5, 22, colors.skankyHair, 1);
    const rightHair = scene.add.rectangle(9, -1, 5, 22, colors.skankyHair, 1);
    const body = scene.add.rectangle(0, 2, 20, 20, colors.skankyShirt, 1);
    const shirtHighlight = scene.add.rectangle(-6, 0, 4, 14, colors.white, 0.14);
    const leftEye = scene.add.rectangle(-3, -13, 2, 2, colors.black, 1);
    const rightEye = scene.add.rectangle(3, -13, 2, 2, colors.black, 1);
    const leftArm = scene.add.rectangle(-12, 2, 4, 14, colors.skinTone, 1);
    const rightArm = scene.add.rectangle(12, 2, 4, 14, colors.skinTone, 1);
    const leftLeg = scene.add.rectangle(-5, 16, 6, 14, colors.beltRail, 1);
    const rightLeg = scene.add.rectangle(5, 16, 6, 14, colors.beltRail, 1);

    for (const part of [
      hairBack,
      head,
      hairTop,
      leftHair,
      rightHair,
      body,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
    ]) {
      part.setStrokeStyle(1, colors.black, 0.28);
    }

    return [
      hairBack,
      head,
      hairTop,
      leftHair,
      rightHair,
      body,
      shirtHighlight,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      leftEye,
      rightEye,
    ];
  }

  private redrawCallout(): void {
    this.calloutText.setWordWrapWidth(CALLOUT_TEXT_WIDTH, true);
    const padY = 10;
    const width = CALLOUT_BUBBLE_WIDTH;
    const height = Math.max(34, this.calloutText.height + padY * 2);
    const top = CALLOUT_BUBBLE_BASE_Y - height;
    const bubbleX = Phaser.Math.Clamp(this.x, width / 2 + 8, GAME_WIDTH - width / 2 - 8) - this.x;
    const pointerX = Phaser.Math.Clamp(-bubbleX, -width / 2 + 12, width / 2 - 12);

    this.calloutBubble.setX(bubbleX);
    this.calloutBackground.clear();
    this.calloutBackground.fillStyle(colors.black, 0.82);
    this.calloutBackground.fillRoundedRect(-width / 2, top, width, height, 8);
    this.calloutBackground.lineStyle(2, colors.white, 0.2);
    this.calloutBackground.strokeRoundedRect(-width / 2, top, width, height, 8);
    this.calloutBackground.fillTriangle(
      pointerX - 6,
      CALLOUT_BUBBLE_BASE_Y - 1,
      pointerX + 6,
      CALLOUT_BUBBLE_BASE_Y - 1,
      pointerX,
      CALLOUT_BUBBLE_BASE_Y + 10,
    );
    this.calloutText.setPosition(0, top + height / 2);
  }
}
