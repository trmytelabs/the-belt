import Phaser from 'phaser';

import { GAME_WIDTH } from '../config/gameConfig';
import { colors } from '../config/colors';
import { audioSystem } from '../systems/AudioSystem';
import { BELT_LEFT } from '../systems/BeltSystem';
import { FlavorNpc } from './FlavorNpc';

type BenGunmanState =
  | 'hidden'
  | 'entering'
  | 'threatening'
  | 'bragging'
  | 'dodging'
  | 'shooting'
  | 'hellOpening'
  | 'demonRising'
  | 'bodyDragging'
  | 'paulaEntering'
  | 'paulaRant'
  | 'leaving';

const BEN_LINE = "DON'T WORRY GUYS\nI GOT THIS\nI TOOK TRAINING ON\nHOW TO DODGE GUNS";

const GUNMAN_LINE = "I'M GOING TO\nROB THIS PLACE!";

const PAULA_LINE = "GREAT\nNOW WHICH BITCH\nIS GOING TO LOAD\nMY FUCKING TRUCK";

const GUNMAN_SCALE = 0.82;
const DEMON_MAX_SCALE = 1.24;
const SHOT_WORDS = ['BANG!', 'BANG!', 'POW!', 'BANG BANG!', 'BANG!'] as const;
const SHOT_INTERVALS_MS = [260, 420, 320, 520, 420] as const;
const DIALOG_TEXT_WIDTH = 174;
const DIALOG_BUBBLE_WIDTH = 214;
const GUNMAN_BUBBLE_BASE_Y = -58;
const PAULA_BUBBLE_BASE_Y = -60;

export class BenGunmanEvent {
  private readonly scene: Phaser.Scene;

  private readonly ben: FlavorNpc;

  private readonly gunman: Phaser.GameObjects.Container;

  private readonly gun: Phaser.GameObjects.Container;

  private readonly muzzleFlash: Phaser.GameObjects.Triangle;

  private readonly bangBubble: Phaser.GameObjects.Container;

  private readonly bangBubbleBackground: Phaser.GameObjects.Graphics;

  private readonly bangText: Phaser.GameObjects.Text;

  private readonly gunmanBubble: Phaser.GameObjects.Container;

  private readonly gunmanBubbleBackground: Phaser.GameObjects.Graphics;

  private readonly gunmanBubbleText: Phaser.GameObjects.Text;

  private readonly portal: Phaser.GameObjects.Container;

  private readonly portalGraphics: Phaser.GameObjects.Graphics;

  private readonly demon: Phaser.GameObjects.Container;

  private readonly paula: Phaser.GameObjects.Container;

  private readonly paulaBubble: Phaser.GameObjects.Container;

  private readonly paulaBubbleBackground: Phaser.GameObjects.Graphics;

  private readonly paulaBubbleText: Phaser.GameObjects.Text;

  private state: BenGunmanState = 'hidden';

  private stateTimerMs = 0;

  private dodgeIndex = 0;

  private shotTimerMs = 0;

  private shotsFired = 0;

  private hasTriggered = false;

  private readonly gunmanStart = new Phaser.Math.Vector2(GAME_WIDTH + 70, 326);

  private readonly gunmanStop = new Phaser.Math.Vector2(650, 326);

  private readonly gunmanExit = new Phaser.Math.Vector2(GAME_WIDTH + 90, 326);

  private readonly benStart = new Phaser.Math.Vector2(BELT_LEFT - 36, 326);

  private readonly portalPoint = new Phaser.Math.Vector2(330, 334);

  private readonly paulaStart = new Phaser.Math.Vector2(-70, 356);

  private readonly paulaStop = new Phaser.Math.Vector2(292, 356);

  private readonly dodgePoints = [
    new Phaser.Math.Vector2(BELT_LEFT - 28, 292),
    new Phaser.Math.Vector2(BELT_LEFT - 72, 340),
    new Phaser.Math.Vector2(BELT_LEFT - 38, 368),
    new Phaser.Math.Vector2(BELT_LEFT - 88, 310),
    new Phaser.Math.Vector2(BELT_LEFT - 34, 282),
    new Phaser.Math.Vector2(BELT_LEFT - 66, 356),
    new Phaser.Math.Vector2(BELT_LEFT - 24, 392),
    new Phaser.Math.Vector2(BELT_LEFT - 82, 326),
    new Phaser.Math.Vector2(BELT_LEFT - 48, 294),
    new Phaser.Math.Vector2(BELT_LEFT - 96, 372),
    new Phaser.Math.Vector2(BELT_LEFT - 36, 344),
    new Phaser.Math.Vector2(BELT_LEFT - 42, 326),
  ];

  constructor(scene: Phaser.Scene, ben: FlavorNpc) {
    this.scene = scene;
    this.ben = ben;

    const shadow = scene.add.ellipse(0, 24, 42, 11, colors.black, 0.38);
    const head = scene.add.rectangle(0, -22, 18, 17, 0xb88462, 1);
    const body = scene.add.rectangle(0, 1, 28, 36, 0x22252a, 1);
    const jacket = scene.add.rectangle(0, 1, 14, 36, 0x111111, 1);
    const leftArm = scene.add.rectangle(-18, 0, 6, 25, 0x22252a, 1);
    const rightArm = scene.add.rectangle(17, -4, 6, 24, 0x22252a, 1);
    const leftLeg = scene.add.rectangle(-8, 26, 8, 21, 0x15171b, 1);
    const rightLeg = scene.add.rectangle(8, 26, 8, 21, 0x15171b, 1);
    const gunStock = scene.add.rectangle(-4, 2, 13, 11, 0x070707, 1);
    gunStock.setRotation(Phaser.Math.DegToRad(-12));
    const gunHandle = scene.add.rectangle(2, 15, 9, 21, 0x09090a, 1);
    gunHandle.setRotation(Phaser.Math.DegToRad(-16));
    gunHandle.setStrokeStyle(1, 0x666666, 0.45);
    const trigger = scene.add.graphics();
    trigger.lineStyle(2, 0x080808, 1);
    trigger.strokeEllipse(8, 8, 10, 12);
    trigger.fillStyle(0x080808, 1);
    trigger.fillRect(7, 3, 3, 9);
    const gunReceiver = scene.add.rectangle(12, 0, 24, 13, 0x101216, 1);
    gunReceiver.setStrokeStyle(2, 0x5f6570, 0.55);
    const gunBarrel = scene.add.rectangle(38, -2, 42, 6, 0x171b20, 1);
    gunBarrel.setStrokeStyle(1, 0x8d929a, 0.45);
    const gunMuzzle = scene.add.rectangle(62, -2, 9, 8, 0x050607, 1);
    gunMuzzle.setStrokeStyle(1, 0xb0b0b0, 0.5);
    const topSight = scene.add.rectangle(30, -10, 18, 4, 0x08090b, 1);
    const name = scene.add.text(0, -41, 'GUNMAN', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '10px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    name.setOrigin(0.5);

    this.muzzleFlash = scene.add.triangle(72, -2, 0, -10, 25, 0, 0, 10, colors.destYellow, 1);
    this.muzzleFlash.setVisible(false);
    this.gun = scene.add.container(17, -8, [
      gunStock,
      gunHandle,
      trigger,
      gunReceiver,
      gunBarrel,
      gunMuzzle,
      topSight,
      this.muzzleFlash,
    ]);
    this.gun.setScale(-1, 1);

    this.gunmanBubbleBackground = scene.add.graphics();
    this.gunmanBubbleText = scene.add.text(0, -82, '', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '11px',
      fontStyle: 'bold',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: DIALOG_TEXT_WIDTH, useAdvancedWrap: true },
    });
    this.gunmanBubbleText.setOrigin(0.5);
    this.gunmanBubble = scene.add.container(0, 0, [
      this.gunmanBubbleBackground,
      this.gunmanBubbleText,
    ]);
    this.gunmanBubble.setVisible(false);

    this.gunman = scene.add.container(this.gunmanStart.x, this.gunmanStart.y, [
      this.gunmanBubble,
      shadow,
      head,
      body,
      jacket,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      this.gun,
      name,
    ]);
    this.gunman.setDepth(43);
    this.gunman.setVisible(false);

    this.bangBubbleBackground = scene.add.graphics();
    this.bangText = scene.add.text(0, 0, 'BANG!', {
      color: '#fff8c4',
      fontFamily: 'Arial',
      fontSize: '23px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    });
    this.bangText.setOrigin(0.5);
    this.bangBubble = scene.add.container(592, 278, [
      this.bangBubbleBackground,
      this.bangText,
    ]);
    this.bangBubble.setDepth(48);
    this.bangBubble.setVisible(false);

    this.portalGraphics = scene.add.graphics();
    this.portal = scene.add.container(this.portalPoint.x, this.portalPoint.y, [this.portalGraphics]);
    this.portal.setDepth(39);
    this.portal.setVisible(false);

    this.demon = this.createAdultDemon();
    this.demon.setDepth(46);
    this.demon.setVisible(false);

    this.paulaBubbleBackground = scene.add.graphics();
    this.paulaBubbleText = scene.add.text(0, -76, '', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '10px',
      fontStyle: 'bold',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: DIALOG_TEXT_WIDTH, useAdvancedWrap: true },
    });
    this.paulaBubbleText.setOrigin(0.5);
    this.paulaBubble = scene.add.container(0, 0, [
      this.paulaBubbleBackground,
      this.paulaBubbleText,
    ]);
    this.paulaBubble.setVisible(false);
    this.paula = this.createPaulaAbdul();
    this.paula.setDepth(47);
    this.paula.setVisible(false);
  }

  public isActive(): boolean {
    return this.state !== 'hidden';
  }

  public hasPlayed(): boolean {
    return this.hasTriggered;
  }

  public start(): boolean {
    if (this.isActive() || this.hasTriggered || !this.ben.beginGunmanDodge(this.benStart)) {
      return false;
    }

    this.hasTriggered = true;
    this.state = 'entering';
    this.stateTimerMs = 0;
    this.dodgeIndex = 0;
    this.shotTimerMs = 0;
    this.shotsFired = 0;
    this.gunman.setPosition(this.gunmanStart.x, this.gunmanStart.y);
    this.gunman.setVisible(true);
    this.gunman.setAlpha(1);
    this.gunman.setScale(GUNMAN_SCALE);
    this.gun.setRotation(0);
    this.gunmanBubble.setVisible(false);
    this.muzzleFlash.setVisible(false);
    this.bangBubble.setVisible(false);
    this.portal.setVisible(false);
    this.demon.setVisible(false);
    this.paula.setVisible(false);
    this.paulaBubble.setVisible(false);

    return true;
  }

  public update(delta: number): void {
    if (this.state === 'hidden') {
      return;
    }

    if (this.state === 'entering') {
      this.moveContainerToward(this.gunman, this.gunmanStop, delta, 210);

      if (this.hasReached(this.gunman, this.gunmanStop)) {
        this.gunman.setPosition(this.gunmanStop.x, this.gunmanStop.y);
        this.showGunmanBubble(GUNMAN_LINE);
        this.state = 'threatening';
        this.stateTimerMs = 4200;
      }

      return;
    }

    if (this.state === 'threatening') {
      this.stateTimerMs -= delta;
      this.gun.setRotation(Math.sin(this.scene.time.now / 75) * 0.06);
      this.gunman.rotation = Math.sin(this.scene.time.now / 85) * 0.035;

      if (this.stateTimerMs <= 0) {
        this.gunmanBubble.setVisible(false);
        this.gun.setRotation(0);
        this.gunman.setRotation(0);
        this.ben.announce(BEN_LINE, 5200);
        this.state = 'bragging';
        this.stateTimerMs = 5200;
      }

      return;
    }

    if (this.state === 'bragging') {
      this.stateTimerMs -= delta;
      this.ben.rotation = Math.sin(this.scene.time.now / 95) * 0.11;
      this.ben.setScale(1 + Math.sin(this.scene.time.now / 110) * 0.04);

      if (this.stateTimerMs <= 0) {
        this.state = 'dodging';
      }

      return;
    }

    if (this.state === 'dodging') {
      const target = this.dodgePoints[this.dodgeIndex];
      this.moveBenToward(target, delta, 172);
      this.ben.rotation = Math.sin(this.scene.time.now / 42) * 0.22;
      this.ben.setScale(1.06, 0.94 + Math.sin(this.scene.time.now / 62) * 0.08);

      if (this.hasBenReached(target)) {
        this.dodgeIndex += 1;

        if (this.dodgeIndex >= this.dodgePoints.length) {
          this.state = 'shooting';
          this.stateTimerMs = 3200;
          this.shotTimerMs = 0;
          this.shotsFired = 0;
          this.gun.setRotation(Phaser.Math.DegToRad(-4));
        }
      }

      return;
    }

    if (this.state === 'shooting') {
      this.stateTimerMs -= delta;
      this.shotTimerMs -= delta;
      this.ben.rotation = Math.sin(this.scene.time.now / 38) * 0.16;

      if (this.shotsFired < SHOT_WORDS.length && this.shotTimerMs <= 0) {
        const isFinalShot = this.shotsFired === SHOT_WORDS.length - 1;
        this.fireGunShot(SHOT_WORDS[this.shotsFired], isFinalShot);
        this.shotTimerMs = SHOT_INTERVALS_MS[this.shotsFired];
        this.shotsFired += 1;
      }

      if (this.stateTimerMs <= 0) {
        this.state = 'hellOpening';
        this.stateTimerMs = 1400;
        this.muzzleFlash.setVisible(false);
        this.bangBubble.setVisible(false);
        this.portal.setVisible(true);
        this.drawPortal(0.1);
      }

      return;
    }

    if (this.state === 'hellOpening') {
      this.stateTimerMs -= delta;
      this.moveContainerToward(this.gunman, this.gunmanExit, delta, 260);
      this.drawPortal(1 - Math.max(0, this.stateTimerMs / 1400));

      if (this.stateTimerMs <= 0) {
        this.gunman.setVisible(false);
        this.demon.setPosition(this.ben.x - 2, this.ben.y - 20);
        this.demon.setScale(0.25);
        this.demon.setAlpha(0.9);
        this.demon.setVisible(true);
        this.state = 'demonRising';
        this.stateTimerMs = 1800;
      }

      return;
    }

    if (this.state === 'demonRising') {
      this.stateTimerMs -= delta;
      const progress = 1 - Math.max(0, this.stateTimerMs / 1800);
      const scale = Phaser.Math.Linear(0.25, DEMON_MAX_SCALE, progress);
      this.demon.setScale(scale);
      this.demon.setPosition(
        this.ben.x - 2 + Math.sin(this.scene.time.now / 70) * 2,
        this.ben.y - 14 - progress * 32,
      );
      this.demon.rotation = Math.sin(this.scene.time.now / 95) * 0.05;
      this.drawPortal(1);

      if (this.stateTimerMs <= 0) {
        this.state = 'bodyDragging';
      }

      return;
    }

    if (this.state === 'bodyDragging') {
      this.moveBenToward(this.portalPoint, delta, 72);
      this.moveContainerToward(
        this.demon,
        new Phaser.Math.Vector2(this.portalPoint.x - 4, this.portalPoint.y - 34),
        delta,
        58,
      );
      this.ben.rotation += 0.025;
      this.demon.rotation = Math.sin(this.scene.time.now / 90) * 0.08;
      this.drawPortal(1);

      if (this.hasBenReached(this.portalPoint)) {
        this.ben.sendDeadBodyToHell();
        this.scene.tweens.add({
          targets: [this.demon, this.portal],
          alpha: 0,
          scaleX: 0.18,
          scaleY: 0.18,
          duration: 520,
          ease: 'Quad.In',
        });
        this.paula.setPosition(this.paulaStart.x, this.paulaStart.y);
        this.paula.setVisible(true);
        this.paulaBubble.setVisible(false);
        this.state = 'paulaEntering';
      }

      return;
    }

    if (this.state === 'paulaEntering') {
      this.moveContainerToward(this.paula, this.paulaStop, delta, 190);

      if (this.hasReached(this.paula, this.paulaStop)) {
        this.paula.setPosition(this.paulaStop.x, this.paulaStop.y);
        this.showPaulaBubble();
        this.state = 'paulaRant';
        this.stateTimerMs = 5200;
      }

      return;
    }

    if (this.state === 'paulaRant') {
      this.stateTimerMs -= delta;
      this.paula.rotation = Math.sin(this.scene.time.now / 80) * 0.04;

      if (this.stateTimerMs <= 0) {
        this.paula.rotation = 0;
        this.paulaBubble.setVisible(false);
        this.state = 'leaving';
      }

      return;
    }

    if (this.state === 'leaving') {
      this.moveContainerToward(this.paula, this.paulaStart, delta, 190);

      if (this.hasReached(this.paula, this.paulaStart)) {
        this.forceHide();
      }
    }
  }

  public forceHide(): void {
    this.state = 'hidden';
    this.stateTimerMs = 0;
    this.shotTimerMs = 0;
    this.shotsFired = 0;
    this.gunman.setVisible(false);
    this.gunman.setPosition(this.gunmanStart.x, this.gunmanStart.y);
    this.gunman.setScale(GUNMAN_SCALE);
    this.gunman.setRotation(0);
    this.gunmanBubble.setVisible(false);
    this.muzzleFlash.setVisible(false);
    this.bangBubble.setVisible(false);
    this.bangBubbleBackground.clear();
    this.portal.setVisible(false);
    this.portal.setAlpha(1);
    this.portal.setScale(1);
    this.portalGraphics.clear();
    this.demon.setVisible(false);
    this.demon.setAlpha(1);
    this.demon.setScale(1);
    this.demon.setRotation(0);
    this.paula.setVisible(false);
    this.paula.setPosition(this.paulaStart.x, this.paulaStart.y);
    this.paula.setRotation(0);
    this.paulaBubble.setVisible(false);
  }

  private moveBenToward(target: Phaser.Math.Vector2, delta: number, speed = 260): void {
    const current = new Phaser.Math.Vector2(this.ben.x, this.ben.y);
    const distance = current.distance(target);

    if (distance <= 0) {
      return;
    }

    const step = speed * (delta / 1000);
    const direction = target.clone().subtract(current).normalize();
    this.ben.x += direction.x * Math.min(step, distance);
    this.ben.y += direction.y * Math.min(step, distance);
  }

  private moveContainerToward(
    object: Phaser.GameObjects.Container,
    target: Phaser.Math.Vector2,
    delta: number,
    speed: number,
  ): void {
    const current = new Phaser.Math.Vector2(object.x, object.y);
    const distance = current.distance(target);

    if (distance <= 0) {
      return;
    }

    const step = speed * (delta / 1000);
    const direction = target.clone().subtract(current).normalize();
    object.x += direction.x * Math.min(step, distance);
    object.y += direction.y * Math.min(step, distance);
  }

  private hasBenReached(target: Phaser.Math.Vector2): boolean {
    return Phaser.Math.Distance.Between(this.ben.x, this.ben.y, target.x, target.y) < 5;
  }

  private hasReached(
    object: Phaser.GameObjects.Container,
    target: Phaser.Math.Vector2,
  ): boolean {
    return Phaser.Math.Distance.Between(object.x, object.y, target.x, target.y) < 5;
  }

  private fireGunShot(word: string, isFinalShot: boolean): void {
    const jitterX = Phaser.Math.Between(-8, 10);
    const jitterY = Phaser.Math.Between(-6, 8);
    const wordX = this.gunman.x - 54 + jitterX;
    const wordY = this.gunman.y - 46 + jitterY;

    this.gun.setRotation(Phaser.Math.DegToRad(Phaser.Math.Between(-8, 5)));
    this.muzzleFlash.setVisible(true);
    this.scene.time.delayedCall(90, () => {
      if (this.state !== 'hidden') {
        this.muzzleFlash.setVisible(false);
      }
    });

    this.redrawBangBubble(word);
    this.bangBubble.setPosition(wordX, wordY);
    this.bangBubble.setAlpha(1);
    this.bangBubble.setScale(0.7);
    this.bangBubble.setVisible(true);
    this.scene.tweens.killTweensOf(this.bangBubble);
    this.scene.tweens.add({
      targets: this.bangBubble,
      scaleX: 1.08,
      scaleY: 1.08,
      alpha: 0,
      x: wordX - 18,
      y: wordY - 14,
      duration: 520,
      ease: 'Quad.Out',
      onComplete: () => {
        this.bangBubble.setVisible(false);
      },
    });

    audioSystem.play('gunshot');

    if (isFinalShot) {
      this.ben.markDead(this.dodgePoints[this.dodgePoints.length - 1]);
    }
  }

  private redrawBangBubble(word: string): void {
    this.bangText.setText(word);
    const bounds = this.bangText.getBounds();
    const width = bounds.width + 22;
    const height = bounds.height + 14;

    this.bangBubbleBackground.clear();
    this.bangBubbleBackground.fillStyle(0xfff0a0, 0.96);
    this.bangBubbleBackground.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    this.bangBubbleBackground.lineStyle(3, colors.warningRed, 0.9);
    this.bangBubbleBackground.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    this.bangBubbleBackground.fillTriangle(width / 2 - 4, -4, width / 2 + 20, -10, width / 2 - 2, 9);
  }

  private createAdultDemon(): Phaser.GameObjects.Container {
    const shadow = this.scene.add.ellipse(0, 30, 42, 12, colors.black, 0.35);
    const torso = this.scene.add.rectangle(0, 2, 30, 42, colors.destPurple, 1);
    const head = this.scene.add.rectangle(0, -28, 24, 22, 0x6f2290, 1);
    const leftHorn = this.scene.add.triangle(-9, -44, 0, 18, 8, 0, 16, 18, colors.destYellow, 1);
    const rightHorn = this.scene.add.triangle(9, -44, 0, 18, 8, 0, 16, 18, colors.destYellow, 1);
    const leftWing = this.scene.add.triangle(-18, -4, 0, 22, 0, -28, -48, 0, 0x3a1048, 1);
    const rightWing = this.scene.add.triangle(18, -4, 0, -28, 0, 22, 48, 0, 0x3a1048, 1);
    const leftArm = this.scene.add.rectangle(-24, 0, 8, 34, 0x6f2290, 1);
    const rightArm = this.scene.add.rectangle(24, 0, 8, 34, 0x6f2290, 1);
    const leftLeg = this.scene.add.rectangle(-8, 30, 9, 28, 0x2a1233, 1);
    const rightLeg = this.scene.add.rectangle(8, 30, 9, 28, 0x2a1233, 1);
    const leftEye = this.scene.add.circle(-5, -30, 3, colors.warningRed, 1);
    const rightEye = this.scene.add.circle(5, -30, 3, colors.warningRed, 1);

    return this.scene.add.container(this.portalPoint.x, this.portalPoint.y, [
      shadow,
      leftWing,
      rightWing,
      torso,
      head,
      leftHorn,
      rightHorn,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      leftEye,
      rightEye,
    ]);
  }

  private createPaulaAbdul(): Phaser.GameObjects.Container {
    const shadow = this.scene.add.ellipse(0, 20, 28, 8, colors.black, 0.3);
    const hairBack = this.scene.add.rectangle(0, -9, 24, 30, 0x1a1210, 1);
    const head = this.scene.add.rectangle(0, -16, 15, 14, colors.skinTone, 1);
    const hairTop = this.scene.add.rectangle(0, -25, 22, 8, 0x1a1210, 1);
    const body = this.scene.add.rectangle(0, 2, 22, 28, 0xb02070, 1);
    const leftArm = this.scene.add.rectangle(-14, 0, 5, 22, colors.skinTone, 1);
    const rightArm = this.scene.add.rectangle(14, 0, 5, 22, colors.skinTone, 1);
    const leftLeg = this.scene.add.rectangle(-6, 23, 7, 18, colors.warehouseFloorDark, 1);
    const rightLeg = this.scene.add.rectangle(6, 23, 7, 18, colors.warehouseFloorDark, 1);
    const name = this.scene.add.text(0, -46, 'PAULA ABDUL', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '10px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    name.setOrigin(0.5);

    return this.scene.add.container(this.paulaStart.x, this.paulaStart.y, [
      this.paulaBubble,
      name,
      shadow,
      hairBack,
      head,
      hairTop,
      body,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
    ]);
  }

  private drawPortal(progress: number): void {
    const pulse = Math.sin(this.scene.time.now / 90) * 0.08;
    const width = 16 + progress * 48;
    const height = 22 + progress * 82;
    const pillarHeight = height + 16;
    const pillarWidth = 8 + progress * 6;

    this.portalGraphics.clear();
    this.portalGraphics.fillStyle(0x140000, 0.9);
    this.portalGraphics.fillEllipse(0, 0, width, height);
    this.portalGraphics.fillStyle(0x5c0707, 0.95);
    this.portalGraphics.fillRoundedRect(-width / 2 - pillarWidth, -pillarHeight / 2, pillarWidth, pillarHeight, 5);
    this.portalGraphics.fillRoundedRect(width / 2, -pillarHeight / 2, pillarWidth, pillarHeight, 5);
    this.portalGraphics.fillStyle(0x240000, 1);
    this.portalGraphics.fillTriangle(-width / 2 - pillarWidth, -pillarHeight / 2, -width / 2, -pillarHeight / 2 - 24, -width / 2 + pillarWidth, -pillarHeight / 2);
    this.portalGraphics.fillTriangle(width / 2 - pillarWidth, -pillarHeight / 2, width / 2, -pillarHeight / 2 - 24, width / 2 + pillarWidth, -pillarHeight / 2);
    this.portalGraphics.lineStyle(4, 0xff2b1c, 0.8);
    this.portalGraphics.strokeEllipse(0, 0, width * (1 + pulse), height * (1 - pulse * 0.4));
    this.portalGraphics.lineStyle(2, 0xff8a25, 0.72);
    this.portalGraphics.strokeEllipse(0, 0, width * 0.66, height * 0.82);
    this.portalGraphics.lineStyle(2, 0xffd36b, 0.38);
    this.portalGraphics.beginPath();
    this.portalGraphics.moveTo(-width * 0.22, -height * 0.36);
    this.portalGraphics.lineTo(width * 0.16, -height * 0.08);
    this.portalGraphics.lineTo(-width * 0.1, height * 0.3);
    this.portalGraphics.lineTo(width * 0.24, height * 0.46);
    this.portalGraphics.strokePath();
    this.portalGraphics.fillStyle(0xff2b1c, 0.28);
    this.portalGraphics.fillEllipse(0, 0, width * 0.48, height * 0.72);
  }

  private showGunmanBubble(text: string): void {
    this.gunmanBubbleText.setText(text);
    audioSystem.play('warning');
    this.gunmanBubbleText.setWordWrapWidth(DIALOG_TEXT_WIDTH, true);
    const width = DIALOG_BUBBLE_WIDTH;
    const height = Math.max(42, this.gunmanBubbleText.height + 22);
    const top = GUNMAN_BUBBLE_BASE_Y - height;
    const bubbleX =
      Phaser.Math.Clamp(this.gunman.x, width / 2 + 8, GAME_WIDTH - width / 2 - 8) -
      this.gunman.x;
    const pointerX = Phaser.Math.Clamp(-bubbleX, -width / 2 + 14, width / 2 - 14);

    this.gunmanBubble.setX(bubbleX);
    this.gunmanBubbleBackground.clear();
    this.gunmanBubbleBackground.fillStyle(colors.black, 0.88);
    this.gunmanBubbleBackground.fillRoundedRect(-width / 2, top, width, height, 8);
    this.gunmanBubbleBackground.lineStyle(3, colors.warningRed, 0.72);
    this.gunmanBubbleBackground.strokeRoundedRect(-width / 2, top, width, height, 8);
    this.gunmanBubbleBackground.fillTriangle(
      pointerX - 7,
      GUNMAN_BUBBLE_BASE_Y - 1,
      pointerX + 7,
      GUNMAN_BUBBLE_BASE_Y - 1,
      pointerX,
      GUNMAN_BUBBLE_BASE_Y + 12,
    );
    this.gunmanBubbleText.setPosition(0, top + height / 2);
    this.gunmanBubble.setVisible(true);
  }

  private showPaulaBubble(): void {
    this.paulaBubbleText.setText(PAULA_LINE);
    audioSystem.play('npc-talk');
    this.paulaBubbleText.setWordWrapWidth(DIALOG_TEXT_WIDTH, true);
    const width = DIALOG_BUBBLE_WIDTH;
    const height = Math.max(42, this.paulaBubbleText.height + 22);
    const top = PAULA_BUBBLE_BASE_Y - height;
    const bubbleX =
      Phaser.Math.Clamp(this.paula.x, width / 2 + 8, GAME_WIDTH - width / 2 - 8) -
      this.paula.x;
    const pointerX = Phaser.Math.Clamp(-bubbleX, -width / 2 + 14, width / 2 - 14);

    this.paulaBubble.setX(bubbleX);
    this.paulaBubbleBackground.clear();
    this.paulaBubbleBackground.fillStyle(colors.black, 0.84);
    this.paulaBubbleBackground.fillRoundedRect(-width / 2, top, width, height, 8);
    this.paulaBubbleBackground.lineStyle(2, colors.white, 0.22);
    this.paulaBubbleBackground.strokeRoundedRect(-width / 2, top, width, height, 8);
    this.paulaBubbleBackground.fillTriangle(
      pointerX - 7,
      PAULA_BUBBLE_BASE_Y - 1,
      pointerX + 7,
      PAULA_BUBBLE_BASE_Y - 1,
      pointerX,
      PAULA_BUBBLE_BASE_Y + 12,
    );
    this.paulaBubbleText.setPosition(0, top + height / 2);
    this.paulaBubble.setVisible(true);
  }
}
