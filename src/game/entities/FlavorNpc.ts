import Phaser from 'phaser';

import { colors } from '../config/colors';
import { GAME_WIDTH } from '../config/gameConfig';
import { audioSystem } from '../systems/AudioSystem';
import { isMobileBrowser } from '../utils/device';

export type FlavorNpcState =
  | 'idle'
  | 'walkingToPile'
  | 'pickingUp'
  | 'walkingToTruck'
  | 'depositing'
  | 'returning'
  | 'specialApproaching'
  | 'specialDancing'
  | 'specialReset'
  | 'gunDodging'
  | 'massaging'
  | 'dead';

type FlavorNpcId =
  | 'hussan'
  | 'aj'
  | 'ben'
  | 'froodoo'
  | 'dorothy'
  | 'brian'
  | 'bannerman'
  | 'donna';

type FlavorNpcConfig = {
  id: FlavorNpcId;
  name: string;
  homePos: Phaser.Math.Vector2;
  truckPos: Phaser.Math.Vector2;
  sidePilePos: Phaser.Math.Vector2;
};

const CALLOUT_TEXT_WIDTH = 160;
const CALLOUT_BUBBLE_WIDTH = 194;
const CALLOUT_BUBBLE_BASE_Y = -48;

export class FlavorNpc extends Phaser.GameObjects.Container {
  public readonly id: string;

  public readonly name: string;

  public readonly homePos: Phaser.Math.Vector2;

  public readonly truckPos: Phaser.Math.Vector2;

  public readonly sidePilePos: Phaser.Math.Vector2;

  public state: FlavorNpcState = 'idle';

  public carrying = false;

  private readonly carryPackage: Phaser.GameObjects.Rectangle;

  private readonly snakeCellPackage: Phaser.GameObjects.Container;

  private readonly nameText: Phaser.GameObjects.Text;

  private readonly calloutBubble: Phaser.GameObjects.Container;

  private readonly calloutBackground: Phaser.GameObjects.Graphics;

  private readonly calloutText: Phaser.GameObjects.Text;

  private readonly deadMarker: Phaser.GameObjects.Text;

  private stateTimerMs = Phaser.Math.Between(400, 2600);

  private moveSpeed = Phaser.Math.Between(60, 100);

  private rushSpeed = Phaser.Math.Between(130, 170);

  private readonly smokePuffs: Phaser.GameObjects.Ellipse[] = [];

  private readonly stinkLines: Phaser.GameObjects.Rectangle[] = [];

  private smokeTimerMs = 0;

  private animTime = 0;

  private specialPickupPos: Phaser.Math.Vector2 | null = null;

  private specialDanceTimerMs = 0;

  private specialDanceBaseY = 0;

  private calloutTimerMs = 0;

  constructor(scene: Phaser.Scene, config: FlavorNpcConfig) {
    super(scene, config.homePos.x, config.homePos.y);

    this.id = config.id;
    this.name = config.name;
    this.homePos = config.homePos.clone();
    this.truckPos = config.truckPos.clone();
    this.sidePilePos = config.sidePilePos.clone();
    const isMobile = isMobileBrowser();

    const shadow = scene.add.ellipse(0, 18, 22, 7, colors.black, 0.28);
    const head = scene.add.rectangle(0, -12, 14, 12, colors.skinTone, 1);
    const body = scene.add.rectangle(0, 1, 18, 22, this.getBodyColor(), 1);
    const leftArm = scene.add.rectangle(-11, 1, 4, 16, colors.skinTone, 1);
    const rightArm = scene.add.rectangle(11, 1, 4, 16, colors.skinTone, 1);
    const leftLeg = scene.add.rectangle(-4, 16, 6, 14, colors.warehouseFloorDark, 1);
    const rightLeg = scene.add.rectangle(4, 16, 6, 14, colors.warehouseFloorDark, 1);

    const accents = this.createAccents(scene);

    this.carryPackage = scene.add.rectangle(10, -2, 12, 9, colors.upsBrownLight, 1);
    this.carryPackage.setStrokeStyle(1, colors.upsBrownDark, 1);
    this.carryPackage.setVisible(false);

    const snakeCellBox = scene.add.rectangle(12, -4, 24, 14, 0x2d3a22, 1);
    snakeCellBox.setStrokeStyle(2, colors.termiteHat, 0.9);
    const snakeCellText = scene.add.text(12, -4, 'CELL', {
      color: '#fff8c4',
      fontFamily: 'Arial',
      fontSize: '7px',
      fontStyle: 'bold',
    });
    snakeCellText.setOrigin(0.5);
    this.snakeCellPackage = scene.add.container(0, 0, [snakeCellBox, snakeCellText]);
    this.snakeCellPackage.setVisible(false);

    this.nameText = scene.add.text(0, -34, config.name.toUpperCase(), {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: isMobile ? '13px' : '10px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isMobile ? 5 : 3,
    });
    this.nameText.setOrigin(0.5);

    this.calloutBackground = scene.add.graphics();
    this.calloutText = scene.add.text(0, -60, '', {
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

    this.deadMarker = scene.add.text(0, -13, 'X_X', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '10px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.deadMarker.setOrigin(0.5);
    this.deadMarker.setVisible(false);

    this.add([
      this.calloutBubble,
      this.nameText,
      shadow,
      head,
      body,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      ...accents,
      this.carryPackage,
      this.snakeCellPackage,
      this.deadMarker,
    ]);
    this.setDepth(18);

    if (config.id === 'froodoo') {
      this.setScale(0.8);
    }

    scene.add.existing(this);
  }

  public update(delta: number): void {
    this.animTime += delta;

    if (this.id === 'dorothy') {
      this.updateSmoke(delta);
    }

    if (this.id === 'brian') {
      this.updateStinkLines();
    }

    if (this.calloutTimerMs > 0) {
      this.calloutTimerMs -= delta;
      if (this.calloutTimerMs <= 0) {
        this.calloutBubble.setVisible(false);
      }
    }

    if (this.state === 'gunDodging' || this.state === 'massaging' || this.state === 'dead') {
      return;
    }

    if (this.state === 'specialApproaching') {
      if (this.specialPickupPos) {
        this.moveToward(this.specialPickupPos, delta);
      }

      if (this.specialPickupPos && this.hasReached(this.specialPickupPos)) {
        this.state = 'specialDancing';
        this.specialDanceTimerMs = 3200;
        this.specialDanceBaseY = this.y;
        this.snakeCellPackage.setVisible(true);
      }

      return;
    }

    if (this.state === 'specialDancing') {
      this.specialDanceTimerMs -= delta;
      this.rotation = Math.sin(this.animTime / 90) * 0.14;
      this.y = this.specialDanceBaseY + Math.sin(this.animTime / 70) * 4;
      this.snakeCellPackage.y = -4 + Math.sin(this.animTime / 80) * 2;
      this.snakeCellPackage.x = 12 + Math.sin(this.animTime / 65) * 4;

      if (this.specialDanceTimerMs <= 0) {
        this.rotation = 0;
        this.snakeCellPackage.setVisible(false);
        this.snakeCellPackage.setPosition(0, 0);
        this.state = 'specialReset';
      }

      return;
    }

    if (this.state === 'specialReset') {
      this.moveToward(this.homePos, delta);

      if (this.hasReached(this.homePos)) {
        this.state = 'idle';
        this.stateTimerMs = Phaser.Math.Between(1600, 3200);
      }

      return;
    }

    if (this.state === 'idle') {
      this.stateTimerMs -= delta;

      if (this.stateTimerMs <= 0) {
        this.state = 'walkingToPile';
      }

      return;
    }

    if (this.state === 'walkingToPile') {
      this.moveToward(this.sidePilePos, delta, this.rushSpeed);

      if (this.hasReached(this.sidePilePos)) {
        this.state = 'pickingUp';
        this.stateTimerMs = 0;
      }

      return;
    }

    if (this.state === 'pickingUp') {
      this.setScale(this.scaleX, (this.id === 'froodoo' ? 0.8 : 1) + Math.sin(this.animTime / 140) * 0.01);

      return;
    }

    if (this.state === 'walkingToTruck') {
      this.moveToward(this.truckPos, delta);

      if (this.hasReached(this.truckPos)) {
        this.state = 'depositing';
        this.stateTimerMs = 340;
      }

      return;
    }

    if (this.state === 'depositing') {
      this.stateTimerMs -= delta;
      this.setScale(this.scaleX, 1 + Math.sin(this.animTime / 70) * 0.03);

      if (this.stateTimerMs <= 0) {
        this.carrying = false;
        this.carryPackage.setVisible(false);
        this.state = 'returning';
        this.setScale(this.scaleX, this.id === 'froodoo' ? 0.8 : 1);
      }

      return;
    }

    if (this.state === 'returning') {
      this.moveToward(this.sidePilePos, delta);

      if (this.hasReached(this.sidePilePos)) {
        this.state = 'idle';
        this.stateTimerMs = Phaser.Math.Between(1000, 3000);
      }
    }
  }

  public triggerSnakeCellDance(pickupPos: Phaser.Math.Vector2): boolean {
    if (this.id !== 'hussan') {
      return false;
    }

    this.specialPickupPos = pickupPos.clone();
    this.state = 'specialApproaching';
    this.stateTimerMs = 0;
    this.specialDanceTimerMs = 0;
    this.carrying = false;
    this.carryPackage.setVisible(false);
    this.snakeCellPackage.setVisible(false);
    return true;
  }

  public beginGunmanDodge(position: Phaser.Math.Vector2): boolean {
    if (this.id !== 'ben' || this.state === 'dead') {
      return false;
    }

    this.state = 'gunDodging';
    this.carrying = false;
    this.carryPackage.setVisible(false);
    this.snakeCellPackage.setVisible(false);
    this.deadMarker.setVisible(false);
    this.setPosition(position.x, position.y);
    this.setScale(1);
    this.setRotation(0);
    return true;
  }

  public markDead(position: Phaser.Math.Vector2): void {
    this.state = 'dead';
    this.carrying = false;
    this.carryPackage.setVisible(false);
    this.snakeCellPackage.setVisible(false);
    this.calloutBubble.setVisible(false);
    this.calloutTimerMs = 0;
    this.setPosition(position.x, position.y);
    this.setScale(1.05);
    this.setRotation(Phaser.Math.DegToRad(82));
    this.deadMarker.setVisible(true);
  }

  public sendDeadBodyToHell(): void {
    this.state = 'dead';
    this.setVisible(false);
    this.calloutBubble.setVisible(false);
    this.deadMarker.setVisible(false);
  }

  public beginMassageWork(position: Phaser.Math.Vector2): boolean {
    if (this.id !== 'aj' || this.state === 'dead') {
      return false;
    }

    this.state = 'massaging';
    this.carrying = false;
    this.carryPackage.setVisible(false);
    this.snakeCellPackage.setVisible(false);
    this.calloutBubble.setVisible(false);
    this.setPosition(position.x, position.y);
    this.setScale(1);
    this.setRotation(0);
    return true;
  }

  public finishMassageWork(): void {
    if (this.state !== 'massaging') {
      return;
    }

    this.setScale(1);
    this.setRotation(0);
    this.state = 'specialReset';
  }

  public receiveAmbientPackage(): void {
    if (this.state !== 'pickingUp') {
      return;
    }

    this.carrying = true;
    this.carryPackage.setVisible(true);
    this.state = 'walkingToTruck';
    this.setScale(this.scaleX, this.id === 'froodoo' ? 0.8 : 1);
  }

  public announce(message: string, durationMs = 2200): void {
    this.calloutText.setText(message);
    this.redrawCallout();
    this.calloutBubble.setVisible(true);
    this.calloutTimerMs = durationMs;
    audioSystem.play('npc-talk');
  }

  private moveToward(target: Phaser.Math.Vector2, delta: number, speedOverride?: number): void {
    const current = new Phaser.Math.Vector2(this.x, this.y);
    const distance = current.distance(target);

    if (distance <= 0) {
      return;
    }

    const step = (speedOverride ?? this.moveSpeed) * (delta / 1000);
    const direction = target.clone().subtract(current).normalize();

    this.x += direction.x * Math.min(step, distance);
    this.y += direction.y * Math.min(step, distance);
  }

  private hasReached(target: Phaser.Math.Vector2): boolean {
    return Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) < 5;
  }

  private getBodyColor(): number {
    switch (this.id) {
      case 'hussan':
        return colors.destBlue;
      case 'aj':
        return 0xcda574;
      case 'ben':
        return 0x4f4f56;
      case 'bannerman':
        return 0x8b6f34;
      case 'froodoo':
        return colors.stinkGreen;
      case 'dorothy':
        return colors.destPurple;
      case 'donna':
        return 0x5b8f7a;
      case 'brian':
      default:
        return 0x5a4d42;
    }
  }

  private createAccents(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
    const accents: Phaser.GameObjects.GameObject[] = [];

    if (this.id === 'hussan') {
      const phone = scene.add.rectangle(10, -14, 5, 5, 0x8fd4ff, 1);
      const gesturingHand = scene.add.rectangle(-14, -2, 3, 8, colors.skinTone, 1);
      accents.push(phone, gesturingHand);
    }

    if (this.id === 'aj') {
      const leftFoot = scene.add.rectangle(-5, 22, 7, 3, colors.skinTone, 1);
      const rightFoot = scene.add.rectangle(5, 22, 7, 3, colors.skinTone, 1);
      this.createMassageTable(scene);
      accents.push(leftFoot, rightFoot);
    }

    if (this.id === 'ben') {
      const demonBody = scene.add.rectangle(9, -2, 16, 16, colors.destPurple, 1);
      const leftHorn = scene.add.triangle(3, -12, 0, 8, 4, 0, 8, 8, colors.destPurple, 1);
      const rightHorn = scene.add.triangle(15, -12, 0, 8, 4, 0, 8, 8, colors.destPurple, 1);
      const leftWing = scene.add.triangle(1, -1, 0, 8, 0, 0, -10, 4, 0x5e1f75, 1);
      const rightWing = scene.add.triangle(17, -1, 0, 0, 0, 8, 10, 4, 0x5e1f75, 1);
      const leftEyeGlow = scene.add.circle(6, -4, 3, colors.warningRed, 0.3);
      const rightEyeGlow = scene.add.circle(12, -4, 3, colors.warningRed, 0.3);
      const leftEye = scene.add.circle(6, -4, 1.5, colors.warningRed, 1);
      const rightEye = scene.add.circle(12, -4, 1.5, colors.warningRed, 1);
      accents.push(
        leftWing,
        rightWing,
        demonBody,
        leftHorn,
        rightHorn,
        leftEyeGlow,
        rightEyeGlow,
        leftEye,
        rightEye,
      );
    }

    if (this.id === 'bannerman') {
      const glasses = scene.add.rectangle(0, -12, 12, 3, colors.black, 1);
      const moustache = scene.add.rectangle(0, -7, 9, 2, colors.upsBrownDark, 1);
      this.createLegoFeature(scene);
      accents.push(glasses, moustache);
    }

    if (this.id === 'dorothy') {
      const hair = scene.add.rectangle(0, -18, 14, 6, colors.termiteHat, 1);
      const cigarette = scene.add.rectangle(13, -7, 10, 3, colors.white, 1);
      const emberGlow = scene.add.circle(18, -7, 3.5, colors.warningRed, 0.28);
      const ember = scene.add.circle(18, -7, 2, colors.warningRed, 1);
      accents.push(hair, cigarette, ember);
      accents.push(emberGlow);

      for (let index = 0; index < 4; index += 1) {
        const puff = scene.add.ellipse(18, -24 - index * 8, 9, 9, 0xd3d3d3, 0.28);
        this.smokePuffs.push(puff);
        accents.push(puff);
      }
    }

    if (this.id === 'donna') {
      const hair = scene.add.rectangle(0, -18, 16, 8, 0xb06b3b, 1);
      const necklace = scene.add.circle(0, -2, 2, colors.fluorescent, 1);
      this.createWarcraftHusband(scene);
      accents.push(hair, necklace);
    }

    if (this.id === 'brian') {
      for (let index = 0; index < 4; index += 1) {
        const stink = scene.add.rectangle(-12 + index * 8, -22, 5, 24, 0x8ad334, 0.75);
        this.stinkLines.push(stink);
        accents.push(stink);
      }
    }

    return accents;
  }

  private updateSmoke(delta: number): void {
    this.smokeTimerMs += delta;

    for (let index = 0; index < this.smokePuffs.length; index += 1) {
      const puff = this.smokePuffs[index];
      const phase = ((this.smokeTimerMs / 620) + index * 0.24) % 1;
      puff.y = -24 - index * 8 - phase * 18;
      puff.x = 18 + Math.sin(this.smokeTimerMs / 240 + index) * 3;
      puff.alpha = 0.32 * (1 - phase);
      puff.scale = 0.95 + phase * 1.15;
    }
  }

  private updateStinkLines(): void {
    for (let index = 0; index < this.stinkLines.length; index += 1) {
      const line = this.stinkLines[index];
      line.x = -12 + index * 8 + Math.sin(this.animTime / 220 + index) * 2.8;
      line.y = -22 - Math.sin(this.animTime / 180 + index * 0.6) * 3;
      line.alpha = 0.62 + Math.sin(this.animTime / 260 + index * 0.7) * 0.14;
    }
  }

  private createMassageTable(scene: Phaser.Scene): void {
    const tableX = this.truckPos.x - 76;
    const tableY = this.truckPos.y + 14;
    const table = scene.add.graphics();
    table.fillStyle(0x4f2f18, 1);
    table.fillRoundedRect(tableX - 26, tableY - 10, 52, 18, 6);
    table.fillStyle(0xcfa782, 1);
    table.fillRoundedRect(tableX - 18, tableY - 6, 36, 10, 4);
    table.fillStyle(0x3a2410, 1);
    table.fillRect(tableX - 20, tableY + 8, 4, 12);
    table.fillRect(tableX + 16, tableY + 8, 4, 12);
    table.fillStyle(0x6c4830, 1);
    table.fillRoundedRect(tableX + 20, tableY - 7, 10, 12, 3);
    table.lineStyle(2, colors.black, 0.28);
    table.strokeRoundedRect(tableX - 26, tableY - 10, 52, 18, 6);
    table.setDepth(7);
  }

  private createLegoFeature(scene: Phaser.Scene): void {
    const featureX = this.truckPos.x - 76;
    const featureY = this.truckPos.y + 12;
    const lego = scene.add.graphics();
    lego.fillStyle(0xc83d2b, 1);
    lego.fillRect(featureX - 18, featureY + 2, 22, 12);
    lego.fillStyle(0x2f6fca, 1);
    lego.fillRect(featureX - 4, featureY - 10, 24, 14);
    lego.fillStyle(0xf0c933, 1);
    lego.fillRect(featureX - 24, featureY - 8, 18, 10);
    lego.fillStyle(0x46a84a, 1);
    lego.fillRect(featureX + 10, featureY + 6, 20, 10);
    lego.fillStyle(colors.fluorescent, 1);
    lego.fillCircle(featureX - 14, featureY - 10, 2);
    lego.fillCircle(featureX - 6, featureY - 10, 2);
    lego.fillCircle(featureX + 2, featureY - 10, 2);
    lego.fillCircle(featureX + 10, featureY - 10, 2);
    lego.fillCircle(featureX + 18, featureY + 6, 2);
    lego.fillCircle(featureX + 26, featureY + 6, 2);
    lego.lineStyle(2, colors.black, 0.22);
    lego.strokeRect(featureX - 24, featureY - 10, 54, 26);
    lego.setDepth(7);
  }

  private createWarcraftHusband(scene: Phaser.Scene): void {
    const deskX = this.truckPos.x + 78;
    const deskY = this.truckPos.y + 12;
    const setup = scene.add.graphics();
    setup.fillStyle(0x5a3a18, 1);
    setup.fillRect(deskX - 18, deskY, 40, 6);
    setup.fillRect(deskX - 16, deskY + 6, 4, 10);
    setup.fillRect(deskX + 14, deskY + 6, 4, 10);
    setup.fillStyle(0x24364f, 1);
    setup.fillRoundedRect(deskX - 10, deskY - 22, 22, 16, 4);
    setup.fillStyle(0x69b7ff, 0.85);
    setup.fillRoundedRect(deskX - 8, deskY - 20, 18, 12, 3);
    setup.fillStyle(colors.black, 1);
    setup.fillRect(deskX - 1, deskY - 6, 2, 7);
    setup.fillStyle(0x6f4a2f, 1);
    setup.fillCircle(deskX - 28, deskY - 6, 7);
    setup.fillStyle(0x4f5660, 1);
    setup.fillRoundedRect(deskX - 34, deskY + 2, 16, 12, 4);
    setup.fillStyle(colors.skinTone, 1);
    setup.fillCircle(deskX - 28, deskY - 18, 5);
    setup.fillStyle(0x7a5a22, 1);
    setup.fillRect(deskX - 31, deskY - 23, 6, 3);
    setup.fillStyle(0xa08635, 1);
    setup.fillRect(deskX - 22, deskY - 1, 7, 2);
    setup.setDepth(7);
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
    this.calloutBackground.fillStyle(colors.black, 0.8);
    this.calloutBackground.fillRoundedRect(-width / 2, top, width, height, 8);
    this.calloutBackground.lineStyle(2, colors.white, 0.18);
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
