import Phaser from 'phaser';
import { createColleagueArt, updateColleagueArt } from './DepotCastArt';
import type { ShiftEvent, ShiftModel } from './ShiftModel';
import { audioSystem } from '../systems/AudioSystem';

type Colleague = { art: Phaser.GameObjects.Container; tag: Phaser.GameObjects.Text; name: string; x: number; y: number };
type Speech = { panel: Phaser.GameObjects.Container; expires: number; priority: number };

/** The original warehouse's people and running jokes, staged outside the sort lanes. */
export class DepotLife {
  public readonly history: string[] = [];
  private readonly cast = new Map<string, Colleague>();
  private readonly cues = new Set<string>();
  private readonly speech = new Map<'left' | 'right', Speech>();
  private readonly scene: Phaser.Scene;
  private readonly model: ShiftModel;
  private bulkDelivered = 0;
  private johnUntil = 0;
  private ralphUntil = 0;
  private shanUntil = 0;
  private vicUntil = 0;
  private readonly reducedMotion: boolean;
  private readonly portal: Phaser.GameObjects.Graphics;
  private readonly bang: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, model: ShiftModel) {
    this.scene = scene;
    this.model = model;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const residents: [string, string, number, number][] = [
      ['hussan', 'HUSSAN', 51, 201], ['aj', 'AJ', 191, 398],
      ['ben', 'BEN', 48, 570], ['bannerman', 'BANNERMAN', 177, 570],
      ['fruitloop', 'FRUIT LOOP', 910, 201], ['doris', 'DORIS', 790, 398],
      ['brian', 'BRIAN', 796, 201], ['donna', 'DONNA', 908, 570],
    ];
    for (const [id, name, x, y] of residents) this.add(id, name, x, y, true);
    for (const [id, name, x, y] of [
      ['kylie', 'KYLIE', 850, 400], ['vic', 'VIC', 130, 399],
      ['john', 'JOHN RUSHTON', 77, 397], ['shan', 'SHAN O MACK', 880, 395],
      ['ralph', 'RALPH', 797, 569], ['paula', 'PAULA ABDUL', 112, 562],
      ['gunman', 'GUNMAN', 202, 528], ['demon', '', 58, 540],
    ] as [string, string, number, number][]) this.add(id, name, x, y, false);
    this.portal = scene.add.graphics().setDepth(14);
    this.bang = scene.add.text(124, 513, 'BANG!', {
      fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: 'bold',
      color: '#f0dfb3', stroke: '#713e42', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(17).setVisible(false);
  }

  private add(id: string, name: string, x: number, y: number, visible: boolean): void {
    const art = createColleagueArt(this.scene, id).setPosition(x, y).setDepth(15).setVisible(visible);
    art.setScale(art.scaleX * 0.8);
    const tag = this.scene.add.text(0, 39, name, {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', fontStyle: 'bold',
      color: '#d0d3b9', stroke: '#142b34', strokeThickness: 3,
    }).setOrigin(0.5);
    art.add(tag);
    this.cast.set(id, { art, tag, name, x, y });
  }

  public update(): void {
    const time = this.model.elapsedMs;
    for (const [side, bubble] of this.speech) {
      if (time >= bubble.expires) { bubble.panel.destroy(true); this.speech.delete(side); }
    }
    // A few purposeful idle gestures; the crew stays out of both workers' lanes.
    for (const id of ['hussan', 'brian', 'fruitloop', 'doris', 'ben', 'bannerman', 'donna']) {
      const colleague = this.cast.get(id)!;
      colleague.art.rotation = this.reducedMotion ? 0 : Math.sin(time / (id === 'brian' ? 210 : 1100) + colleague.x) * (id === 'brian' ? 0.025 : 0.013);
      updateColleagueArt(colleague.art, this.reducedMotion ? 0 : time);
    }
    this.once('coffee', 2800, () => this.say('kylie', 'WHERE IS MY\nTIMMY HORTANS?!', 4900, 1));
    const kylie = this.cast.get('kylie')!;
    kylie.art.setVisible(time > 1800 && time < 11500);
    kylie.art.x = time < 4500 ? Phaser.Math.Linear(986, 863, Phaser.Math.Clamp((time - 1800) / 2700, 0, 1))
      : time < 8300 ? 863 : Phaser.Math.Linear(863, 985, (time - 8300) / 3200);
    kylie.art.rotation = this.reducedMotion ? 0 : Math.sin(time / 120) * 0.04;

    this.once('john', 13000, () => this.john());
    const john = this.cast.get('john')!;
    john.art.setVisible(time < this.johnUntil);
    john.art.setScale(0.8, this.reducedMotion ? 0.8 : 0.76 + Math.sin(time / 160) * 0.04);

    this.once('massage', 23500, () => this.say('vic', 'I NEED A\nQUICK TUNE UP', 4800, 1));
    const vic = this.cast.get('vic')!;
    const massage = time >= 21000 && time < 33500;
    const lyingDown = time > 24700 && time < 30800;
    vic.art.setVisible(massage || time < this.vicUntil);
    vic.art.x = !massage ? 132 : time < 23700 ? Phaser.Math.Linear(-40, 132, Phaser.Math.Clamp((time - 21000) / 2700, 0, 1))
      : time < 30800 ? 132 : Phaser.Math.Linear(132, -40, (time - 30800) / 2700);
    vic.art.rotation = lyingDown ? Math.PI / 2 : 0;
    vic.tag.setVisible(!lyingDown);
    const aj = this.cast.get('aj')!;
    aj.art.rotation = time > 24700 && time < 30800 && !this.reducedMotion ? Math.sin(time / 95) * 0.08 : 0;

    this.once('snake', 41400, () => this.say('hussan', 'THE SNAKES CELL!', 3600));
    this.once('paid-day', 51200, () => {
      this.shanUntil = time + 7200;
      this.say('shan', 'TERMITE AND SKANKY HAVE BOTH WON A FREE PAID DAY OFF FROM UNITED WAY', 4100, 1);
    });
    this.once('paid-day-response', 55600, () => this.say('doris', 'YOU GOTTA BE\nFUCKING KIDDING', 3900, 1));
    this.cast.get('shan')!.art.setVisible(time < this.shanUntil);
    this.once('brian-response', 64600, () => this.say(this.model.activeWorker.id, 'YOU ARE SERIOUSLY SENDING 5 DOWN TO BULK?', 4700, 1));
    this.updateBenIncident(time);
    this.once('ralph', 87500, () => this.ralph());
    this.cast.get('ralph')!.art.setVisible(time < this.ralphUntil);
  }

  /** The original dodge-training / demon / Paula gag plays in the outer bay. */
  private updateBenIncident(time: number): void {
    const ben = this.cast.get('ben')!.art;
    const gunman = this.cast.get('gunman')!.art;
    const demon = this.cast.get('demon')!.art;
    const paula = this.cast.get('paula')!.art;
    gunman.setVisible(time >= 68000 && time < 81500);
    gunman.y = time < 69500 ? Phaser.Math.Linear(650, 528, Phaser.Math.Clamp((time - 68000) / 1500, 0, 1))
      : time < 80000 ? 528 : Phaser.Math.Linear(528, 650, (time - 80000) / 1500);
    this.once('gunman', 69500, () => this.say('gunman', "I'M GOING TO\nROB THIS PLACE!", 2400, 1));
    this.once('ben-training', 72000, () => this.say('ben', "DON'T WORRY GUYS. I GOT THIS. I TOOK TRAINING ON HOW TO DODGE GUNS", 4400, 1));
    if (time >= 76400 && time < 78500) {
      ben.x = 58 + Math.sin((time - 76400) / 230) * 22;
      ben.y = 554 + Math.cos((time - 76400) / 180) * 15;
      if (!this.reducedMotion) ben.rotation = Math.sin(time / 120) * 0.2;
    } else if (time < 76400) ben.setPosition(48, 570);
    for (const [index, at] of [78500, 78900, 79400].entries()) {
      this.once(`shot-${index}`, at, () => { audioSystem.play('gunshot'); });
    }
    // Comic impact lettering instead of full-screen flashes or screen shake.
    this.bang.setVisible(time >= 78500 && time < 79900);
    if (!this.reducedMotion) this.bang.setScale(1 + Math.sin(time / 130) * 0.06);
    if (time >= 79400 && time < 80500) ben.setRotation(Math.PI / 2);
    this.portal.clear();
    const portalProgress = Phaser.Math.Clamp((time - 80000) / 1000, 0, 1);
    if (time >= 80000 && time < 83500) {
      const closing = time > 82500 ? 1 - (time - 82500) / 1000 : 1;
      this.portal.fillStyle(0x2a1737).fillEllipse(58, 571, 65 * portalProgress * closing, 22 * portalProgress * closing);
      this.portal.lineStyle(2, 0xa472af, 0.8).strokeEllipse(58, 571, 62 * portalProgress * closing, 21 * portalProgress * closing);
    }
    demon.setVisible(time >= 80500 && time < 83000);
    if (time >= 80500 && time < 83000) {
      const emergence = Phaser.Math.Clamp((time - 80500) / 1000, 0, 1);
      const closing = time > 82000 ? 1 - (time - 82000) / 1000 : 1;
      demon.setScale((0.2 + emergence * 0.6) * closing).setPosition(58, 560 - emergence * 20);
      ben.setPosition(58, 565).setRotation(Math.PI / 2).setScale(0.8 * closing);
    }
    if (time >= 83000) ben.setVisible(false);
    paula.setVisible(time >= 83000 && time < 89500);
    paula.x = time < 84100 ? Phaser.Math.Linear(-25, 112, Phaser.Math.Clamp((time - 83000) / 1100, 0, 1))
      : time < 88000 ? 112 : Phaser.Math.Linear(112, -25, (time - 88000) / 1500);
    this.once('paula', 84100, () => this.say('paula', 'GREAT. NOW WHICH BITCH IS GOING TO LOAD MY FUCKING TRUCK', 4400, 1));
  }

  public onEvent(event: ShiftEvent): void {
    const item = this.model.packages.find(parcel => parcel.id === event.packageId);
    if (event.type === 'brake') {
      this.shanUntil = this.model.elapsedMs + 4200;
      this.say('shan', 'WHO STOPPED THE\n#@%! BELT?!', 3900);
    } else if (event.type === 'miss') {
      this.john();
    } else if (event.type === 'grab' && item?.kind === 'mesa') {
      this.vicUntil = this.model.elapsedMs + 3600;
      this.say('vic', 'VIC WANTS THE MESA', 3600);
      audioSystem.play('correct');
    } else if (event.type === 'grab' && item?.kind === 'lobsters') {
      this.say('fruitloop', 'LIVE LOBSTERS?!', 3300);
    } else if (event.type === 'grab' && item?.kind === 'snakes') {
      this.say('hussan', 'THE SNAKES CELL!', 3300);
    } else if (event.type === 'phase' && this.model.phase === 'rush') {
      this.say('brian', 'SENDING 5 DOWN', 4200, 1);
    } else if (event.type === 'sort' && event.route === 'C') {
      this.bulkDelivered += 1;
      if (this.bulkDelivered === 3) this.ralph();
    } else if (event.type === 'end') {
      this.say(this.model.activeWorker.id, this.model.won ? 'WE SURVIVED!' : 'FUCK THIS.', 6000, 1);
    }
  }

  private john(): void {
    this.johnUntil = this.model.elapsedMs + 4000;
    this.say('john', "DON'T STACK\nBOXES ON BOXES!", 3600);
  }

  private ralph(): void {
    this.ralphUntil = this.model.elapsedMs + 5600;
    this.say('ralph', 'I NEED TO HURRY UP AND GET BACK TO MY 3 SETS OF TRIPLETS!', 4900);
    audioSystem.play('truck');
  }

  private once(key: string, at: number, action: () => void): void {
    if (this.model.elapsedMs < at || this.cues.has(key)) return;
    this.cues.add(key);
    action();
  }

  private say(id: string, copy: string, duration: number, priority = 0): void {
    const worker = this.model.workers.find(worker => worker.id === id);
    const colleague = this.cast.get(id);
    const speaker = worker ? { name: worker.id.toUpperCase(), x: worker.x } : colleague;
    if (!speaker) return;
    const side = speaker.x < 480 ? 'left' : 'right';
    const current = this.speech.get(side);
    // A reactive aside must not cut off a set-up or punchline midway through.
    if (current && current.expires > this.model.elapsedMs && current.priority > priority) return;
    current?.panel.destroy(true);
    const x = side === 'left' ? 18 : 740;
    const y = 155;
    const name = this.scene.add.text(x + 12, y + 9, speaker.name, {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#7c5534',
    });
    const text = this.scene.add.text(x + 12, y + 26, copy, {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#19313a',
      wordWrap: { width: 178 }, lineSpacing: 2,
    });
    const height = text.height + 39;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x061a22, 0.25).fillRoundedRect(x + 3, y + 4, 202, height, 7);
    bg.fillStyle(0xf0dfb3).fillRoundedRect(x, y, 202, height, 7);
    bg.lineStyle(2, 0xb59b6b).strokeRoundedRect(x, y, 202, height, 7);
    bg.fillStyle(0xf0dfb3).fillTriangle(x + 38, y + height - 1, x + 54, y + height - 1, x + 47, y + height + 10);
    const panel = this.scene.add.container(0, 0, [bg, name, text]).setDepth(45);
    this.speech.set(side, { panel, expires: this.model.elapsedMs + duration, priority });
    this.history.push(`${speaker.name}: ${copy.replace(/\n/g, ' ')}`);
    audioSystem.play('npc-talk');
  }
}
