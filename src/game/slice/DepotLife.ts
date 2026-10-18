import Phaser from 'phaser';
import { createColleagueArt, updateColleagueArt, setColleaguePose } from './DepotCastArt';
import { type DepotArt } from './DepotArt';
import { DepotRoutines, engineStartAt, type DepotColleague } from './DepotRoutines';
import { type DepotWorkerArt } from './DepotArt';
import type { Cutscene } from './StoryModel';
import { DRIVERS, SHAN_BREAKAGE_LINES, SHAN_NAME } from './StoryScript';
import { KYLIE_QUOTES, SHAN_RANTS, WORKER_SWEARS, COUGH_LINES, SHOT_WORDS, CLOCK_OUT_LINES, MESA } from './DepotReferences';
import { SHIFT_LAYOUT, type ShiftEvent, type ShiftModel } from './ShiftModel';
import { audioSystem } from '../systems/AudioSystem';
import { clearDepotFootprint, depotSolidFootprints, DEPOT_BODY_RADIUS, DEPOT_CARRY_RADIUS, type FootprintCircle } from './DepotClearance';

type Speech = { panel: Phaser.GameObjects.Container; expires: number; priority: number; id: string; copy: string; duration: number };
type PendingSpeech = Omit<Speech, 'panel' | 'expires'>;
type SpeechSide = 'left' | 'right';
const BEN_START = 68_000;
const BEN_END = 92_500;
const BEN_CAST = new Set(['ben', 'gunman', 'demon', 'paula']);

/** The original warehouse's people and running jokes, staged outside the sort lanes. */
/** Shan's breakage visit, in shift milliseconds: arrive, yell, leave. */
const SHAN_VISIT = { walk: 1200, leave: 4800, total: 6000 } as const;

export class DepotLife {
  public readonly history: string[] = [];
  private readonly cast = new Map<string, DepotColleague>();
  public readonly routines: DepotRoutines;
  private readonly cues = new Set<string>();
  private readonly speech = new Map<SpeechSide, Speech>();
  private readonly pendingSpeech: PendingSpeech[] = [];
  private readonly suspendedSpeech = new Map<SpeechSide, { speech: Speech; remainingMs: number; visible: boolean }>();
  private readonly suspendedPendingSpeech: PendingSpeech[] = [];
  private benActive = false;
  private benCompleted = false;
  private benClock = BEN_START;
  private readonly scene: Phaser.Scene;
  private readonly model: ShiftModel;
  private johnUntil = 0;
  private johnSpoken = false;
  private shanUntil = 0;
  private vicUntil = 0;
  private mesaOffering = false;
  private rantIndex = 1;
  private celebrationMs = 0;
  private breakageIndex = 0;
  /** Shan walking over to a breakage, yelling, and walking back, on the shift clock (as in 3D). */
  private shanVisit: { start: number; line: string; spoken: boolean; from: { x: number; y: number }; to: { x: number; y: number } } | null = null;
  /** Shan's breakage reactions so far, for the checks. */
  public readonly breakageLines: string[] = [];
  private readonly depot: DepotArt;
  private readonly deadMarker: Phaser.GameObjects.Text;
  private readonly towel: Phaser.GameObjects.Graphics;
  private readonly beltButton: Phaser.GameObjects.Arc;
  private readonly restartButton: Phaser.GameObjects.Arc;
  private readonly reducedMotion: boolean;
  private readonly portal: Phaser.GameObjects.Graphics;
  private readonly bang: Phaser.GameObjects.Text;
  private readonly solids = depotSolidFootprints();

  constructor(scene: Phaser.Scene, model: ShiftModel, depot: DepotArt) {
    this.scene = scene;
    this.model = model;
    this.depot = depot;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const residents: [string, string, number, number][] = [
      ['hussan', 'HUSSAN', 150, 196], ['aj', 'AJ', 200, 292],
      ['ben', 'BEN', 150, 388], ['bannerman', 'BANNERMAN', 150, 484],
      ['fruitloop', 'FRUIT LOOP', 810, 196], ['doris', 'DORIS', 810, 292],
      ['brian', 'BRIAN', 810, 388], ['donna', 'DONNA', 810, 484],
    ];
    for (const [id, name, x, y] of residents) this.add(id, name, x, y, true);
    for (const [id, name, x, y] of [
      ['kylie', 'KYLIE', 850, 400], ['vic', 'VIC', 132, 286],
      ['john', 'JOHN RUSHTON', 77, 397], ['shan', SHAN_NAME, 880, 395],
      ['ralph', 'RALPH', 751, 610], ['paula', 'PAULA ABDUL', 214, 382],
      ['gunman', 'GUNMAN', 344, 348], ['demon', '', 160, 360],
    ] as [string, string, number, number][]) this.add(id, name, x, y, false);
    this.portal = scene.add.graphics().setDepth(14);
    this.bang = scene.add.text(226, 333, 'BANG!', {
      fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: 'bold',
      color: '#f0dfb3', stroke: '#713e42', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(17).setVisible(false);
    this.deadMarker = scene.add.text(0, -15, 'X_X', {
      fontFamily: 'Arial', fontSize: '13px', fontStyle: 'bold', color: '#f4e0bd', stroke: '#372632', strokeThickness: 3,
    }).setOrigin(0.5).setVisible(false);
    this.cast.get('ben')!.art.add(this.deadMarker);
    this.towel = scene.add.graphics().setDepth(17).setVisible(false);
    this.towel.fillStyle(0xd4d8bf).fillRoundedRect(131, 272, 19, 22, 3);
    this.towel.lineStyle(2, 0x859b93).lineBetween(133, 277, 148, 277);
    scene.add.rectangle(420, 407, 21, 28, 0x50696b).setStrokeStyle(2, 0x83948c).setDepth(14);
    this.beltButton = scene.add.circle(420, 405, 7, 0xb55e50).setDepth(15);
    scene.add.text(420, 425, 'STOP', { fontFamily: 'Arial', fontSize: '7px', color: '#cbd3b9' }).setOrigin(0.5).setDepth(15);
    scene.add.rectangle(540, 407, 21, 28, 0x50696b).setStrokeStyle(2, 0x83948c).setDepth(14);
    this.restartButton = scene.add.circle(540, 405, 7, 0xb55e50).setDepth(15);
    scene.add.text(540, 425, 'START', { fontFamily: 'Arial', fontSize: '7px', color: '#cbd3b9' }).setOrigin(0.5).setDepth(15);
    this.routines = new DepotRoutines(scene, model, depot, this.cast, this.say.bind(this));
  }

  private add(id: string, name: string, x: number, y: number, visible: boolean): void {
    const art = createColleagueArt(this.scene, id).setPosition(x, y).setDepth(15).setVisible(visible);
    art.setScale(art.scaleX * 0.8);
    const tag = this.scene.add.text(0, ['ben', 'bannerman', 'donna'].includes(id) ? -46 : 39, name, {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', fontStyle: 'bold',
      color: '#d0d3b9', stroke: '#142b34', strokeThickness: 3,
    }).setOrigin(0.5);
    art.add(tag);
    this.cast.set(id, { art, tag, name, x, y });
  }

  public update(): void {
    // The interlude owns its own clock. Normal updates cannot advance the crew
    // or consume a suspended speech window while the story is in progress.
    if (this.benActive) return;
    const time = this.model.elapsedMs;
    this.advanceSpeech(time);
    // A few purposeful idle gestures; the crew stays out of both workers' lanes.
    for (const id of ['hussan', 'brian', 'fruitloop', 'doris', 'ben', 'bannerman', 'donna']) {
      const colleague = this.cast.get(id)!;
      colleague.art.rotation = this.reducedMotion ? 0 : Math.sin(time / (id === 'brian' ? 210 : 1100) + colleague.x) * (id === 'brian' ? 0.025 : 0.013);
      updateColleagueArt(colleague.art, this.reducedMotion ? 0 : time);
    }
    KYLIE_QUOTES.forEach((quote, index) => this.once(`coffee-${index}`, 2800 + index * 3700, () => this.say('kylie', quote, 3500, 1)));
    const kylie = this.cast.get('kylie')!;
    kylie.art.setVisible(time > 1800 && time < 15500);
    kylie.art.x = time < 4500 ? Phaser.Math.Linear(986, 863, Phaser.Math.Clamp((time - 1800) / 2700, 0, 1))
      : time < 12300 ? 863 : Phaser.Math.Linear(863, 985, (time - 12300) / 3200);
    kylie.art.y = time < 12300 ? 400 : Phaser.Math.Linear(400, 361, Phaser.Math.Clamp((time - 12300) / 850, 0, 1));
    kylie.art.rotation = this.reducedMotion ? 0 : Math.sin(time / 120) * 0.04;

    this.once('john', 13000, () => this.john());
    const john = this.cast.get('john')!;
    john.art.setVisible(time < this.johnUntil);
    const johnElapsed = 4600 - (this.johnUntil - time);
    john.art.x = johnElapsed < 600 ? Phaser.Math.Linear(-40, 77, Phaser.Math.Clamp(johnElapsed / 600, 0, 1))
      : johnElapsed < 3950 ? 77 : Phaser.Math.Linear(77, -40, Phaser.Math.Clamp((johnElapsed - 3950) / 650, 0, 1));
    john.art.setScale(0.8);
    setColleaguePose(john.art, johnElapsed < 600 || johnElapsed >= 3950 ? 'idle' : johnElapsed < 2100 ? 'shout' : 'crouch', this.reducedMotion ? 0 : time);
    if (john.art.visible && johnElapsed >= 600 && !this.johnSpoken) {
      this.johnSpoken = true;
      this.say('john', "DON'T STACK\nBOXES ON BOXES!", 3600);
    }

    this.once('massage', 23500, () => this.say('vic', 'I NEED A\nQUICK TUNE UP', 4800, 1));
    const vic = this.cast.get('vic')!;
    const massage = time >= 21000 && time < 33500;
    const lyingDown = time > 24700 && time < 30800;
    vic.art.setVisible(massage || time < this.vicUntil || this.mesaOffering);
    vic.art.x = !massage ? 132 : time < 23700 ? Phaser.Math.Linear(-40, 132, Phaser.Math.Clamp((time - 21000) / 2700, 0, 1))
      : time < 30800 ? 132 : Phaser.Math.Linear(132, -40, (time - 30800) / 2700);
    if (massage) vic.art.y = 286;
    vic.art.rotation = lyingDown ? Math.PI / 2 : 0;
    vic.tag.setVisible(!lyingDown);
    this.towel.setVisible(lyingDown);
    const aj = this.cast.get('aj')!;
    aj.art.rotation = 0;
    if (massage) aj.art.setPosition(lyingDown ? 200 : aj.x, lyingDown ? 286 : aj.y);
    setColleaguePose(aj.art, lyingDown ? 'massage' : 'idle', this.reducedMotion ? 0 : time);

    this.once('paid-day', 134000, () => {
      this.shanUntil = time + 7200;
      this.say('shan', 'TERMITE AND SKANKY HAVE BOTH WON A FREE PAID DAY OFF FROM UNITED WAY', 4100, 1);
    });
    // Let each pair finish speaking. All six original variants remain readable.
    ['hussan', 'fruitloop', 'aj', 'doris', 'bannerman', 'donna'].forEach((id, index) => {
      this.once(`paid-day-response-${index}`, 138600 + Math.floor(index / 2) * 3500,
        () => this.say(id, WORKER_SWEARS[index], 3300, 1));
    });
    this.once('paid-day-response-brian', 149100, () => this.say('brian', WORKER_SWEARS[0], 3300, 1));
    this.cast.get('shan')!.art.setVisible(time < this.shanUntil);
    this.once('brian-response', 64600, () => this.say(this.model.activeWorker.id, 'YOU ARE SERIOUSLY SENDING 5 DOWN TO BULK?', 4700, 1));
    if (this.benCompleted) this.cast.get('ben')!.art.setVisible(false);
    this.updateButtonIncident(time);
    const visiting = this.updateShanVisit(time);
    const shan = this.cast.get('shan')!.art;
    if (!visiting) shan.setData('ranting', time < this.shanUntil);
    updateColleagueArt(shan, this.reducedMotion ? 0 : time);
    // Near the end of the shift: drivers arrive, one engine starts, its exhaust
    // drifts in and the loaders nearby cough, then the rest start. The belt keeps running.
    this.once('drivers', DRIVERS.arriveAt, () => audioSystem.play('truck'));
    this.once('engine-first', DRIVERS.firstEngineAt, () => { audioSystem.play('engine'); this.scene.events.emit('depot-caption', '[ONE ENGINE STARTS]'); });
    this.once('engine-others', DRIVERS.otherEnginesAt, () => this.scene.events.emit('depot-caption', '[MORE ENGINES START]'));
    for (let index = 1; index < 12; index += 1) this.once(`engine-${index}`, engineStartAt(index), () => audioSystem.play('engine'));
    COUGH_LINES.forEach((line, index) => this.once(`cough-${index}`, DRIVERS.originalCoughAt[index],
      () => { this.say(index % 2 === 0 ? 'hussan' : 'doris', line, 2800, 1); audioSystem.play('cough'); }));
    this.once('cough-approved', DRIVERS.coughLine.at, () => { this.say(DRIVERS.coughLine.speaker, DRIVERS.coughLine.line, 2800, 1); audioSystem.play('cough'); });
    this.once('drivers-shan', DRIVERS.shanLine.at, () => this.say('shan', DRIVERS.shanLine.line, 3000, 1));
    const reserved = new Set<string>();
    if (time >= 21000 && time < 33500) reserved.add('aj');
    if (this.benCompleted) reserved.add('ben');
    if (this.routines.isHussanBusy(time)) reserved.add('hussan');
    this.routines.update(time, reserved);
    this.clearStandingCast(this.model.workers, lyingDown ? new Set(['vic']) : undefined);
    this.depot.updateDetails(this.reducedMotion ? 0 : time);
  }

  /** Give real workers priority; coworkers stand beside equipment and one another. */
  private clearStandingCast(workers: readonly { x: number; y: number }[], interacting = new Set<string>()): void {
    const occupied: FootprintCircle[] = workers.map(worker => ({ x: worker.x, y: worker.y, radius: DEPOT_CARRY_RADIUS }));
    for (const parcel of this.model.packages) if (parcel.state === 'floor') occupied.push({ x: parcel.x, y: parcel.y, radius: SHIFT_LAYOUT.parcelRadius });
    for (const [id, colleague] of this.cast) {
      const art = colleague.art;
      if (!art.visible || interacting.has(id)) continue;
      const radius = this.routines.isCarrying(id) ? DEPOT_CARRY_RADIUS : DEPOT_BODY_RADIUS;
      const point = clearDepotFootprint(art, radius, occupied, this.solids);
      this.routines.moveFreight(id, point.x - art.x, point.y - art.y);
      art.setPosition(point.x, point.y).setData('bodyRadius', radius);
      occupied.push({ ...point, radius });
    }
  }

  public get benInterludeReady(): boolean {
    return !this.benActive && !this.benCompleted && this.model.elapsedMs >= BEN_START;
  }

  public get benInterludeActive(): boolean { return this.benActive; }

  /** Authored incident time, from 68000 through 92500; independent of the shift. */
  public get benInterludeTime(): number { return this.benClock; }

  public get benInterludeSpeaker(): { id: string; name: string; copy: string; remainingMs: number } | null {
    if (!this.benActive) return null;
    const speech = [...this.speech.values()].find(item => BEN_CAST.has(item.id) && item.expires > this.benClock);
    if (!speech) return null;
    return {
      id: speech.id, name: this.cast.get(speech.id)!.name, copy: speech.copy,
      remainingMs: speech.expires - this.benClock,
    };
  }

  public beginBenInterlude(): void {
    if (!this.benInterludeReady) return;
    const clock = this.model.elapsedMs + this.celebrationMs;
    for (const [side, speech] of this.speech) {
      const remainingMs = Math.max(0, speech.expires - clock);
      if (remainingMs === 0) { speech.panel.destroy(true); continue; }
      this.suspendedSpeech.set(side, { speech, remainingMs, visible: speech.panel.visible });
      speech.panel.setVisible(false);
    }
    this.speech.clear();
    this.suspendedPendingSpeech.push(...this.pendingSpeech.splice(0));
    this.benClock = BEN_START;
    this.benActive = true;
    this.routines.hideCrewFreight('ben');
    this.updateBenIncident(this.benClock);
  }

  /** Root calls this only while the story is unpaused. No shift state is changed. */
  public updateBenInterlude(delta: number): boolean {
    if (!this.benActive) return this.benCompleted;
    if (!Number.isFinite(delta) || delta <= 0) return false;
    this.benClock = Math.min(BEN_END, this.benClock + Math.min(delta, 100));
    this.advanceSpeech(this.benClock);
    this.updateBenIncident(this.benClock);
    if (this.benClock < BEN_END) return false;

    this.benActive = false;
    this.benCompleted = true;
    for (const speech of this.speech.values()) speech.panel.destroy(true);
    this.speech.clear();
    this.pendingSpeech.length = 0;
    const clock = this.model.elapsedMs + this.celebrationMs;
    for (const [side, saved] of this.suspendedSpeech) {
      saved.speech.expires = clock + saved.remainingMs;
      saved.speech.panel.setVisible(saved.visible);
      this.speech.set(side, saved.speech);
    }
    this.suspendedSpeech.clear();
    this.pendingSpeech.push(...this.suspendedPendingSpeech.splice(0));
    return true;
  }

  private advanceSpeech(clock: number): void {
    for (const [side, bubble] of this.speech) {
      if (clock >= bubble.expires) { bubble.panel.destroy(true); this.speech.delete(side); }
    }
    for (const side of ['left', 'right'] as const) {
      if (this.speech.has(side)) continue;
      const next = this.pendingSpeech.findIndex(item => this.speakerSide(item.id) === side);
      if (next >= 0) {
        const item = this.pendingSpeech.splice(next, 1)[0];
        this.say(item.id, item.copy, item.duration, item.priority);
      }
    }
  }

  private updateButtonIncident(time: number): void {
    const vic = this.cast.get('vic')!.art;
    const shan = this.cast.get('shan')!.art;
    if (time >= 94000 && time < 102000) {
      vic.setVisible(true).setRotation(0).setPosition(
        time < 96000 ? Phaser.Math.Linear(40, 408, (time - 94000) / 2000) : time < 97500 ? 408 : Phaser.Math.Linear(408, -35, (time - 97500) / 4500), 397);
    }
    this.once('vic-stop', 96000, () => {
      this.model.eventStopped = true;
      this.beltButton.setFillStyle(0xefb574);
      this.say('vic', 'BELT STOPPED', 2600, 1);
      audioSystem.play('belt-stop');
    });
    if (time >= 99200 && time < 108000) {
      shan.setVisible(true).setPosition(time < 101200 ? Phaser.Math.Linear(960, 552, (time - 99200) / 2000)
        : time < 104000 ? 552 : Phaser.Math.Linear(552, 980, (time - 104000) / 4000), 397);
    } else shan.setPosition(880, 395);
    this.once('shan-rant', 99600, () => this.rant());
    this.once('shan-restart', 101800, () => {
      this.model.eventStopped = false;
      this.beltButton.setFillStyle(0xb55e50);
      this.restartButton.setFillStyle(0xa6cc9a);
      this.say('shan', 'BELT RUNNING', 2200, 1);
      audioSystem.play('button');
    });
  }

  public setMesaOffer(visible: boolean): void {
    this.mesaOffering = visible;
    const vic = this.cast.get('vic')!.art;
    vic.setVisible(visible).setRotation(0).setPosition(visible ? -35 : 401, 278);
    this.cast.get('vic')!.tag.setVisible(true);
    if (visible) {
      this.scene.tweens.add({ targets: vic, x: 401, duration: 1100, ease: 'Sine.easeOut' });
      this.say('vic', MESA.offer, 60000, 2);
    }
    else {
      for (const [side, speech] of this.speech) {
        if (speech.priority === 2) { speech.panel.destroy(true); this.speech.delete(side); }
      }
    }
  }

  public mesaThought(): void {
    const skanky = this.model.workers[1];
    const thought = this.scene.add.container(skanky.x, skanky.y - 75).setDepth(115);
    const cloud = this.scene.add.graphics();
    cloud.fillStyle(0xf0dfb3).fillEllipse(0, 0, 132, 76).fillCircle(-30, 51, 8).fillCircle(-17, 66, 4);
    const text = this.scene.add.text(0, 0, MESA.thought, {
      fontFamily: 'Arial', fontSize: '16px', fontStyle: 'bold', color: '#19313a', align: 'center',
    }).setOrigin(0.5);
    thought.add([cloud, text]);
    this.scene.tweens.add({ targets: thought, scale: this.reducedMotion ? 1 : 1.7, duration: 700 });
    this.scene.time.delayedCall(850, () => thought.destroy(true));
    this.history.push(`SKANKY: ${MESA.thought.replace(/\n/g, ' ')}`);
  }

  /** The original dodge-training / demon / Paula gag plays in the outer bay. */
  private updateBenIncident(time: number): void {
    const ben = this.cast.get('ben')!.art;
    const gunman = this.cast.get('gunman')!.art;
    const demon = this.cast.get('demon')!.art;
    const paula = this.cast.get('paula')!.art;
    gunman.setVisible(time >= 68000 && time < 81700);
    gunman.y = time < 69500 ? Phaser.Math.Linear(470, 348, Phaser.Math.Clamp((time - 68000) / 1500, 0, 1))
      : time < 80500 ? 348 : Phaser.Math.Linear(348, 470, (time - 80500) / 1200);
    // Exact source wording and line breaks; the full boast precedes the dodge.
    this.once('gunman', 69500, () => this.say('gunman', "I'M GOING TO\nROB THIS PLACE!", 2400, 2), time);
    this.once('ben-training', 72000, () => this.say('ben', "DON'T WORRY GUYS\nI GOT THIS\nI TOOK TRAINING ON\nHOW TO DODGE GUNS", 5200, 2), time);
    const dodge = Phaser.Math.Clamp((time - 77200) / 1300, 0, 1);
    const fallenX = 224;
    const fallenY = 378;
    ben.setVisible(time < 85600).setScale(0.8).setAlpha(1);
    this.cast.get('ben')!.tag.setVisible(time < 80020);
    if (time >= 77200 && time < 80020) {
      ben.setPosition(150 + 74 * dodge + Math.sin(dodge * Math.PI * 4) * 17,
        390 - 12 * dodge + Math.sin(dodge * Math.PI * 3) * 11);
      ben.rotation = this.reducedMotion ? 0 : Math.sin(time / 120) * 0.2;
    } else if (time < 77200) ben.setPosition(150, 390);
    else ben.setPosition(fallenX, fallenY).setRotation(Math.PI / 2 * Phaser.Math.Clamp((time - 80020) / 280, 0, 1));
    for (const [index, at] of [78500, 78760, 79180, 79500, 80020].entries()) {
      this.once(`shot-${index}`, at, () => { this.bang.setText(SHOT_WORDS[index]); audioSystem.play('gunshot'); }, time);
    }
    // Comic impact lettering instead of full-screen flashes or screen shake.
    this.bang.setVisible(time >= 78500 && time < 80500);
    if (!this.reducedMotion) this.bang.setScale(1 + Math.sin(time / 130) * 0.06);
    this.deadMarker.setVisible(time >= 80020 && time < 85600).setRotation(-ben.rotation);

    const opening = Phaser.Math.Clamp((time - 80500) / 1200, 0, 1);
    const departure = Phaser.Math.Clamp((time - 85000) / 600, 0, 1);
    this.portal.setVisible(time >= 80500 && time < 85600);
    this.drawHellGate(time, opening, departure);
    demon.setVisible(time >= 81700 && time < 85600).setDepth(16).setAlpha(1);
    if (time >= 81700 && time < 85000) {
      const emergence = Phaser.Math.Clamp((time - 81700) / 1500, 0, 1);
      const drag = Phaser.Math.Clamp((time - 83200) / 1800, 0, 1);
      // The adult reaches Ben's ankles, then both travel at the same speed.
      // Their 46px separation keeps the demon's hand on the rotated boot.
      demon.setScale(Phaser.Math.Linear(0.25, 1.24, emergence)).setPosition(
        Phaser.Math.Linear(162, 178, emergence) - 20 * drag,
        Phaser.Math.Linear(386, 357, emergence) + 8 * drag).setRotation(0);
      ben.setPosition(fallenX - 20 * drag, fallenY + 8 * drag).setRotation(Math.PI / 2);
    } else if (time >= 85000 && time < 85600) {
      // Only shrink after the body reaches the gate: a distinct final descent.
      const sink = Phaser.Math.Easing.Quadratic.In(departure);
      demon.setPosition(Phaser.Math.Linear(158, 162, sink), Phaser.Math.Linear(365, 379, sink))
        .setScale(1.24 * (1 - sink)).setAlpha(1 - sink).setRotation(0);
      ben.setPosition(Phaser.Math.Linear(204, 162, sink), Phaser.Math.Linear(386, 379, sink))
        .setRotation(Math.PI / 2).setScale(0.8 * (1 - sink)).setAlpha(1 - sink);
    }
    this.deadMarker.setRotation(-ben.rotation);
    // Paula arrives only after the body and demon have fully disappeared.
    paula.setVisible(time >= 85600 && time < 92500);
    paula.x = time < 86400 ? Phaser.Math.Linear(77, 214, Phaser.Math.Clamp((time - 85600) / 800, 0, 1))
      : time < 91600 ? 214 : Phaser.Math.Linear(214, 77, (time - 91600) / 900);
    paula.rotation = this.reducedMotion || time < 86400 || time >= 91600 ? 0 : Math.sin(time / 130) * 0.025;
    this.once('paula', 86400, () => this.say('paula', 'GREAT\nNOW WHICH BITCH\nIS GOING TO LOAD\nMY FUCKING TRUCK', 5200, 2), time);
  }

  /** BenGunmanEvent's pointed red/black gate and concentric orange hellfire. */
  private drawHellGate(time: number, opening: number, departure: number): void {
    const g = this.portal;
    g.clear();
    if (!g.visible) return;
    const amount = Phaser.Math.Easing.Cubic.Out(opening) * (1 - departure * departure);
    g.setPosition(162, 401 - 52 * amount).setScale(amount, amount).setAlpha(1 - departure);
    g.setData('incidentStage', time < 81700 ? 'gate-opening' : time < 83200 ? 'demon-emerging' : time < 85000 ? 'body-dragging' : 'departure');
    const pulse = this.reducedMotion ? 0 : Math.sin(time / 190) * 0.025;
    g.fillStyle(0x170d0b, 0.52).fillEllipse(0, 55, 102, 15);
    g.fillStyle(0x140000).fillEllipse(0, 0, 64, 98);
    g.fillStyle(0x5c0707).fillRoundedRect(-46, -55, 14, 109, 3).fillRoundedRect(32, -55, 14, 109, 3);
    g.fillStyle(0x240000).fillTriangle(-51, -53, -39, -79, -27, -53).fillTriangle(27, -53, 39, -79, 51, -53);
    g.fillStyle(0x80312a).fillTriangle(-47, -53, -39, -72, -37, -53).fillTriangle(31, -53, 39, -72, 41, -53);
    g.fillStyle(0x301613).fillRect(-47, 48, 17, 7).fillRect(30, 48, 17, 7);
    g.fillStyle(0xb34a31).fillRect(-35, -51, 3, 96).fillRect(32, -51, 3, 96);
    for (const y of [-37, -8, 21]) {
      g.lineStyle(1, 0x30110e).lineBetween(-45, y, -34, y).lineBetween(34, y, 45, y);
    }
    g.lineStyle(4, 0xff2b1c, 0.85).strokeEllipse(0, 0, 64 * (1 + pulse), 98 * (1 - pulse));
    g.lineStyle(2, 0xff8a25, 0.86).strokeEllipse(0, 0, 44, 82);
    g.fillStyle(0x9f230d, 0.35).fillEllipse(0, 7, 31, 66);
    // Five nested tongues stay inside the opening; no screen flash or floor glow.
    for (let index = 0; index < 5; index++) {
      const x = -20 + index * 10;
      const flicker = this.reducedMotion ? 0 : Math.sin(time / 150 + index * 1.8) * 4;
      const top = 12 - (2 - Math.abs(index - 2)) * 12 + flicker;
      g.fillStyle(index % 2 ? 0xff8a25 : 0xcf3c18, 0.88).fillTriangle(x - 8, 34, x + 3, top, x + 8, 37);
      g.fillStyle(0xffd36b, 0.74).fillTriangle(x - 3, 36, x + 2, top + 13, x + 5, 37);
    }
    g.lineStyle(2, 0xffd36b, 0.56).beginPath().moveTo(-14, -34).lineTo(10, -14)
      .lineTo(-6, 5).lineTo(13, 27).strokePath();
  }

  public onEvent(event: ShiftEvent): void {
    const item = this.model.packages.find(parcel => parcel.id === event.packageId);
    if (event.type === 'brake') {
      this.rant();
    } else if (event.type === 'miss') {
      this.john();
    } else if (event.type === 'grab' && item?.kind === 'lobsters') {
      this.say('fruitloop', 'LIVE LOBSTERS?!', 3300);
    } else if (event.type === 'grab' && item?.kind === 'snakes') {
      this.say('hussan', 'THE SNAKES CELL!', 3300);
    } else if (event.type === 'brian') {
      this.say('brian', 'SENDING 5 DOWN', 4200, 1);
    }
  }

  /** A thrown parcel broke: Shan comes over and yells; the belt keeps moving. */
  public shanBreakage(worker: { x: number; y: number; side: 'left' | 'right' }): void {
    const line = SHAN_BREAKAGE_LINES[this.breakageIndex % SHAN_BREAKAGE_LINES.length];
    this.breakageIndex += 1;
    this.breakageLines.push(line.split('\n').join(' '));
    const time = this.model.elapsedMs;
    // Already on his way over: the next breakage just gets another line.
    if (this.shanVisit && time < this.shanVisit.start + SHAN_VISIT.total) {
      this.shanUntil = Math.max(this.shanUntil, time + 3400);
      this.say('shan', line, 3400, 1);
      return;
    }
    const laneX = worker.side === 'left' ? 365 : 595;
    const top = worker.y > 784 ? 790 : Math.max(-10, worker.y - 150);
    this.shanVisit = {
      start: time, line, spoken: false,
      from: { x: laneX, y: top },
      to: { x: worker.x + (worker.side === 'left' ? 30 : -30), y: worker.y - 40 },
    };
    this.shanUntil = Math.max(this.shanUntil, time + SHAN_VISIT.total);
  }

  /** Walks Shan over, has him yell once he arrives, then walks him back. */
  private updateShanVisit(time: number): boolean {
    const visit = this.shanVisit;
    if (!visit || time >= visit.start + SHAN_VISIT.total) return false;
    const e = time - visit.start;
    const p = e < SHAN_VISIT.walk ? e / SHAN_VISIT.walk : e < SHAN_VISIT.leave ? 1 : 1 - (e - SHAN_VISIT.leave) / (SHAN_VISIT.total - SHAN_VISIT.leave);
    const yelling = e >= SHAN_VISIT.walk && e < SHAN_VISIT.leave;
    if (yelling && !visit.spoken) {
      visit.spoken = true;
      this.say('shan', visit.line, 3400, 1);
    }
    this.cast.get('shan')!.art.setVisible(true)
      .setPosition(Phaser.Math.Linear(visit.from.x, visit.to.x, p), Phaser.Math.Linear(visit.from.y, visit.to.y, p))
      .setData('ranting', yelling);
    return true;
  }

  /** The scrum at the head of the belt and Shan catching Skanky at clock-out, on the depot floor. */
  public directStory(cutscene: Cutscene, workers: DepotWorkerArt[], progress: (cue: string) => number): { x: number; y: number; zoom: number } {
    const place = (id: string, x: number, y: number): void => { this.cast.get(id)?.art.setVisible(true).setPosition(x, y); };
    const shan = this.cast.get('shan')!.art;
    const time = this.reducedMotion ? 0 : this.scene.time.now;
    if (cutscene.scene.id === 'scrum') {
      // Everyone puts their freight down for the scrum.
      this.routines.hideFreight();
      const gather = progress('gather');
      const spots: [string, number, number][] = [
        ['hussan', 372, 40], ['aj', 398, 4], ['ben', 420, 54], ['bannerman', 560, 6],
        ['fruitloop', 584, 46], ['doris', 540, 54], ['brian', 612, 16], ['donna', 348, 8],
      ];
      for (const [id, x, y] of spots) {
        if (id === 'ben' && this.benCompleted) continue;
        place(id, x, y - 40 * (1 - gather));
        const art = this.cast.get(id)!.art;
        const furious = progress('crew-furious') > 0;
        art.rotation = furious && !this.reducedMotion ? Math.sin(time / 90 + x) * 0.08 : 0;
        setColleaguePose(art, id === 'aj' && furious ? 'shout' : 'idle', time);
      }
      workers[0].container.setPosition(452, 18 - 40 * (1 - gather)).setVisible(true);
      workers[1].container.setPosition(508, 18 - 40 * (1 - gather)).setVisible(true);
      workers[0].update(time, false, true, false);
      workers[1].update(time, false, true, false);
      shan.setVisible(true).setPosition(480, 100).setData('ranting', progress('shan-over') > 0);
      updateColleagueArt(shan, time);
      this.clearStandingCast(workers.map(worker => worker.container));
      return { x: 480, y: 60, zoom: 2.1 };
    }
    const leaves = progress('termite-leaves');
    const catches = progress('shan-catches');
    workers[1].container.setPosition(560, 650).setVisible(true);
    workers[0].container.setPosition(Phaser.Math.Linear(410, 365, leaves), Phaser.Math.Linear(650, 900, leaves)).setVisible(true);
    workers[0].update(time, leaves > 0 && leaves < 1, true, false);
    workers[1].update(time, false, true, false);
    shan.setVisible(true).setPosition(Phaser.Math.Linear(480, 520, catches), Phaser.Math.Linear(560, 640, catches)).setData('ranting', false);
    updateColleagueArt(shan, time);
    this.clearStandingCast(workers.map(worker => worker.container));
    return { x: 480, y: 680, zoom: 1.8 };
  }

  private rant(): void {
    this.shanUntil = this.model.elapsedMs + 4200;
    this.say('shan', SHAN_RANTS[this.rantIndex % SHAN_RANTS.length], 3900);
    this.rantIndex += 1;
  }

  private john(): void {
    this.johnUntil = this.model.elapsedMs + 4600;
    this.johnSpoken = false;
  }

  public beginCelebration(): void {
    this.celebrationMs = 0;
    this.pendingSpeech.length = 0;
    this.routines.hideFreight();
    this.say('termite', 'SHIFT DONE!', 2500, 2);
    this.say('skanky', 'CLOCKED OUT!', 2500, 2);
  }

  public updateCelebration(delta: number): boolean {
    this.celebrationMs += Math.min(delta, 100);
    const residents = ['hussan', 'fruitloop', 'aj', 'doris', 'bannerman', 'donna', 'hussan', 'brian'];
    CLOCK_OUT_LINES.forEach((line, index) => {
      const at = 2700 + Math.floor(index / 2) * 2500;
      const key = `clock-out-${index}`;
      if (this.celebrationMs >= at && !this.cues.has(key)) {
        this.cues.add(key); this.say(residents[index], line, 2350, 2);
      }
    });
    for (const colleague of this.cast.values()) {
      if (!colleague.art.visible) continue;
      colleague.art.rotation = this.reducedMotion ? 0 : Math.sin(this.celebrationMs / 140 + colleague.x) * 0.06;
    }
    this.depot.departTrucks(Phaser.Math.Clamp((this.celebrationMs - 1600) / 5500, 0, 1));
    return this.celebrationMs >= 13000;
  }

  private once(key: string, at: number, action: () => void, clock = this.model.elapsedMs): void {
    if (clock < at || this.cues.has(key)) return;
    this.cues.add(key);
    action();
  }

  public say(id: string, copy: string, duration: number, priority = 0): void {
    if (this.benActive && !BEN_CAST.has(id)) {
      if (!this.suspendedPendingSpeech.some(item => item.id === id && item.copy === copy)) {
        this.suspendedPendingSpeech.push({ id, copy, duration, priority });
      }
      return;
    }
    const worker = this.model.workers.find(worker => worker.id === id);
    const colleague = this.cast.get(id);
    const speaker = worker ? { name: worker.id.toUpperCase(), x: worker.x } : colleague;
    if (!speaker) return;
    const side = speaker.x < 480 ? 'left' : 'right';
    const current = this.speech.get(side);
    // A reactive aside must not cut off a set-up or punchline midway through.
    const clock = this.benActive ? this.benClock : this.model.elapsedMs + this.celebrationMs;
    if (current && current.expires > clock && current.priority >= priority && priority < 2) {
      if (!this.pendingSpeech.some(item => item.id === id && item.copy === copy)) {
        this.pendingSpeech.push({ id, copy, duration, priority });
      }
      return;
    }
    if (current && current.expires > clock && current.priority < priority && current.priority < 2) {
      if (!this.pendingSpeech.some(item => item.id === current.id && item.copy === current.copy)) {
        this.pendingSpeech.unshift({ id: current.id, copy: current.copy, duration: current.duration, priority: current.priority });
      }
    }
    // Reactive visitors may have finished their walk while their line waited.
    // Keep the actual speaker on the floor for the full readable speech window.
    if (id === 'shan') this.shanUntil = Math.max(this.shanUntil, this.model.elapsedMs + duration + 300);
    if (id === 'john') {
      if (this.model.elapsedMs >= this.johnUntil) this.johnUntil = this.model.elapsedMs + 4600;
      else this.johnUntil = Math.max(this.johnUntil, this.model.elapsedMs + duration + 300);
      this.johnSpoken = true;
    }
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
    this.scene.events.emit('depot-screen-object', panel);
    this.speech.set(side, { panel, expires: clock + duration, priority, id, copy, duration });
    this.history.push(`${speaker.name}: ${copy.replace(/\n/g, ' ')}`);
    audioSystem.play('npc-talk');
  }

  private speakerSide(id: string): 'left' | 'right' {
    const worker = this.model.workers.find(worker => worker.id === id);
    return (worker?.x ?? this.cast.get(id)?.x ?? 0) < 480 ? 'left' : 'right';
  }
}
