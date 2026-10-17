import * as THREE from 'three';

import {
  CLOCK_OUT_LINES, COUGH_LINES, KYLIE_QUOTES, SHAN_RANTS, WORKER_SWEARS,
} from '../game/slice/DepotReferences';
import type { Parcel, ShiftEvent, ShiftModel } from '../game/slice/ShiftModel';
import { audioSystem } from '../game/systems/AudioSystem';
import { animateCharacter, createCharacter, mergeCharacter, type Character } from './characters';
import { createParcelView, type ParcelView } from './parcels';
import { BELT_HEIGHT, setFromModel, standard, textSprite, toWorld } from './space';
import { SKIN, VISITORS, type DepotWorld } from './world';

/**
 * The crew's routines and gags, on the 2D depot's authored schedule
 * (src/game/slice/DepotLife.ts, DepotRoutines.ts, DepotReceiving.ts).
 * Times are shift milliseconds unless named otherwise.
 */
export type Say = (id: string, copy: string, durationMs: number) => void;
export type Pose = 'none' | 'shout' | 'crouch' | 'massage' | 'dance' | 'swear' | 'cough' | 'cheer' | 'announce' | 'push' | 'phone' | 'keys' | 'aim' | 'carry' | 'press';

const RESIDENT_IDS = ['hussan', 'aj', 'ben', 'bannerman', 'fruitloop', 'doris', 'brian', 'donna'] as const;
const TRUCK_DOORS: Record<string, { x: number; y: number }> = {
  hussan: { x: 324, y: 148 }, aj: { x: 324, y: 244 }, ben: { x: 324, y: 340 }, bannerman: { x: 324, y: 436 },
  fruitloop: { x: 636, y: 148 }, doris: { x: 636, y: 244 }, brian: { x: 636, y: 340 }, donna: { x: 636, y: 436 },
};
const MASSAGE_TABLE = { x: 100, y: 300 };
export const mix = (a: number, b: number, t: number): number => a + (b - a) * THREE.MathUtils.clamp(t, 0, 1);

/** A character placed in model space, facing the way it last moved. */
export class Actor {
  public readonly character: Character;
  public pose: Pose = 'none';
  public poseStart = 0;
  public carrying = false;
  public faceAngle: number | null = null;
  private readonly previous = new THREE.Vector3();
  private moved = false;
  private heading = 0;

  constructor(character: Character) {
    this.character = character;
    this.heading = character.root.rotation.y;
  }

  public get root(): THREE.Group { return this.character.root; }

  public place(x: number, y: number): void {
    this.previous.copy(this.root.position);
    setFromModel(this.root.position, { x, y }, 0);
    const step = this.root.position.clone().sub(this.previous);
    this.moved = step.lengthSq() > 1e-6;
    if (this.moved) this.heading = Math.atan2(step.x, step.z);
  }

  public animate(dt: number, time: number, reducedMotion: boolean): void {
    const c = this.character;
    const target = this.faceAngle ?? this.heading;
    let delta = target - c.root.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    c.root.rotation.y += delta * Math.min(1, dt * 10);
    animateCharacter(c, dt, { moving: this.moved, carrying: this.carrying, time, reducedMotion });
    c.body.rotation.set(0, 0, 0);
    c.head.rotation.set(0, 0, 0);
    applyPose(c, this.pose, time - this.poseStart, reducedMotion);
    this.moved = false;
  }
}

function applyPose(c: Character, pose: Pose, t: number, still: boolean): void {
  const wave = (speed: number, amount: number): number => still ? 0 : Math.sin(t * speed) * amount;
  switch (pose) {
    case 'shout':
      c.leftArm.rotation.set(-2.9 + wave(14, 0.15), 0, 0.35);
      c.rightArm.rotation.set(-2.9 - wave(14, 0.15), 0, -0.35);
      c.head.rotation.x = -0.25;
      break;
    case 'crouch':
      c.body.position.y = -0.32;
      c.leftLeg.rotation.x = c.rightLeg.rotation.x = -1.0;
      c.body.rotation.x = 0.35;
      c.leftArm.rotation.set(-1.0, 0, 0.1);
      c.rightArm.rotation.set(-1.4 + wave(10, 0.3), 0, -0.1);
      break;
    case 'massage':
      c.body.rotation.x = 0.32;
      c.leftArm.rotation.set(-1.25 + wave(9, 0.28), 0, 0.12);
      c.rightArm.rotation.set(-1.25 - wave(9, 0.28), 0, -0.12);
      break;
    case 'dance':
      c.body.rotation.z = wave(11, 0.16);
      c.body.position.y = Math.abs(wave(14, 0.12));
      c.leftArm.rotation.set(-2.6 + wave(13, 0.5), 0, 0.3);
      c.rightArm.rotation.set(-2.6 - wave(13, 0.5), 0, -0.3);
      break;
    case 'cheer':
      c.body.position.y = Math.abs(wave(9, 0.1));
      c.body.rotation.z = wave(7, 0.08);
      c.leftArm.rotation.set(-2.8 + wave(9, 0.35), 0, 0.25);
      c.rightArm.rotation.set(-2.8 - wave(9, 0.35), 0, -0.25);
      break;
    case 'swear':
      c.leftArm.rotation.set(-0.4, 0, 0.9 + wave(16, 0.25));
      c.rightArm.rotation.set(-0.4, 0, -0.9 - wave(16, 0.25));
      c.head.rotation.y = wave(12, 0.35);
      c.body.rotation.x = -0.12;
      break;
    case 'cough':
      c.body.rotation.x = 0.38 + Math.abs(wave(15, 0.12));
      c.rightArm.rotation.set(-2.2, 0, -0.35);
      c.leftArm.rotation.set(-0.5, 0, 0.1);
      break;
    case 'announce':
      c.rightArm.rotation.set(-2.2 + wave(5, 0.25), 0, -0.2);
      c.leftArm.rotation.set(-1.1, 0, 0.3);
      break;
    case 'push':
      c.body.rotation.x = 0.18;
      c.leftArm.rotation.set(-1.45, 0, 0.05);
      c.rightArm.rotation.set(-1.45, 0, -0.05);
      break;
    case 'phone':
      c.rightArm.rotation.set(-2.4, 0, -0.25);
      c.leftArm.rotation.set(-0.9 + wave(2.4, 0.35), 0, 0.4 + wave(1.7, 0.2));
      break;
    case 'aim':
      c.rightArm.rotation.set(-1.55, 0, -0.05);
      c.leftArm.rotation.set(-1.4, 0, 0.35);
      break;
    case 'press':
      c.rightArm.rotation.set(-1.2 + wave(6, 0.15), 0, -0.2);
      break;
    case 'carry':
      c.leftArm.rotation.set(-1.25, 0, -0.18);
      c.rightArm.rotation.set(-1.25, 0, 0.18);
      break;
    case 'keys':
      c.rightArm.rotation.set(-1.5 + wave(8, 0.08), 0, -0.1);
      break;
    case 'none':
      break;
  }
}

export class CrewLife {
  public readonly actors = new Map<string, Actor>();
  /** Inspection state for the browser checks. */
  public snakeState: 'waiting' | 'belt' | 'collecting' | 'dancing' | 'done' = 'waiting';
  public massageStage: 'waiting' | 'arriving' | 'lying' | 'leaving' | 'done' = 'waiting';
  public celebrationMs = -1;
  public readonly ensemble = new Set<string>();
  /** Actors whose placement a set piece currently controls. */
  public readonly staged = new Set<string>();
  /** Ben never returns after the demon takes him. */
  public benGone = false;
  private readonly world: DepotWorld;
  private readonly say: Say;
  private readonly reducedMotion: boolean;
  private readonly cell: ParcelView;
  private readonly cellCaption: THREE.Sprite;
  private readonly crewFreight = new Map<string, ParcelView>();
  private readonly crewEpoch = new Map<string, number>();
  private readonly drivers: Actor[] = [];
  private readonly unloaders: Actor[] = [];
  private readonly unloaderCrates: THREE.Mesh[] = [];
  private readonly dockhand: Actor;
  private readonly flies: THREE.Mesh[] = [];
  private readonly towel: THREE.Mesh;
  private cues = new Set<string>();
  private johnUntil = -1;
  private johnSpoken = true;
  private shanUntil = -1;
  private shanMode: 'rant' | 'announce' = 'rant';
  private rantIndex = 0;
  private cellTravel = 0;
  private cellTime = 0;
  private exhaustTimer = 0;
  private stinkTimer = 0;

  constructor(world: DepotWorld, say: Say) {
    this.world = world;
    this.say = say;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const [id, resident] of world.residents) this.actors.set(id, new Actor(resident.character));
    for (const id of ['kylie', 'shan', 'john', 'vic'] as const) {
      const character = createCharacter(VISITORS[id]);
      character.root.visible = false;
      world.scene.add(character.root);
      this.actors.set(id, new Actor(character));
    }
    // Kylie carries an (empty) coffee cup on her search.
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.16, 12), standard(0xc23a2e, 0.6));
    cup.position.set(0, -0.62, 0.06);
    this.actor('kylie').character.rightArm.add(cup);

    this.towel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.7), standard(0xf2efe6, 0.95));
    this.towel.visible = false;
    world.scene.add(this.towel);

    const fake = (kind: Parcel['kind'], route: Parcel['route']): Parcel => ({
      id: -1, route, kind, label: kind === 'snakes' ? 'THE SNAKES CELL' : '', size: 'normal', x: 0, y: 0, state: 'belt',
      workerId: null, beltOffset: 0, recovered: false, missCounted: false, broken: false, breakY: null,
    });
    this.cell = createParcelView(fake('snakes', 'A'));
    this.cell.root.visible = false;
    this.cellCaption = textSprite(['CELL'], 0.26, { width: 80, height: 30, background: '#f1e5c4', border: '#9e8452', color: '#1d3a22', radius: 5 });
    this.cellCaption.center.set(0.5, 0);
    this.cellCaption.position.y = this.cell.tag.position.y;
    this.cellCaption.visible = false;
    this.cell.root.add(this.cellCaption);
    world.scene.add(this.cell.root);

    RESIDENT_IDS.forEach((id) => {
      const view = createParcelView(fake('smallbox', id === 'hussan' ? 'A' : 'B'));
      view.tag.visible = false;
      view.root.scale.setScalar(0.85);
      view.root.visible = false;
      world.scene.add(view.root);
      this.crewFreight.set(id, view);
    });

    for (let i = 0; i < world.trucks.length; i += 1) {
      const driver = createCharacter({ name: 'DRIVER', skin: SKIN.tan, shirt: 0x34506a, pants: 0x262a30, hair: 0x2a1d14, hairStyle: 'short', headwear: 'beanie' });
      driver.nameTag.visible = false;
      const keys = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12), standard(0xe8c25a, 0.25, 0.9));
      keys.position.set(0, -0.66, 0.08);
      driver.rightArm.add(keys);
      driver.root.visible = false;
      world.scene.add(driver.root);
      this.drivers.push(new Actor(driver));
    }

    [0x3b6e8f, 0x8f5b3b].forEach((shirt) => {
      const worker = createCharacter({ name: 'UNLOADER', skin: SKIN.tan, shirt, pants: 0x2c3138, hair: 0x2a1d14, hairStyle: 'short', headwear: 'beanie', vest: 0xe8d23a });
      worker.nameTag.visible = false;
      world.scene.add(worker.root);
      this.unloaders.push(new Actor(worker));
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.5), standard(0xc39f6b, 0.9));
      crate.castShadow = true;
      world.scene.add(crate);
      this.unloaderCrates.push(crate);
    });

    // The smelly receiving dockhand who feeds each real parcel onto the belt.
    const dockhand = createCharacter({ name: 'DOCKHAND', skin: 0xb79873, shirt: 0x7d7960, pants: 0x38474a, hair: 0x3b3326, hairStyle: 'mullet', beard: true });
    dockhand.nameTag.visible = false;
    for (const [x, y, w, h] of [[-0.1, 1.0, 0.14, 0.14], [0.12, 1.18, 0.1, 0.12], [0.06, 0.86, 0.12, 0.08]] as const) {
      const patch = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), standard(0x4a5749, 0.95));
      patch.position.set(x, y, 0.14);
      dockhand.body.add(patch);
    }
    world.scene.add(dockhand.root);
    for (const character of [dockhand, ...this.unloaders.map((actor) => actor.character), ...this.drivers.map((actor) => actor.character),
      ...(['kylie', 'shan', 'john', 'vic'] as const).map((id) => this.actor(id).character)]) mergeCharacter(character);
    this.dockhand = new Actor(dockhand);
    this.dockhand.pose = 'push';
    for (let i = 0; i < 5; i += 1) {
      const fly = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), standard(0x1b1f1a, 0.6));
      world.scene.add(fly);
      this.flies.push(fly);
    }
    this.reset();
  }

  public actor(id: string): Actor {
    return this.actors.get(id)!;
  }

  public characterFor(id: string): Character | undefined {
    return this.actors.get(id)?.character;
  }

  public reset(): void {
    this.cues = new Set();
    this.johnUntil = -1;
    this.johnSpoken = true;
    this.shanUntil = -1;
    this.rantIndex = 0;
    this.snakeState = 'waiting';
    this.massageStage = 'waiting';
    this.celebrationMs = -1;
    this.ensemble.clear();
    this.staged.clear();
    this.benGone = false;
    this.actor('ben').root.visible = true;
    this.actor('ben').character.nameTag.visible = true;
    this.actor('ben').root.rotation.set(0, 0, 0);
    this.actor('ben').root.scale.setScalar(1);
    this.crewEpoch.clear();
    this.cell.root.visible = false;
    this.cellCaption.visible = false;
    this.cell.tag.visible = true;
    if (this.cell.parts.label) this.cell.parts.label.visible = true;
    for (const [id, resident] of this.world.residents) {
      const actor = this.actor(id);
      actor.root.position.copy(resident.home);
      actor.root.rotation.y = resident.home.x < 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5;
      actor.faceAngle = null;
      actor.pose = id === 'hussan' ? 'phone' : 'none';
      actor.carrying = false;
    }
    for (const id of ['kylie', 'shan', 'john', 'vic']) this.actor(id).root.visible = false;
    for (const driver of this.drivers) driver.root.visible = false;
    for (const view of this.crewFreight.values()) view.root.visible = false;
    this.towel.visible = false;
    this.world.departTrucks(0);
  }

  public onEvent(event: ShiftEvent, model: ShiftModel): void {
    const parcel = model.packages.find((item) => item.id === event.packageId);
    if (event.type === 'brake') {
      this.rant(model.elapsedMs);
    } else if (event.type === 'miss') {
      this.john(model.elapsedMs);
    } else if (event.type === 'grab' && parcel?.kind === 'lobsters') {
      this.say('fruitloop', 'LIVE LOBSTERS?!', 3300);
    } else if (event.type === 'brian') {
      this.say('brian', 'SENDING 5 DOWN', 4200);
    }
  }

  /** Shan's next rant from the original pool, in order. */
  public rant(time: number): void {
    this.shanMode = 'rant';
    this.shanUntil = time + 4200;
    this.say('shan', SHAN_RANTS[this.rantIndex % SHAN_RANTS.length], 3900);
    this.rantIndex += 1;
  }

  private john(time: number): void {
    // A visit already in progress is not restarted by a second miss.
    if (time < this.johnUntil) return;
    this.johnUntil = time + 4600;
    this.johnSpoken = false;
  }

  private once(key: string, time: number, at: number, action: () => void): void {
    if (time < at || this.cues.has(key)) return;
    this.cues.add(key);
    action();
  }

  /** Runs only while the shift clock runs. */
  public update(dt: number, model: ShiftModel, wallTime: number): void {
    const t = model.elapsedMs;
    const reserved = new Set<string>();

    // Kylie's coffee search crosses the east side.
    KYLIE_QUOTES.forEach((quote, index) => this.once(`coffee-${index}`, t, 2800 + index * 3700, () => this.say('kylie', quote, 3500)));
    const kylie = this.actor('kylie');
    kylie.root.visible = t > 1800 && t < 15500;
    kylie.place(
      t < 4500 ? mix(986, 863, (t - 1800) / 2700) : t < 12300 ? 863 + Math.sin(t / 900) * 20 : mix(863, 985, (t - 12300) / 3200),
      t < 12300 ? 400 + Math.cos(t / 1300) * 26 : mix(400, 361, (t - 12300) / 850),
    );
    kylie.character.rightArm.rotation.x = -0.9;

    // John Rushton: walk in, yell with arms raised, crouch, leave.
    this.once('john', t, 13000, () => this.john(t));
    const john = this.actor('john');
    john.root.visible = t < this.johnUntil;
    if (john.root.visible) {
      const e = 4600 - (this.johnUntil - t);
      john.place(e < 600 ? mix(10, 77, e / 600) : e < 3950 ? 77 : mix(77, 10, (e - 3950) / 650), 397);
      john.faceAngle = e >= 600 && e < 3950 ? Math.PI / 2 : null;
      const pose: Pose = e < 600 || e >= 3950 ? 'none' : e < 2100 ? 'shout' : 'crouch';
      if (pose !== john.pose) { john.pose = pose; john.poseStart = wallTime; }
      if (e >= 600 && !this.johnSpoken) {
        this.johnSpoken = true;
        this.say('john', "DON'T STACK\nBOXES ON BOXES!", 3600);
      }
    }

    this.updateMassage(t, wallTime, reserved);
    this.updateCell(t, wallTime, model, reserved);
    this.updateUnitedWay(t, wallTime);
    this.updateExhaust(t, dt, wallTime, model);
    this.updateCrewFreight(t, reserved);

    // Shan only appears for his rant or the United Way announcement.
    const shan = this.actor('shan');
    const shanVisible = t < this.shanUntil;
    if (!this.staged.has('shan')) shan.root.visible = shanVisible;
    if (shanVisible || this.staged.has('shan')) {
      if (!this.staged.has('shan')) {
        shan.place(VISITORS.shan.x, VISITORS.shan.y);
        shan.faceAngle = -Math.PI / 2;
      }
      const ranting = this.shanMode === 'rant';
      shan.pose = ranting ? 'shout' : 'announce';
      const anger = ranting ? 1 - (this.shanUntil - t) / 4200 : 0;
      shan.character.skinMaterial.color.setHex(0xe8b98f).lerp(new THREE.Color(0xd8453a), Math.min(1, anger * 1.4));
      if (!shanVisible) shan.pose = 'none';
    }
    this.animate(dt, wallTime);
  }

  /** Receiving runs from physical belt travel, so brakes and stops freeze it. */
  public updateReceiving(model: ShiftModel, dt: number, wallTime: number): void {
    const travel = model.beltTravel;
    this.unloaders.forEach((worker, index) => {
      const side = index === 0 ? -1 : 1;
      const trailerX = 480 + side * 108;
      const cycle = (travel / 185 + index * 0.5) % 1;
      const carrying = cycle < 0.58;
      const p = carrying ? cycle / 0.58 : 1 - (cycle - 0.58) / 0.42;
      worker.place(mix(trailerX, trailerX + side * 34, p), mix(-205, -122, p));
      worker.carrying = carrying;
      const crate = this.unloaderCrates[index];
      if (carrying) {
        const forward = new THREE.Vector3(Math.sin(worker.root.rotation.y), 0, Math.cos(worker.root.rotation.y));
        crate.position.copy(worker.root.position).addScaledVector(forward, 0.42).setY(0.98);
        crate.rotation.y = worker.root.rotation.y;
      } else {
        // The released crate rolls down the feeder toward the dockhand.
        const transfer = Math.min(1, (cycle - 0.58) / 0.27);
        const start = { x: trailerX + (480 - trailerX) * 0.12, y: -150 + 262 * 0.12 };
        const end = { x: trailerX + (480 - trailerX) * 0.86, y: -150 + 262 * 0.86 };
        crate.position.copy(toWorld({ x: mix(start.x, end.x, transfer), y: mix(start.y, end.y, transfer) }, BELT_HEIGHT + 0.3));
      }
      crate.visible = cycle < 0.85;
      worker.animate(dt, wallTime, this.reducedMotion);
    });
    const preview = model.intakePreview;
    const dockhand = this.dockhand;
    dockhand.place(430, (preview?.y ?? 127) + 12);
    dockhand.faceAngle = Math.PI / 2;
    dockhand.animate(dt, wallTime, this.reducedMotion);
    // Flies circle his head; a green haze follows him.
    const head = dockhand.root.position.clone().setY(2.0);
    this.flies.forEach((fly, index) => {
      const a = wallTime * (3 + index * 0.7) + index * 1.3;
      fly.position.set(head.x + Math.cos(a) * 0.45, head.y + Math.sin(a * 1.7) * 0.25 + index * 0.06, head.z + Math.sin(a) * 0.45);
    });
    this.stinkTimer -= dt;
    if (this.stinkTimer <= 0 && dt > 0) {
      this.stinkTimer = 0.2;
      this.world.puffs.emit(head.clone().setY(0.9 + Math.random() * 0.8), {
        color: 0x94a865, size: 0.3, life: 2.2, velocity: new THREE.Vector3(0, 0.35, 0), opacity: 0.28, grow: 3, spread: 0.6,
      });
    }
  }

  private updateMassage(t: number, wallTime: number, reserved: Set<string>): void {
    // Vic walks to AJ's table, lies down under a towel, then leaves.
    this.once('massage', t, 23500, () => this.say('vic', 'I NEED A\nQUICK TUNE UP', 4800));
    const vic = this.actor('vic');
    const aj = this.actor('aj');
    const active = t >= 21000 && t < 33500;
    const lying = t > 24700 && t < 30800;
    if (!this.staged.has('vic')) vic.root.visible = active;
    this.towel.visible = active && lying;
    vic.character.nameTag.visible = !lying;
    this.massageStage = t < 21000 ? 'waiting' : t < 24700 ? 'arriving' : t < 30800 ? 'lying' : t < 33500 ? 'leaving' : 'done';
    if (!active) {
      if (!this.staged.has('vic')) vic.root.rotation.x = 0;
      return;
    }
    reserved.add('aj');
    const table = toWorld(MASSAGE_TABLE);
    if (lying) {
      // Lie face up along the table, head toward the wall end.
      const settle = Math.min(1, (t - 24700) / 450);
      vic.root.position.set(table.x, 0.92 * settle, table.z + 0.92);
      vic.root.rotation.set(-Math.PI / 2 * settle, 0, 0);
      vic.faceAngle = 0;
      vic.pose = 'none';
      this.towel.position.set(table.x, 1.12, table.z + 0.05);
      aj.place(MASSAGE_TABLE.x + 22, MASSAGE_TABLE.y + 4);
      aj.faceAngle = -Math.PI / 2;
      if (aj.pose !== 'massage') { aj.pose = 'massage'; aj.poseStart = wallTime; }
      return;
    }
    vic.root.rotation.x = 0;
    vic.faceAngle = null;
    vic.place(t < 23700 ? mix(10, MASSAGE_TABLE.x - 22, (t - 21000) / 2700)
      : t < 30800 ? MASSAGE_TABLE.x - 22 : mix(MASSAGE_TABLE.x - 22, 10, (t - 30800) / 2700), MASSAGE_TABLE.y + 30);
    aj.place(t < 30800 ? mix(150, MASSAGE_TABLE.x + 22, (t - 21000) / 1200) : mix(MASSAGE_TABLE.x + 22, 150, (t - 30800) / 1200),
      t < 30800 ? mix(294, MASSAGE_TABLE.y + 4, (t - 21000) / 1200) : mix(MASSAGE_TABLE.y + 4, 294, (t - 30800) / 1200));
    aj.faceAngle = null;
    aj.pose = 'none';
  }

  private updateCell(t: number, wallTime: number, model: ShiftModel, reserved: Set<string>): void {
    const hussan = this.actor('hussan');
    const home = { x: 150, y: 198 };
    const intakeClear = !model.packages.some((parcel) => parcel.state === 'belt' && Math.abs(parcel.y - 164) < 70);
    if (t >= 40000 && this.snakeState === 'waiting' && intakeClear) {
      this.snakeState = 'belt';
      this.cellTravel = model.beltTravel;
      this.cell.root.visible = true;
      this.say('hussan', 'THE SNAKES CELL!', 3200);
    }
    if (this.snakeState !== 'waiting' && (this.snakeState !== 'done' || t < this.cellTime + 1600)) reserved.add('hussan');
    if (this.snakeState === 'belt') {
      // The separate THE SNAKES CELL case rides the shared belt travel.
      const y = 164 + model.beltTravel - this.cellTravel;
      setFromModel(this.cell.root.position, { x: 480, y }, BELT_HEIGHT + 0.01);
      const approach = THREE.MathUtils.clamp((y - 164) / 44, 0, 1);
      hussan.place(approach < 0.75 ? mix(home.x, 350, approach / 0.75) : mix(350, 392, (approach - 0.75) / 0.25),
        approach < 0.75 ? home.y : mix(home.y, 186, (approach - 0.75) / 0.25));
      hussan.pose = 'none';
      if (y >= 208) { this.snakeState = 'collecting'; this.cellTime = t; }
    }
    if (this.snakeState === 'collecting') {
      const progress = Math.min(1, (t - this.cellTime) / 350);
      // On collection the belt label gives way to Hussan's held CELL label.
      this.cell.tag.visible = false;
      if (this.cell.parts.label) this.cell.parts.label.visible = false;
      this.cellCaption.visible = true;
      const hands = hussan.root.position.clone().add(new THREE.Vector3(0.45, 1.0, 0));
      this.cell.root.position.lerpVectors(toWorld({ x: 480, y: 208 }, BELT_HEIGHT), hands, progress);
      this.cell.root.scale.setScalar(mix(1, 0.8, progress));
      hussan.faceAngle = Math.PI / 2;
      hussan.carrying = true;
      if (progress >= 1) { this.snakeState = 'dancing'; this.cellTime = t; hussan.poseStart = wallTime; }
    }
    if (this.snakeState === 'dancing') {
      const elapsed = t - this.cellTime;
      hussan.carrying = false;
      hussan.pose = 'dance';
      hussan.faceAngle = Math.PI / 2 + (this.reducedMotion ? 0 : Math.sin(elapsed / 220) * 0.6);
      // The CELL is held overhead through the dance.
      const c = hussan.character;
      this.cell.root.position.copy(hussan.root.position).add(new THREE.Vector3(0, 2.05 + c.body.position.y, 0));
      this.cell.root.rotation.y = c.root.rotation.y;
      if (elapsed >= 3200) {
        this.snakeState = 'done';
        this.cellTime = t;
        this.cell.root.visible = false;
        hussan.pose = 'none';
        hussan.faceAngle = null;
      }
    }
    if (this.snakeState === 'done' && t < this.cellTime + 1600) {
      const r = (t - this.cellTime) / 1600;
      hussan.place(r < 0.25 ? mix(392, 350, r / 0.25) : mix(350, home.x, (r - 0.25) / 0.75), r < 0.25 ? mix(186, home.y, r / 0.25) : home.y);
    } else if (this.snakeState === 'done' && hussan.pose === 'none') {
      hussan.pose = 'phone';
    }
  }

  private updateUnitedWay(t: number, wallTime: number): void {
    this.once('paid-day', t, 134000, () => {
      this.shanMode = 'announce';
      this.shanUntil = t + 7200;
      this.say('shan', 'TERMITE AND SKANKY HAVE BOTH WON A FREE PAID DAY OFF FROM UNITED WAY', 4100);
    });
    // The whole floor reacts, 1.4 s in, with 110 ms offsets.
    RESIDENT_IDS.forEach((id, index) => {
      if (id === 'ben' && this.benGone) return;
      const start = 135400 + index * 110;
      const actor = this.actor(id);
      if (t >= start && t < start + 3300 && !this.ensemble.has(id)) {
        this.ensemble.add(id);
        actor.pose = 'swear';
        actor.poseStart = wallTime;
      } else if (t >= start + 3300 && actor.pose === 'swear') {
        actor.pose = id === 'hussan' ? 'phone' : 'none';
      }
    });
    (['hussan', 'fruitloop', 'aj', 'doris', 'bannerman', 'donna'] as const).forEach((id, index) => {
      this.once(`paid-day-response-${index}`, t, 138600 + Math.floor(index / 2) * 3500, () => this.say(id, WORKER_SWEARS[index], 3300));
    });
    this.once('paid-day-response-brian', t, 149100, () => this.say('brian', WORKER_SWEARS[0], 3300));
  }

  private updateExhaust(t: number, dt: number, wallTime: number, model: ShiftModel): void {
    // Drivers bring keys to every truck; engines then idle for the rest of the shift.
    this.once('drivers', t, 114000, () => audioSystem.play('truck'));
    const driversVisible = t >= 114000 && t < 119200;
    this.drivers.forEach((driver, index) => {
      const door = this.world.trucks[index].cabDoor;
      driver.root.visible = driversVisible;
      if (!driversVisible) return;
      // Drivers walk up to their cab fronts with the keys.
      const outward = door.x < 480 ? -1 : 1;
      driver.place(door.x + outward * mix(34, 0, (t - 114000 - index * 70) / 2200), door.y);
      driver.faceAngle = t - 114000 > 2200 + index * 70 ? (outward < 0 ? Math.PI / 2 : -Math.PI / 2) : null;
      driver.pose = 'keys';
      driver.animate(dt, wallTime, this.reducedMotion);
    });
    COUGH_LINES.forEach((line, index) => {
      const id = index % 2 === 0 ? 'hussan' : 'doris';
      this.once(`cough-${index}`, t, 116000 + index * 3000, () => {
        this.say(id, line, 2800);
        const actor = this.actor(id);
        actor.pose = 'cough';
        actor.poseStart = wallTime;
      });
      if (t >= 116000 + index * 3000 + 2800 && t < 116000 + index * 3000 + 2900 && this.actor(id).pose === 'cough') {
        this.actor(id).pose = id === 'hussan' ? 'phone' : 'none';
      }
    });
    if (t >= 114000 && t < model.durationMs) this.emitExhaust(dt);
  }

  public emitExhaust(dt: number): void {
    this.exhaustTimer -= dt;
    if (this.exhaustTimer > 0 || dt <= 0) return;
    this.exhaustTimer = 0.32;
    const at = new THREE.Vector3();
    for (const truck of this.world.trucks) {
      truck.stack.getWorldPosition(at);
      this.world.puffs.emit(at, {
        color: 0x8a948f, size: 0.28, life: 3.2, opacity: 0.38, grow: 5, spread: 0.08,
        velocity: new THREE.Vector3(truck.direction * 0.35, 0.7, 0),
      });
    }
  }

  private updateCrewFreight(t: number, reserved: Set<string>): void {
    RESIDENT_IDS.forEach((id, index) => {
      const actor = this.actor(id);
      const view = this.crewFreight.get(id)!;
      if (reserved.has(id) || this.staged.has(id) || (id === 'ben' && this.benGone)) {
        view.root.visible = false;
        this.crewEpoch.set(id, t + 1000);
        return;
      }
      const home = this.world.residents.get(id)!;
      const start = { x: home.home.x / (1 / 32) + 480, y: home.home.z / (1 / 32) + 340 };
      const period = 18_000;
      const clock = Math.max(0, t - (this.crewEpoch.get(id) ?? (7500 + index * 1100)));
      const cycle = clock % period;
      const door = TRUCK_DOORS[id];
      const pickup = { x: start.x < 480 ? 400 : 560, y: start.y };
      const corner = { x: door.x, y: start.y };
      let from = start; let to = start; let amount = 0;
      if (clock > 0 && cycle < 2200) { to = pickup; amount = cycle / 2200; }
      else if (clock > 0 && cycle < 2600) { from = pickup; to = pickup; }
      else if (clock > 0 && cycle < 4800) { from = pickup; to = door; amount = (cycle - 2600) / 2200; }
      else if (clock > 0 && cycle < 5300) { from = door; to = door; }
      else if (clock > 0 && cycle < 6000) { from = door; to = corner; amount = (cycle - 5300) / 700; }
      else if (clock > 0 && cycle < 7500) { from = corner; to = start; amount = (cycle - 6000) / 1500; }
      actor.place(mix(from.x, to.x, amount), mix(from.y, to.y, amount));
      const atRest = from === start && to === start;
      actor.faceAngle = atRest ? (start.x < 480 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5) : null;
      const carrying = clock > 0 && cycle >= 2600 && cycle < 4900;
      actor.carrying = carrying;
      if (id === 'hussan' && actor.pose !== 'cough' && actor.pose !== 'swear') actor.pose = atRest ? 'phone' : 'none';
      view.root.visible = carrying;
      if (carrying) {
        const forward = new THREE.Vector3(Math.sin(actor.root.rotation.y), 0, Math.cos(actor.root.rotation.y));
        view.root.position.copy(actor.root.position).addScaledVector(forward, 0.4).setY(0.82);
        view.root.rotation.y = actor.root.rotation.y;
      }
    });
  }

  /** Staged actors are animated by their set piece, after it poses them. */
  private animate(dt: number, wallTime: number): void {
    this.animateActors(dt, wallTime, undefined, this.staged);
  }

  /** Hides a resident's in-hand freight when a story takes them over. */
  public hideCrewFreight(id: string): void {
    const view = this.crewFreight.get(id);
    if (view) view.root.visible = false;
    this.actor(id).carrying = false;
  }

  /** Animates visible actors (all, or only `ids` while a story holds the shift). */
  public animateActors(dt: number, wallTime: number, ids?: ReadonlySet<string>, exclude?: ReadonlySet<string>): void {
    for (const [id, actor] of this.actors) {
      if (actor.root.visible && (!ids || ids.has(id)) && !exclude?.has(id)) actor.animate(dt, wallTime, this.reducedMotion);
    }
  }

  /** Adds a set-piece character to the cast so it can speak and animate. */
  public addActor(id: string, character: Character): Actor {
    mergeCharacter(character);
    character.root.visible = false;
    this.world.scene.add(character.root);
    const actor = new Actor(character);
    this.actors.set(id, actor);
    return actor;
  }

  /** Winning clock-out: lines, a crew dance and every truck driving out. */
  public beginCelebration(wallTime: number): void {
    this.celebrationMs = 0;
    for (const view of this.crewFreight.values()) view.root.visible = false;
    this.cell.root.visible = false;
    for (const id of ['john', 'vic', 'kylie', 'shan']) this.actor(id).root.visible = false;
    for (const driver of this.drivers) driver.root.visible = false;
    this.towel.visible = false;
    for (const id of RESIDENT_IDS) {
      const actor = this.actor(id);
      if (id === 'ben' && this.benGone) continue;
      actor.carrying = false;
      actor.pose = 'cheer';
      actor.poseStart = wallTime + Math.random();
    }
    this.say('termite', 'SHIFT DONE!', 2500);
    this.say('skanky', 'CLOCKED OUT!', 2500);
  }

  public updateCelebration(dt: number, wallTime: number): boolean {
    this.celebrationMs += Math.min(dt * 1000, 100);
    const residents = ['hussan', 'fruitloop', 'aj', 'doris', 'bannerman', 'donna', 'hussan', 'brian'];
    CLOCK_OUT_LINES.forEach((line, index) => {
      this.once(`clock-out-${index}`, this.celebrationMs, 2700 + Math.floor(index / 2) * 2500, () => this.say(residents[index], line, 2350));
    });
    this.world.departTrucks(THREE.MathUtils.clamp((this.celebrationMs - 1600) / 5500, 0, 1));
    this.emitExhaust(dt);
    this.animate(dt, wallTime);
    return this.celebrationMs >= 13000;
  }
}
