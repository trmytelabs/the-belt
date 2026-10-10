import Phaser from 'phaser';
import { createParcelArt, type DepotArt } from './DepotArt';
import { createDriverArt, createRalphTruckArt, setRalphTruckLoad } from './DepotProps';
import type { ShiftModel } from './ShiftModel';
import { audioSystem } from '../systems/AudioSystem';

export type DepotColleague = {
  art: Phaser.GameObjects.Container; tag: Phaser.GameObjects.Text;
  name: string; x: number; y: number;
};
type Speaker = (id: string, text: string, duration: number, priority?: number) => void;
const RESIDENTS = ['hussan', 'aj', 'ben', 'bannerman', 'fruitloop', 'doris', 'brian', 'donna'];
const mix = (a: number, b: number, t: number) => Phaser.Math.Linear(a, b, Phaser.Math.Clamp(t, 0, 1));

/** Original coworker freight routines and special cargo events, on the new floor plan. */
export class DepotRoutines {
  public readonly crewLoads = new Map<string, number>();
  public snakeState: 'waiting' | 'belt' | 'collecting' | 'dancing' | 'done' = 'waiting';
  public ralphState: 'waiting' | 'entering' | 'loading' | 'leaving' | 'done' = 'waiting';
  public ralphLoaded = 0;
  public ralphLifted = 0;
  public driversVisible = false;
  private readonly crewFreight = new Map<string, Phaser.GameObjects.Container>();
  private readonly crewEpoch = new Map<string, number>();
  private readonly cell: Phaser.GameObjects.Container;
  private readonly cellCaption: Phaser.GameObjects.Text;
  private readonly cellStamp: Phaser.GameObjects.Text;
  private cellTravel = 0;
  private cellTime = 0;
  private readonly ralphTruck: Phaser.GameObjects.Container;
  private readonly ralphBox: Phaser.GameObjects.Container;
  private ralphStart = 0;
  private readonly exhaust: Phaser.GameObjects.Graphics;
  private readonly drivers: Phaser.GameObjects.Container[];
  private readonly driverPoints: { x: number; y: number }[];
  private readonly model: ShiftModel;
  private readonly depot: DepotArt;
  private readonly cast: Map<string, DepotColleague>;
  private readonly say: Speaker;
  private readonly reducedMotion: boolean;

  constructor(scene: Phaser.Scene, model: ShiftModel, depot: DepotArt, cast: Map<string, DepotColleague>, say: Speaker) {
    this.model = model; this.depot = depot; this.cast = cast; this.say = say;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const id of RESIDENTS) {
      this.crewFreight.set(id, createParcelArt(scene, id === 'hussan' ? 'A' : 'B').setScale(0.42).setDepth(16).setVisible(false));
    }
    this.cell = createParcelArt(scene, 'A', false, 'snakes').setDepth(23).setVisible(false);
    this.cellStamp = this.cell.list.find(child => child instanceof Phaser.GameObjects.Text && child.text === 'THE SNAKES CELL') as Phaser.GameObjects.Text;
    this.cellCaption = scene.add.text(0, 24, 'THE SNAKES CELL', {
      fontFamily: 'Arial', fontSize: '9px', fontStyle: 'bold', color: '#f2dfac', stroke: '#19343b', strokeThickness: 3,
    }).setOrigin(0.5);
    this.cell.add(this.cellCaption);
    this.ralphTruck = createRalphTruckArt(scene).setPosition(1040, 467).setDepth(16).setVisible(false);
    this.ralphBox = createParcelArt(scene, 'C').setScale(0.48).setDepth(18).setVisible(false);
    this.exhaust = scene.add.graphics().setDepth(12);
    this.driverPoints = [...RESIDENTS.map(id => depot.crewTruckPoints[id]), { x: 44, y: 300 }, { x: 916, y: 300 }];
    this.drivers = this.driverPoints.map(() => createDriverArt(scene).setScale(0.48).setDepth(18).setVisible(false));
  }

  public update(time: number, reserved: ReadonlySet<string>): void {
    RESIDENTS.forEach((id, index) => {
      const colleague = this.cast.get(id)!;
      const parcel = this.crewFreight.get(id)!;
      if (reserved.has(id) || !colleague.art.visible) {
        parcel.setVisible(false); this.crewEpoch.set(id, time + 1000); return;
      }
      const period = 18_000;
      const clock = Math.max(0, time - (this.crewEpoch.get(id) ?? (7500 + index * 1100)));
      const cycle = clock % period;
      const truck = this.depot.crewTruckPoints[id];
      const loadingPoint = { x: truck.x, y: Math.min(583, truck.y) };
      const pickup = { x: colleague.x < 480 ? 212 : 748, y: colleague.y };
      const start = { x: colleague.x, y: colleague.y };
      let from = start; let to = start; let amount = 0;
      if (clock > 0 && cycle < 2200) { to = pickup; amount = cycle / 2200; }
      else if (clock > 0 && cycle < 2600) { from = pickup; to = pickup; }
      else if (clock > 0 && cycle < 4800) { from = pickup; to = loadingPoint; amount = (cycle - 2600) / 2200; }
      else if (clock > 0 && cycle < 5300) { from = loadingPoint; to = loadingPoint; }
      else if (clock > 0 && cycle < 7500) { from = loadingPoint; to = start; amount = (cycle - 5300) / 2200; }
      colleague.art.setPosition(mix(from.x, to.x, amount), mix(from.y, to.y, amount));
      const moving = from !== to && amount > 0;
      colleague.art.rotation = moving && !this.reducedMotion ? Math.sin(time / 115) * 0.035 : 0;
      const carrying = clock > 0 && cycle >= 2600 && cycle < 4900;
      parcel.setVisible(carrying).setPosition(colleague.art.x + (colleague.x < 480 ? 10 : -10), colleague.art.y - 3);
      this.crewLoads.set(id, clock <= 0 ? 0 : Math.floor(clock / period) + Number(cycle >= 4900));
    });
    this.updateCell(time);
    this.updateRalph(time);
    this.updateExhaust(time);
    this.depot.setBulkStock(Math.max(0, this.model.bulkSorted - this.ralphLifted));
  }

  public isHussanBusy(time: number): boolean { return time >= 40000 && (this.snakeState !== 'done' || time < this.cellTime + 1600); }

  private updateCell(time: number): void {
    const hussan = this.cast.get('hussan')!;
    const cellIntakeClear = !this.model.packages.some(parcel => parcel.state === 'belt' && Math.abs(parcel.y - 164) < 70);
    if (time >= 40000 && this.snakeState === 'waiting' && cellIntakeClear) {
      this.snakeState = 'belt'; this.cellTravel = this.model.beltTravel;
      this.cell.setPosition(480, 164).setVisible(true);
      this.say('hussan', 'THE SNAKES CELL!', 3200, 1);
    }
    if (this.snakeState === 'belt') {
      this.cell.y = 164 + this.model.beltTravel - this.cellTravel;
      // Hussan approaches along the intake apron above the workers' walk lanes.
      const approach = Phaser.Math.Clamp((this.cell.y - 164) / 44, 0, 1);
      hussan.art.setPosition(mix(51, 411, approach), 174);
      if (this.cell.y >= 208) { this.snakeState = 'collecting'; this.cellTime = time; }
    }
    if (this.snakeState === 'collecting') {
      const progress = (time - this.cellTime) / 350;
      this.cellCaption.setVisible(false);
      this.cellStamp.setText('CELL').setFontSize(11);
      this.cell.setScale(mix(1, 0.72, progress));
      this.cell.setPosition(mix(480, hussan.art.x + 12, progress), mix(208, hussan.art.y - 4, progress));
      if (progress >= 1) { this.snakeState = 'dancing'; this.cellTime = time; }
    }
    if (this.snakeState === 'dancing') {
      const elapsed = time - this.cellTime;
      hussan.art.rotation = this.reducedMotion ? 0 : Math.sin(elapsed / 90) * 0.14;
      hussan.art.y = 174 + (this.reducedMotion ? 0 : Math.sin(elapsed / 70) * 4);
      this.cell.setPosition(hussan.art.x + 12 + (this.reducedMotion ? 0 : Math.sin(elapsed / 65) * 4), hussan.art.y - 4);
      if (elapsed >= 3200) { this.snakeState = 'done'; this.cellTime = time; this.cell.setVisible(false); hussan.art.setRotation(0); }
    }
    if (this.snakeState === 'done' && time < this.cellTime + 1600) {
      hussan.art.setPosition(mix(411, hussan.x, (time - this.cellTime) / 1600), mix(174, hussan.y, (time - this.cellTime) / 1600));
    }
  }

  private updateRalph(time: number): void {
    const ralph = this.cast.get('ralph')!.art;
    if (this.ralphState === 'waiting' && this.model.bulkSorted >= 5 && time >= 90000) {
      this.ralphState = 'entering'; this.ralphStart = time;
      this.ralphTruck.setVisible(true); audioSystem.play('truck');
    }
    if (this.ralphState === 'waiting' || this.ralphState === 'done') { ralph.setVisible(false); return; }
    const elapsed = time - this.ralphStart;
    if (elapsed < 1800) {
      this.ralphTruck.x = mix(1040, 846, elapsed / 1800);
      ralph.setVisible(false); return;
    }
    if (this.ralphState === 'entering') {
      this.ralphState = 'loading';
      this.say('ralph', 'I NEED TO HURRY UP\nAND GET BACK TO MY\n3 SETS OF TRIPLETS!', 4900, 1);
    }
    const loading = elapsed - 1800;
    if (loading < 15000) {
      const trip = loading % 3000;
      const loaded = Math.min(5, Math.floor(loading / 3000));
      if (loaded > this.ralphLoaded) audioSystem.play('bulk');
      this.ralphLoaded = loaded;
      this.ralphLifted = Math.min(5, loaded + Number(trip >= 1600));
      setRalphTruckLoad(this.ralphTruck, loaded);
      ralph.setVisible(true);
      if (trip < 1300) ralph.setPosition(mix(883, 785, trip / 1300), mix(480, 506, trip / 1300));
      else if (trip < 1600) ralph.setPosition(785, 506);
      else ralph.setPosition(mix(785, 883, (trip - 1600) / 1400), mix(506, 480, (trip - 1600) / 1400));
      this.ralphBox.setVisible(trip >= 1600).setPosition(ralph.x - 9, ralph.y - 4);
    } else {
      this.ralphState = 'leaving'; this.ralphLoaded = 5; this.ralphLifted = 5;
      setRalphTruckLoad(this.ralphTruck, 5);
      this.ralphBox.setVisible(false); ralph.setVisible(false);
      this.ralphTruck.x = mix(846, 1060, (loading - 15000) / 2200);
      if (loading >= 17200) { this.ralphState = 'done'; this.ralphTruck.setVisible(false); }
    }
  }

  private updateExhaust(time: number): void {
    const active = time >= 114000 && time < this.model.durationMs;
    this.exhaust.clear();
    this.driversVisible = active && time < 119200;
    this.drivers.forEach((driver, index) => {
      const point = this.driverPoints[index];
      driver.setVisible(this.driversVisible);
      driver.setPosition(point.x + (point.x < 480 ? -30 : 30), point.y + mix(21, 0, (time - 114000 - index * 70) / 2200));
    });
    if (!active) return;
    for (let index = 0; index < this.driverPoints.length; index++) {
      const point = this.driverPoints[index];
      for (let puff = 0; puff < 3; puff++) {
        const phase = ((time - 114000) / 2600 + puff / 3 + index / 7) % 1;
        const direction = point.x < 480 ? 1 : -1;
        this.exhaust.fillStyle(0x71837c, 0.19 * (1 - phase)).fillEllipse(
          point.x + direction * (20 + phase * 34), point.y + 12 - phase * 18,
          8 + phase * 19, 6 + phase * 12);
      }
    }
  }

  public hideFreight(): void {
    for (const parcel of this.crewFreight.values()) parcel.setVisible(false);
    this.cell.setVisible(false); this.ralphTruck.setVisible(false); this.ralphBox.setVisible(false);
    for (const driver of this.drivers) driver.setVisible(false);
    this.exhaust.clear();
  }
}
