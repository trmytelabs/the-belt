import Phaser from 'phaser';

import { colors } from '../config/colors';
import { audioSystem } from '../systems/AudioSystem';
import { FlavorNpc } from './FlavorNpc';

export type ExhaustTruckConfig = {
  id: string;
  x: number;
  y: number;
  side: 'left' | 'right';
};

type ExhaustPuff = {
  puff: Phaser.GameObjects.Ellipse;
  lifeMs: number;
  vx: number;
  vy: number;
};

const COUGH_LINES = ['COUGH!', 'HACK!', 'COUGH COUGH!', 'UGH, EXHAUST!'] as const;

export class TruckExhaustEvent {
  private readonly scene: Phaser.Scene;

  private readonly workers: FlavorNpc[];

  private readonly trucks: ExhaustTruckConfig[];

  private readonly drivers: Phaser.GameObjects.Container[] = [];

  private readonly puffs: ExhaustPuff[] = [];

  private isStarted = false;

  private driverTimerMs = 0;

  private puffTimerMs = 0;

  private coughTimerMs = Phaser.Math.Between(2500, 6500);

  constructor(scene: Phaser.Scene, trucks: ExhaustTruckConfig[], workers: FlavorNpc[]) {
    this.scene = scene;
    this.trucks = trucks;
    this.workers = workers;

    for (const truck of trucks) {
      const driver = this.createDriver(truck);
      driver.setVisible(false);
      this.drivers.push(driver);
    }
  }

  public hasStarted(): boolean {
    return this.isStarted;
  }

  public isActive(): boolean {
    return this.isStarted && this.driverTimerMs > 0;
  }

  public start(): void {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    this.driverTimerMs = 5200;
    this.puffTimerMs = 0;
    this.coughTimerMs = Phaser.Math.Between(2200, 5200);
    audioSystem.play('truck');

    this.drivers.forEach((driver, index) => {
      const truck = this.trucks[index];
      const cabOffset = truck.side === 'left' ? -42 : 42;
      driver.setPosition(truck.x + cabOffset, truck.y + 2);
      driver.setAlpha(0);
      driver.setScale(1);
      driver.setRotation(0);
      driver.setVisible(true);

      this.scene.tweens.add({
        targets: driver,
        alpha: 1,
        y: driver.y - 12,
        duration: 260,
        delay: index * 70,
        ease: 'Quad.Out',
      });
    });
  }

  public update(delta: number): void {
    if (!this.isStarted) {
      return;
    }

    this.updateDrivers(delta);
    this.updatePuffs(delta);
    this.updateCoughs(delta);
  }

  public forceHide(): void {
    this.isStarted = false;
    this.driverTimerMs = 0;
    this.puffTimerMs = 0;
    this.coughTimerMs = Phaser.Math.Between(2500, 6500);

    for (const driver of this.drivers) {
      this.scene.tweens.killTweensOf(driver);
      driver.setVisible(false);
      driver.setAlpha(1);
      driver.setScale(1);
      driver.setRotation(0);
    }

    for (const record of this.puffs) {
      record.puff.destroy();
    }
    this.puffs.length = 0;
  }

  private updateDrivers(delta: number): void {
    if (this.driverTimerMs <= 0) {
      return;
    }

    this.driverTimerMs -= delta;

    for (const driver of this.drivers) {
      driver.rotation = Math.sin(this.scene.time.now / 90 + driver.x) * 0.07;
      driver.setScale(1, 1 + Math.sin(this.scene.time.now / 120 + driver.y) * 0.04);
    }

    if (this.driverTimerMs <= 0) {
      for (const driver of this.drivers) {
        this.scene.tweens.add({
          targets: driver,
          alpha: 0,
          y: driver.y + 14,
          duration: 320,
          ease: 'Quad.In',
          onComplete: () => {
            driver.setVisible(false);
            driver.setAlpha(1);
          },
        });
      }
    }
  }

  private updatePuffs(delta: number): void {
    this.puffTimerMs -= delta;

    while (this.puffTimerMs <= 0) {
      const truck = Phaser.Utils.Array.GetRandom(this.trucks);
      this.spawnPuff(truck);
      this.puffTimerMs += Phaser.Math.Between(95, 180);
    }

    for (let index = this.puffs.length - 1; index >= 0; index -= 1) {
      const record = this.puffs[index];
      record.lifeMs -= delta;
      record.puff.x += record.vx * (delta / 1000);
      record.puff.y += record.vy * (delta / 1000);
      record.puff.scale += delta / 900;
      record.puff.alpha = Math.max(0, record.lifeMs / 1500) * 0.34;

      if (record.lifeMs <= 0) {
        record.puff.destroy();
        this.puffs.splice(index, 1);
      }
    }
  }

  private updateCoughs(delta: number): void {
    this.coughTimerMs -= delta;

    if (this.coughTimerMs > 0) {
      return;
    }

    const availableWorkers = this.workers.filter((worker) => worker.visible && worker.state !== 'dead');

    if (availableWorkers.length > 0) {
      Phaser.Utils.Array.GetRandom(availableWorkers).announce(
        Phaser.Utils.Array.GetRandom([...COUGH_LINES]),
        1500,
      );
    }

    this.coughTimerMs = Phaser.Math.Between(3200, 7600);
  }

  private spawnPuff(truck: ExhaustTruckConfig): void {
    const direction = truck.side === 'left' ? 1 : -1;
    const pipeX = truck.x + direction * 54;
    const pipeY = truck.y + Phaser.Math.Between(8, 22);
    const puff = this.scene.add.ellipse(
      pipeX,
      pipeY,
      Phaser.Math.Between(9, 15),
      Phaser.Math.Between(6, 11),
      0xc8c8c8,
      0.3,
    );
    puff.setDepth(10);

    this.puffs.push({
      puff,
      lifeMs: Phaser.Math.Between(1050, 1600),
      vx: direction * Phaser.Math.Between(18, 38),
      vy: Phaser.Math.Between(-18, -7),
    });
  }

  private createDriver(truck: ExhaustTruckConfig): Phaser.GameObjects.Container {
    const shadow = this.scene.add.ellipse(0, 17, 22, 7, colors.black, 0.28);
    const head = this.scene.add.rectangle(0, -11, 13, 11, colors.skinTone, 1);
    const cap = this.scene.add.rectangle(0, -18, 15, 5, colors.upsBrownDark, 1);
    const body = this.scene.add.rectangle(0, 2, 17, 22, colors.upsBrownMid, 1);
    const leftArm = this.scene.add.rectangle(-10, 1, 4, 15, colors.skinTone, 1);
    const rightArm = this.scene.add.rectangle(10, 1, 4, 15, colors.skinTone, 1);
    const leftLeg = this.scene.add.rectangle(-4, 17, 5, 13, colors.warehouseFloorDark, 1);
    const rightLeg = this.scene.add.rectangle(4, 17, 5, 13, colors.warehouseFloorDark, 1);
    const key = this.scene.add.rectangle(truck.side === 'left' ? -15 : 15, -2, 8, 3, colors.destYellow, 1);
    key.setRotation(truck.side === 'left' ? -0.45 : 0.45);

    const driver = this.scene.add.container(0, 0, [
      shadow,
      head,
      cap,
      body,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      key,
    ]);
    driver.setDepth(26);
    return driver;
  }
}
