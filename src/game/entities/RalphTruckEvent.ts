import Phaser from 'phaser';

import { GAME_WIDTH } from '../config/gameConfig';
import { colors } from '../config/colors';
import { audioSystem } from '../systems/AudioSystem';
import { BELT_RIGHT } from '../systems/BeltSystem';
import { BulkPileZone } from './BulkPileZone';

type RalphTruckState =
  | 'hidden'
  | 'truckEntering'
  | 'walkingToPile'
  | 'liftingFromPile'
  | 'walkingToTruck'
  | 'loadingTruck'
  | 'boardingTruck'
  | 'truckLeaving';

const RALPH_LINE = 'I NEED TO HURRY UP\nAND GET BACK TO MY\n3 SETS OF TRIPLETS!';
const RALPH_BUBBLE_TEXT_WIDTH = 170;
const RALPH_BUBBLE_WIDTH = 206;
const RALPH_BUBBLE_BASE_Y = -56;

export class RalphTruckEvent {
  private readonly scene: Phaser.Scene;

  private readonly bulkPileZone: BulkPileZone;

  private readonly truck: Phaser.GameObjects.Container;

  private readonly driverHead: Phaser.GameObjects.Rectangle;

  private readonly loadedBoxes: Phaser.GameObjects.Container[] = [];

  private readonly ralph: Phaser.GameObjects.Container;

  private readonly carryBox: Phaser.GameObjects.Container;

  private readonly bubble: Phaser.GameObjects.Container;

  private readonly bubbleBackground: Phaser.GameObjects.Graphics;

  private readonly bubbleText: Phaser.GameObjects.Text;

  private state: RalphTruckState = 'hidden';

  private driveSpeed = 290;

  private walkSpeed = 155;

  private packagesRemaining = 0;

  private loadedCount = 0;

  private stateTimerMs = 0;

  private bubbleTimerMs = 0;

  private readonly truckY = 612;

  private readonly truckStopX = 746;

  private readonly truckEnterX = GAME_WIDTH + 220;

  private readonly truckExitX = GAME_WIDTH + 300;

  constructor(scene: Phaser.Scene, bulkPileZone: BulkPileZone) {
    this.scene = scene;
    this.bulkPileZone = bulkPileZone;

    const truckShadow = scene.add.ellipse(0, 34, 220, 18, colors.black, 0.24);
    const cargo = scene.add.rectangle(-26, -6, 164, 74, 0x5f5f63, 1);
    cargo.setStrokeStyle(4, colors.black, 0.24);
    const cargoStripe = scene.add.rectangle(-26, -8, 156, 12, colors.destYellow, 0.78);
    const cargoDoor = scene.add.rectangle(-78, -5, 42, 60, colors.white, 0.14);
    cargoDoor.setStrokeStyle(2, colors.white, 0.18);
    const cab = scene.add.rectangle(88, 4, 78, 58, colors.upsBrownMid, 1);
    cab.setStrokeStyle(3, colors.upsBrownDark, 1);
    const windshield = scene.add.rectangle(102, -6, 28, 20, 0x8ec6d9, 0.88);
    const sideWindow = scene.add.rectangle(76, -6, 18, 18, 0x95d6ea, 0.8);
    const bumper = scene.add.rectangle(126, 18, 14, 10, 0xa7a7ac, 1);
    const grill = scene.add.rectangle(123, 3, 8, 22, 0xd8d8dc, 1);
    const label = scene.add.text(-26, -6, 'RALPH 5 TON', {
      color: '#fff8c4',
      fontFamily: 'Arial',
      fontSize: '16px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    });
    label.setOrigin(0.5);

    this.driverHead = scene.add.rectangle(98, -2, 14, 14, 0xd1a07d, 1);

    const wheels = [-86, -14, 72].map((x) => {
      const wheel = scene.add.circle(x, 30, 14, 0x1e1e1e, 1);
      wheel.setStrokeStyle(4, 0x585860, 1);
      return wheel;
    });

    const boxSlots = [
      new Phaser.Math.Vector2(10, -18),
      new Phaser.Math.Vector2(-26, -18),
      new Phaser.Math.Vector2(-62, -18),
      new Phaser.Math.Vector2(-8, 12),
      new Phaser.Math.Vector2(-46, 12),
    ];

    for (const slot of boxSlots) {
      const loadedBox = this.createBox(slot.x, slot.y, 24, 16);
      loadedBox.setVisible(false);
      this.loadedBoxes.push(loadedBox);
    }

    this.truck = scene.add.container(this.truckEnterX, this.truckY, [
      truckShadow,
      cargo,
      cargoStripe,
      cargoDoor,
      cab,
      windshield,
      sideWindow,
      bumper,
      grill,
      this.driverHead,
      ...this.loadedBoxes,
      ...wheels,
      label,
    ]);
    this.truck.setDepth(27);
    this.truck.setVisible(false);

    const ralphShadow = scene.add.ellipse(0, 18, 24, 8, colors.black, 0.28);
    const head = scene.add.rectangle(0, -14, 15, 13, 0xd1a07d, 1);
    const cap = scene.add.rectangle(0, -21, 13, 4, colors.destYellow, 1);
    const body = scene.add.rectangle(0, 1, 20, 24, colors.upsBrownMid, 1);
    const vest = scene.add.rectangle(0, 1, 10, 24, colors.destYellow, 0.9);
    const leftArm = scene.add.rectangle(-12, 2, 4, 16, 0xd1a07d, 1);
    const rightArm = scene.add.rectangle(12, 2, 4, 16, 0xd1a07d, 1);
    const leftLeg = scene.add.rectangle(-4, 18, 6, 14, colors.warehouseFloorDark, 1);
    const rightLeg = scene.add.rectangle(4, 18, 6, 14, colors.warehouseFloorDark, 1);
    const name = scene.add.text(0, -34, 'RALPH', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '10px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    name.setOrigin(0.5);

    this.carryBox = this.createBox(12, -3, 18, 12);
    this.carryBox.setVisible(false);

    this.bubbleBackground = scene.add.graphics();
    this.bubbleText = scene.add.text(0, -66, '', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '10px',
      fontStyle: 'bold',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: RALPH_BUBBLE_TEXT_WIDTH, useAdvancedWrap: true },
    });
    this.bubbleText.setOrigin(0.5);
    this.bubble = scene.add.container(0, 0, [this.bubbleBackground, this.bubbleText]);
    this.bubble.setVisible(false);

    this.ralph = scene.add.container(this.truckEnterX, this.truckY + 16, [
      this.bubble,
      name,
      ralphShadow,
      head,
      cap,
      body,
      vest,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      this.carryBox,
    ]);
    this.ralph.setDepth(28);
    this.ralph.setVisible(false);
  }

  public isActive(): boolean {
    return this.state !== 'hidden';
  }

  public start(): boolean {
    if (this.isActive() || this.bulkPileZone.getCount() < 5) {
      return false;
    }

    this.packagesRemaining = 5;
    this.loadedCount = 0;
    this.state = 'truckEntering';
    this.stateTimerMs = 0;
    this.bubbleTimerMs = 0;

    for (const box of this.loadedBoxes) {
      box.setVisible(false);
    }

    this.truck.setVisible(true);
    this.truck.setPosition(this.truckEnterX, this.truckY);
    this.driverHead.setVisible(true);
    audioSystem.play('truck');

    this.ralph.setVisible(false);
    this.ralph.setPosition(this.truckEnterX, this.truckY + 16);
    this.ralph.setScale(1);
    this.carryBox.setVisible(false);
    this.bubble.setVisible(false);

    return true;
  }

  public update(delta: number): void {
    if (this.state === 'hidden') {
      return;
    }

    if (this.bubbleTimerMs > 0) {
      this.bubbleTimerMs -= delta;
      if (this.bubbleTimerMs <= 0) {
        this.bubble.setVisible(false);
      }
    }

    if (this.state === 'truckEntering') {
      this.moveTruckToward(this.truckStopX, delta);

      if (Math.abs(this.truck.x - this.truckStopX) < 3) {
        this.truck.x = this.truckStopX;
        this.driverHead.setVisible(false);
        this.ralph.setPosition(this.getDoorPoint().x, this.getDoorPoint().y);
        this.ralph.setVisible(true);
        this.showBubble(RALPH_LINE, 3200);
        this.state = 'walkingToPile';
      }

      return;
    }

    if (this.state === 'walkingToPile') {
      const pilePoint = this.getPilePoint();
      this.moveContainerToward(this.ralph, pilePoint, delta, this.walkSpeed);

      if (this.hasReached(this.ralph, pilePoint)) {
        this.ralph.setPosition(pilePoint.x, pilePoint.y);
        this.state = 'liftingFromPile';
        this.stateTimerMs = 240;
      }

      return;
    }

    if (this.state === 'liftingFromPile') {
      this.stateTimerMs -= delta;
      this.ralph.setScale(1, 1 + Math.sin((240 - this.stateTimerMs) / 70) * 0.03);

      if (this.stateTimerMs <= 0) {
        this.ralph.setScale(1);
        if (this.packagesRemaining > 0 && this.bulkPileZone.removeCount(1) > 0) {
          this.packagesRemaining -= 1;
          this.carryBox.setVisible(true);
          this.state = 'walkingToTruck';
        } else {
          this.carryBox.setVisible(false);
          this.state = 'boardingTruck';
        }
      }

      return;
    }

    if (this.state === 'walkingToTruck') {
      const truckLoadPoint = this.getTruckLoadPoint();
      this.moveContainerToward(this.ralph, truckLoadPoint, delta, this.walkSpeed);

      if (this.hasReached(this.ralph, truckLoadPoint)) {
        this.ralph.setPosition(truckLoadPoint.x, truckLoadPoint.y);
        this.state = 'loadingTruck';
        this.stateTimerMs = 180;
        this.carryBox.setVisible(false);
        audioSystem.play('bulk');
        if (this.loadedCount < this.loadedBoxes.length) {
          this.loadedBoxes[this.loadedCount].setVisible(true);
          this.loadedCount += 1;
        }
      }

      return;
    }

    if (this.state === 'loadingTruck') {
      this.stateTimerMs -= delta;
      this.ralph.setScale(1 + Math.sin(this.stateTimerMs / 60) * 0.02, 1);

      if (this.stateTimerMs <= 0) {
        this.ralph.setScale(1);
        this.state = this.packagesRemaining > 0 ? 'walkingToPile' : 'boardingTruck';
      }

      return;
    }

    if (this.state === 'boardingTruck') {
      const doorPoint = this.getDoorPoint();
      this.moveContainerToward(this.ralph, doorPoint, delta, this.walkSpeed);

      if (this.hasReached(this.ralph, doorPoint)) {
        this.ralph.setVisible(false);
        this.driverHead.setVisible(true);
        this.state = 'truckLeaving';
      }

      return;
    }

    if (this.state === 'truckLeaving') {
      this.moveTruckToward(this.truckExitX, delta);

      if (this.truck.x >= this.truckExitX - 3) {
        this.forceHide();
      }
    }
  }

  public forceHide(): void {
    this.state = 'hidden';
    this.stateTimerMs = 0;
    this.bubbleTimerMs = 0;
    this.packagesRemaining = 0;
    this.loadedCount = 0;
    this.truck.setVisible(false);
    this.truck.setPosition(this.truckEnterX, this.truckY);
    this.driverHead.setVisible(true);
    this.ralph.setVisible(false);
    this.ralph.setPosition(this.truckEnterX, this.truckY + 16);
    this.ralph.setScale(1);
    this.carryBox.setVisible(false);
    this.bubble.setVisible(false);

    for (const box of this.loadedBoxes) {
      box.setVisible(false);
    }
  }

  private createBox(
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Container {
    const body = this.scene.add.rectangle(0, 0, width, height, colors.upsBrownLight, 1);
    body.setStrokeStyle(2, colors.upsBrownDark, 1);
    const tape = this.scene.add.rectangle(0, 0, 4, height, colors.destYellow, 0.82);
    return this.scene.add.container(x, y, [body, tape]);
  }

  private getDoorPoint(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(this.truck.x + 104, this.truck.y + 12);
  }

  private getTruckLoadPoint(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(this.truck.x - 88, this.truck.y + 12);
  }

  private getPilePoint(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(BELT_RIGHT + 44, this.bulkPileZone.y - 26);
  }

  private moveTruckToward(targetX: number, delta: number): void {
    const direction = Math.sign(targetX - this.truck.x);
    const step = this.driveSpeed * (delta / 1000);
    this.truck.x += direction * Math.min(step, Math.abs(targetX - this.truck.x));
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

  private hasReached(
    object: Phaser.GameObjects.Container,
    target: Phaser.Math.Vector2,
  ): boolean {
    return Phaser.Math.Distance.Between(object.x, object.y, target.x, target.y) < 5;
  }

  private showBubble(text: string, durationMs: number): void {
    this.bubbleText.setText(text);
    this.bubbleText.setWordWrapWidth(RALPH_BUBBLE_TEXT_WIDTH, true);
    audioSystem.play('npc-talk');
    const width = RALPH_BUBBLE_WIDTH;
    const lineCount = text.split('\n').length;
    const height = Math.max(56, this.bubbleText.height + lineCount * 2 + 22);
    const top = RALPH_BUBBLE_BASE_Y - height;
    const bubbleX =
      Phaser.Math.Clamp(this.ralph.x, width / 2 + 8, GAME_WIDTH - width / 2 - 8) -
      this.ralph.x;
    const pointerX = Phaser.Math.Clamp(-bubbleX, -width / 2 + 12, width / 2 - 12);

    this.bubble.setX(bubbleX);
    this.bubbleBackground.clear();
    this.bubbleBackground.fillStyle(colors.black, 0.82);
    this.bubbleBackground.fillRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.lineStyle(2, colors.white, 0.18);
    this.bubbleBackground.strokeRoundedRect(-width / 2, top, width, height, 8);
    this.bubbleBackground.fillTriangle(
      pointerX - 6,
      RALPH_BUBBLE_BASE_Y - 1,
      pointerX + 6,
      RALPH_BUBBLE_BASE_Y - 1,
      pointerX,
      RALPH_BUBBLE_BASE_Y + 10,
    );
    this.bubbleText.setPosition(0, top + height / 2);
    this.bubble.setVisible(true);
    this.bubbleTimerMs = durationMs;
  }
}
