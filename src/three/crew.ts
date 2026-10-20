import * as THREE from 'three';

import {
  CLOCK_OUT_LINES, COUGH_LINES, KYLIE_QUOTES, SHAN_RANTS, WORKER_SWEARS,
} from '../game/slice/DepotReferences';
import { DRIVERS, SHAN_BREAKAGE_LINES } from '../game/slice/StoryScript';
import type { Parcel, ShiftEvent, ShiftModel } from '../game/slice/ShiftModel';
import { audioSystem } from './audio';
import { animateCharacter, bendElbows, bendKnees, createCharacter, mergeCharacter, type Character } from './characters';
import { alignParcelToSurface, createParcelView, type ParcelView } from './parcels';
import { CrewFreightTrip } from './crewFreight';
import { BELT_HEIGHT, actorSurfaceAt, setFromModel, standard, textSprite, toWorld } from './space';
import { SKIN, VISITORS, type DepotWorld } from './world';
import { placeProp } from './propModels';
import { DEPOT_3D_LAYOUT as DEPOT } from './layout';
import { platformWalkPath, walkPath, type WalkPoint } from './walking';
import { RECEIVING_CROSSING_Y, RECEIVING_FEEDERS } from './receivingCollision';
import { CrewPatrols, type PatrolId } from './crewPatrols';

/**
 * The crew's routines and gags, on the night shift's authored schedule.
 * Times are shift milliseconds unless named otherwise.
 */
export type Say = (id: string, copy: string, durationMs: number) => void;
export type Pose = 'none' | 'shout' | 'crouch' | 'squat' | 'massage' | 'dance' | 'swear' | 'cough' | 'cheer' | 'announce' | 'push' | 'phone' | 'keys' | 'aim' | 'carry' | 'press' | 'handup' | 'sit' | 'shrug' | 'wii' | 'sip';

const RESIDENT_IDS = ['hussan', 'aj', 'ben', 'bannerman', 'fruitloop', 'doris', 'brian', 'donna'] as const;
const TRUCK_DOORS: Record<string, { x: number; y: number }> = {
  hussan: { x: 324, y: DEPOT.crewTruckRows[0] }, aj: { x: 324, y: DEPOT.crewTruckRows[1] }, ben: { x: 324, y: DEPOT.crewTruckRows[2] }, bannerman: { x: 324, y: DEPOT.crewTruckRows[3] },
  fruitloop: { x: 636, y: DEPOT.crewTruckRows[0] }, doris: { x: 636, y: DEPOT.crewTruckRows[1] }, brian: { x: 636, y: DEPOT.crewTruckRows[2] }, donna: { x: 636, y: DEPOT.crewTruckRows[3] },
};
const MASSAGE_TABLE = DEPOT.eventProps.massage;
export const ENGINES_3D = { driversAt: 117_000, firstAt: 120_000, othersAt: 122_000, staggerMs: 300 } as const;
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

  /** Changes pose, restarting its animation only when it actually changes. */
  public setPoseAt(pose: Pose, time: number): void {
    if (this.pose !== pose) { this.pose = pose; this.poseStart = time; }
  }

  public place(x: number, y: number): void {
    this.previous.copy(this.root.position);
    // Platform, stairs and aisle steps set the height; the crew walk, never float.
    setFromModel(this.root.position, { x, y }, actorSurfaceAt(x, y));
    const step = this.root.position.clone().sub(this.previous).setY(0);
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
    // A posed figure owns its torso; a plain walk keeps the walk cycle's lean and sway.
    if (this.pose !== 'none') c.body.rotation.set(0, 0, 0);
    c.head.rotation.set(0, 0, 0);
    applyPose(c, this.pose, time - this.poseStart, reducedMotion);
    this.moved = false;
  }
}

export function applyPose(c: Character, pose: Pose, t: number, still: boolean): void {
  const wave = (speed: number, amount: number): number => still ? 0 : Math.sin(t * speed) * amount;
  switch (pose) {
    case 'squat': {
      const bend = still ? 0.65 : (1 - Math.cos(Math.max(0, t) * Math.PI * 2 / 1.2)) / 2;
      c.body.position.y = -0.38 * bend;
      c.body.rotation.x = 0.2 * bend;
      c.leftLeg.rotation.x = c.rightLeg.rotation.x = -1.25 * bend;
      bendKnees(c, 2 * bend);
      c.leftArm.rotation.set(-0.35 - 0.6 * bend, 0, -0.12);
      c.rightArm.rotation.set(-0.35 - 0.6 * bend, 0, 0.12);
      bendElbows(c, -0.9);
      break;
    }
    case 'shout':
      c.leftArm.rotation.set(-2.9 + wave(6, 0.08), 0, -0.25);
      c.rightArm.rotation.set(-2.9 - wave(6, 0.08), 0, 0.25);
      bendElbows(c, -0.35 + wave(14, 0.2), -0.35 - wave(14, 0.2));
      c.head.rotation.x = -0.25;
      break;
    case 'crouch':
      // Squatting: thighs forward, shins folded back under the hips.
      c.body.position.y = -0.4;
      c.leftLeg.rotation.x = c.rightLeg.rotation.x = -1.3;
      bendKnees(c, 2.0);
      c.body.rotation.x = 0.3;
      c.leftArm.rotation.set(-0.9, 0, 0.1);
      c.rightArm.rotation.set(-1.2 + wave(10, 0.3), 0, -0.1);
      bendElbows(c, -0.5, -0.4);
      break;
    case 'massage':
      c.body.rotation.x = 0.32;
      c.leftArm.rotation.set(-0.95 + wave(9, 0.22), 0, 0.12);
      c.rightArm.rotation.set(-0.95 - wave(9, 0.22), 0, -0.12);
      bendElbows(c, -0.55 - wave(9, 0.25), -0.55 + wave(9, 0.25));
      break;
    case 'dance':
      c.body.rotation.z = wave(11, 0.16);
      c.body.position.y = Math.abs(wave(14, 0.12));
      c.leftArm.rotation.set(-2.6 + wave(8, 0.25), 0, -0.3);
      c.rightArm.rotation.set(-2.6 - wave(8, 0.25), 0, 0.3);
      bendElbows(c, -0.6 + wave(13, 0.4), -0.6 - wave(13, 0.4));
      bendKnees(c, 0.25 + Math.abs(wave(14, 0.25)));
      break;
    case 'cheer':
      c.body.position.y = Math.abs(wave(9, 0.1));
      c.body.rotation.z = wave(7, 0.08);
      c.leftArm.rotation.set(-2.8 + wave(6, 0.2), 0, -0.25);
      c.rightArm.rotation.set(-2.8 - wave(6, 0.2), 0, 0.25);
      bendElbows(c, -0.3);
      break;
    case 'swear':
      // Fists stay apart, with the elbows beside the ribs. Inward shoulder
      // rolls made the old gesture cross the chest and look like clapping.
      c.leftArm.rotation.set(-0.4, 0, -0.18 + wave(4, 0.035));
      c.rightArm.rotation.set(-0.4, 0, 0.18 + wave(4, 0.035));
      bendElbows(c, -1.35 + wave(4, 0.06), -1.35 - wave(4, 0.06));
      c.head.rotation.y = wave(3, 0.1);
      c.body.rotation.x = -0.06;
      break;
    case 'cough':
      // Doubled over with a hand to the mouth.
      c.body.rotation.x = 0.38 + Math.abs(wave(15, 0.12));
      c.rightArm.rotation.set(-1.1, -0.5, -0.6);
      c.leftArm.rotation.set(-0.5, 0, 0.1);
      bendElbows(c, -0.7, -2.1);
      break;
    case 'announce':
      c.rightArm.rotation.set(-1.0 + wave(3, 0.08), 0, 0.2);
      c.leftArm.rotation.set(-0.35, 0, -0.12);
      bendElbows(c, -1.2, -0.35);
      break;
    case 'push':
      c.body.rotation.x = 0.18;
      c.leftArm.rotation.set(-1.15, 0, 0.05);
      c.rightArm.rotation.set(-1.15, 0, -0.05);
      bendElbows(c, -0.55);
      break;
    case 'phone':
      // The phone held to the ear, the other hand gesturing.
      c.rightArm.rotation.set(-1.65, -0.5, 0.3);
      c.leftArm.rotation.set(-0.7 + wave(2.4, 0.3), 0, 0.3 + wave(1.7, 0.15));
      bendElbows(c, -0.9 + wave(2.4, 0.25), -2.3);
      break;
    case 'aim':
      c.rightArm.rotation.set(-1.55, 0, -0.05);
      c.leftArm.rotation.set(-1.3, 0, 0.45);
      bendElbows(c, -0.35, -0.05);
      break;
    case 'press':
      c.rightArm.rotation.set(-1.0 + wave(6, 0.12), 0, -0.2);
      bendElbows(c, -0.12, -0.45);
      break;
    case 'carry':
      c.leftArm.rotation.set(-0.3, 0, -0.12);
      c.rightArm.rotation.set(-0.3, 0, 0.12);
      bendElbows(c, -1.25);
      break;
    case 'keys':
      c.rightArm.rotation.set(-1.0 + wave(8, 0.08), 0, -0.1);
      bendElbows(c, -0.12, -0.6);
      break;
    case 'handup':
      c.rightArm.rotation.set(-3.0 + wave(6, 0.05), 0, -0.15);
      bendElbows(c, -0.12, -0.15);
      break;
    case 'sit':
      c.leftLeg.rotation.x = c.rightLeg.rotation.x = -1.5;
      bendKnees(c, 1.5);
      c.body.position.y = -0.41;
      c.leftArm.rotation.set(-0.5, 0, 0.1);
      c.rightArm.rotation.set(-0.5, 0, -0.1);
      bendElbows(c, -0.9);
      break;
    case 'wii':
      // Seated play: both hands out in front, the remote hand flicking.
      c.leftArm.rotation.set(-0.4, 0, 0.1);
      c.rightArm.rotation.set(-0.45 + wave(5, 0.1), 0, -0.1);
      bendElbows(c, -1.1, -1.2 + wave(7.5, 0.22));
      break;
    case 'sip': {
      // Resting with a beer, lifting it to the mouth every few seconds.
      const lift = still ? 0 : Math.max(0, Math.sin(t * 1.1)) ** 3;
      c.rightArm.rotation.set(-0.5, 0, -0.1);
      c.leftArm.rotation.set(-0.45 - 0.55 * lift, 0, 0.1 + 0.3 * lift);
      bendElbows(c, -1.0 - 1.1 * lift, -0.9);
      c.head.rotation.x = -0.25 * lift;
      break;
    }
    case 'shrug':
      c.leftArm.rotation.set(-0.15, 0, 0.35);
      c.rightArm.rotation.set(-0.15, 0, -0.35);
      // Forearms out to the sides, palms up.
      c.leftForearm.rotation.set(-1.3, 0, -0.5);
      c.rightForearm.rotation.set(-1.3, 0, 0.5);
      c.head.rotation.z = wave(3, 0.08);
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
  private readonly crewTrips = new Map<string, CrewFreightTrip>();
  private readonly workWalks = new Map<string, { points: WalkPoint[]; distance: number; delay: number }>();
  private readonly patrols = new CrewPatrols();
  private readonly drivers: Actor[] = [];
  private readonly unloaders: Actor[] = [];
  private readonly unloaderCrates: THREE.Group[] = [];
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
  private breakageIndex = 0;
  /** Shan's breakage reactions so far, for the checks. */
  public readonly breakageLines: string[] = [];
  private shanVisit: { start: number; line: string; spoken: boolean; from: { x: number; y: number }; to: { x: number; y: number } } | null = null;

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
    // Kylie carries an (empty) coffee cup on his search.
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.16, 12), standard(0xc23a2e, 0.6));
    cup.position.set(0, -0.085, 0.05);
    this.actor('kylie').character.rightHand.add(cup);

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
      view.root.name = 'crew-parcel'; view.root.userData.owner = id;
      world.scene.add(view.root);
      this.crewFreight.set(id, view);
    });

    for (let i = 0; i < world.trucks.length; i += 1) {
      const driver = createCharacter({ name: 'DRIVER', skin: SKIN.tan, shirt: 0x34506a, pants: 0x262a30, hair: 0x2a1d14, hairStyle: 'short', headwear: 'beanie' });
      driver.nameTag.visible = false;
      const keys = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12), standard(0xe8c25a, 0.25, 0.9));
      keys.position.set(0, -0.12, 0.035);
      driver.rightHand.add(keys);
      driver.root.visible = false;
      world.scene.add(driver.root);
      this.drivers.push(new Actor(driver));
    }

    [0x3b6e8f, 0x8f5b3b].forEach((shirt) => {
      const worker = createCharacter({ name: 'UNLOADER', skin: SKIN.tan, shirt, pants: 0x2c3138, hair: 0x2a1d14, hairStyle: 'short', headwear: 'beanie', vest: 0xe8d23a });
      worker.nameTag.visible = false;
      world.scene.add(worker.root);
      this.unloaders.push(new Actor(worker));
      // The carried carton: the photographed box over a code-built stand-in on GPU renderers.
      const crate = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.5), standard(0xc39f6b, 0.9));
      box.castShadow = true;
      box.position.y = 0.24;
      crate.add(box);
      if (world.models) void placeProp(crate, 'cardboard-box', { fallback: box, size: { x: 0.62, y: 0.48, z: 0.5 } });
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

  public get clearanceActors(): [string, Actor][] {
    return [...this.actors, ...this.unloaders.map((actor, index): [string, Actor] => [`unloader-${index}`, actor]), ['dockhand', this.dockhand]];
  }

  public reset(): void {
    this.cues = new Set();
    this.johnUntil = -1;
    this.johnSpoken = true;
    this.shanUntil = -1;
    this.rantIndex = 0;
    this.breakageIndex = 0;
    this.breakageLines.length = 0;
    this.shanVisit = null;
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
    this.crewTrips.clear();
    this.workWalks.clear();
    this.patrols.reset();
    this.world.shoulderDevil?.reset();
    this.cell.root.visible = false;
    this.cellCaption.visible = false;
    this.cell.tag.visible = true;
    if (this.cell.parts.label) this.cell.parts.label.visible = true;
    for (const [id, resident] of this.world.residents) {
      const actor = this.actor(id);
      actor.root.visible = true;
      actor.root.position.copy(resident.home);
      actor.root.rotation.y = resident.home.x < 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5;
      actor.faceAngle = null;
      actor.pose = id === 'hussan' ? 'phone' : 'none';
      actor.carrying = false;
    }
    for (const id of ['kylie', 'shan', 'john', 'vic']) {
      const actor = this.actor(id);
      actor.root.visible = false; actor.pose = 'none'; actor.faceAngle = null; actor.carrying = false;
      actor.root.rotation.x = 0;
    }
    this.actor('john').place(390, 548);
    this.actor('vic').place(376, 220);
    this.actor('shan').place(VISITORS.shan.x, VISITORS.shan.y);
    for (const driver of this.drivers) driver.root.visible = false;
    for (const view of this.crewFreight.values()) view.root.visible = false;
    this.towel.visible = false;
    this.world.departTrucks(0);
    this.world.trucks.forEach((_, index) => this.world.setTruckRunning(index, false));
    this.exhaustTimer = 0;
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

  private workStation(id: string): WalkPoint {
    const bay = DEPOT.eventBays[id as keyof typeof DEPOT.eventBays];
    return { x: bay.x < 480 ? 350 : 610, y: bay.y };
  }

  /** Keep the scrum's actual cast in place, then send everyone to their work. */
  public beginWorkWalk(): void {
    for (const id of [...RESIDENT_IDS, 'shan']) {
      const actor = this.actor(id);
      const from = { x: actor.root.position.x * 32 + 480, y: actor.root.position.z * 32 + 340 };
      const to = id === 'shan' ? { x: 590, y: 860 } : this.workStation(id);
      actor.root.visible = true;
      actor.root.rotation.x = 0;
      actor.pose = 'none'; actor.carrying = false; actor.faceAngle = null;
      const points = platformWalkPath(from, to);
      if (to.x < 480 && to.y > 450) points.splice(1, 0, { x: 350, y: 430 });
      // The east crew file past stationary workers and occupied work stations
      // along a separate corridor, then turn into their own bay.
      if (to.x > 480) {
        if (points.length > 2) points.splice(2, 1, { x: 550, y: RECEIVING_CROSSING_Y }, { x: 550, y: to.y });
        else points.splice(1, 0, { x: 550, y: from.y }, { x: 550, y: to.y });
      }
      const queueIndex = ['brian', 'fruitloop', 'doris', 'donna'].indexOf(id);
      this.workWalks.set(id, { points, distance: 0, delay: Math.max(0, queueIndex) * 0.16 });
      this.crewEpoch.set(id, 0);
    }
  }

  private advanceWorkWalk(dt: number): Set<string> {
    const walking = new Set<string>();
    for (const [id, route] of this.workWalks) {
      const actor = this.actor(id);
      const waiting = Math.min(route.delay, dt);
      route.delay -= waiting;
      route.distance += 135 * (dt - waiting);
      const point = walkPath(route.points, route.distance);
      actor.place(point.x, point.y); actor.faceAngle = point.heading;
      actor.root.visible = true;
      walking.add(id);
      if (point.done) this.workWalks.delete(id);
    }
    return walking;
  }

  /** The crew can walk during the countdown while the freight clock waits. */
  public disperse(dt: number, time: number): void {
    this.animateActors(dt, time, this.advanceWorkWalk(dt));
  }

  /** Runs only while the shift clock runs. */
  public update(dt: number, model: ShiftModel, wallTime: number): void {
    const t = model.elapsedMs;
    const reserved = this.advanceWorkWalk(dt);

    // Kylie's coffee search crosses the east side.
    KYLIE_QUOTES.forEach((quote, index) => this.once(`coffee-${index}`, t, 2800 + index * 3700, () => this.say('kylie', quote, 3500)));
    const kylie = this.actor('kylie');
    kylie.root.visible = t > 1800 && t < 15500;
    kylie.place(
      t < 4500 ? mix(950, 754, (t - 1800) / 2700) : t < 12300 ? 754 + Math.sin(t / 900) * 20 : mix(754, 950, (t - 12300) / 3200),
      DEPOT.eventBays.brian.y + Math.cos(t / 1300) * 12,
    );
    kylie.character.rightArm.rotation.x = -0.9;

    // John patrols both lanes, stops for random squat sets and retains his original warning.
    this.once('john', t, 13000, () => this.john(t));
    const john = this.actor('john');
    if (!this.staged.has('john')) {
      this.patrol('john', dt, wallTime);
      if (t < this.johnUntil && t >= this.johnUntil - 4600 && !this.johnSpoken) {
        this.johnSpoken = true;
        this.say('john', "DON'T STACK\nBOXES ON BOXES!", 3600);
      }
      if (t < this.johnUntil - 2800) john.setPoseAt('shout', wallTime);
    }

    this.updateMassage(t, wallTime, reserved);
    if (!this.staged.has('vic') && (t < 21000 || t >= 33500)) this.patrol('vic', dt, wallTime);
    this.updateCell(t, wallTime, model, reserved);
    this.updateUnitedWay(t, wallTime);
    this.updateExhaust(t, dt, wallTime, model);
    this.updateCrewFreight(t, reserved, model);

    // Shan walks the loading lane between his original announcements and breakage reactions.
    const shan = this.actor('shan');
    const visiting = this.updateShanVisit(t, wallTime);
    const shanVisible = t < this.shanUntil;
    if (!this.staged.has('shan') && !visiting && !reserved.has('shan')) shan.root.visible = true;
    if (!visiting && !reserved.has('shan')) {
      if (!this.staged.has('shan')) {
        this.patrol('shan', dt, wallTime);
      }
      const ranting = this.shanMode === 'rant';
      shan.pose = shanVisible ? ranting ? 'shout' : 'announce' : 'none';
      const anger = ranting ? 1 - (this.shanUntil - t) / 4200 : 0;
      shan.character.skinMaterial.color.setHex(0xe8b98f).lerp(new THREE.Color(0xd8453a), Math.min(1, anger * 1.4));
      if (!shanVisible) shan.pose = 'none';
    }
    this.animate(dt, wallTime);
  }

  private patrol(id: PatrolId, dt: number, time: number): void {
    const actor = this.actor(id);
    const point = this.patrols.step(id, { x: actor.root.position.x * 32 + 480, y: actor.root.position.z * 32 + 340 }, dt);
    actor.root.visible = true; actor.root.rotation.x = 0; actor.faceAngle = null;
    actor.place(point.x, point.y);
    actor.setPoseAt(point.squatting ? 'squat' : 'none', time);
    if (point.squatting) actor.poseStart = time - point.squatTime;
  }

  /** These walkers cause a brief squeeze in the open lanes, with room to go around. */
  public get patrolObstacles(): WalkPoint[] {
    return (['john', 'shan', 'vic'] as const).flatMap(id => {
      const actor = this.actor(id), x = actor.root.position.x * 32 + 480, y = actor.root.position.z * 32 + 340;
      return actor.root.visible && !this.staged.has(id) && Math.abs(actor.root.rotation.x) < 0.2
        && x >= 330 && x <= 630 && y >= 180 && y <= 1030 ? [{ x, y }] : [];
    });
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
      // Leave the trailer into the side aisle before walking down alongside
      // the feeder; the old diagonal crossed its first guard and support leg.
      worker.place(mix(trailerX, trailerX + side * 34, Math.min(1, p * 2)), mix(-205, -122, Math.max(0, p * 2 - 1)));
      worker.carrying = carrying;
      const crate = this.unloaderCrates[index];
      if (carrying) {
        const forward = new THREE.Vector3(Math.sin(worker.root.rotation.y), 0, Math.cos(worker.root.rotation.y));
        crate.position.copy(worker.root.position).addScaledVector(forward, 0.42).setY(worker.root.position.y + 0.74);
        crate.rotation.y = worker.root.rotation.y;
      } else {
        // The released crate rolls down the feeder toward the dockhand.
        const transfer = Math.min(1, (cycle - 0.58) / 0.27);
        const feeder = RECEIVING_FEEDERS[index];
        const start = { x: mix(feeder.from.x, feeder.to.x, 0.12), y: mix(feeder.from.y, feeder.to.y, 0.12) };
        const end = { x: mix(feeder.from.x, feeder.to.x, 0.86), y: mix(feeder.from.y, feeder.to.y, 0.86) };
        crate.position.copy(toWorld({ x: mix(start.x, end.x, transfer), y: mix(start.y, end.y, transfer) }, BELT_HEIGHT + 0.06));
      }
      crate.visible = cycle < 0.85;
      const coughClock = model.elapsedMs - ENGINES_3D.firstAt - 9000 - index * 6500;
      const coughing = coughClock >= 0 && coughClock % 19_000 < 1000 && !carrying;
      worker.setPoseAt(coughing ? 'cough' : 'none', wallTime);
      if (coughing) this.once(`unloader-cough-${index}-${Math.floor(coughClock / 19_000)}`, model.elapsedMs, 0, () => audioSystem.play('cough'));
      worker.animate(dt, wallTime, this.reducedMotion);
    });
    const preview = model.intakePreview;
    const dockhand = this.dockhand;
    dockhand.place(416, (preview?.y ?? 127) + 12);
    dockhand.faceAngle = Math.PI / 2;
    dockhand.animate(dt, wallTime, this.reducedMotion);
    // Flies circle his head; a green haze follows him.
    const head = dockhand.root.position.clone().setY(dockhand.root.position.y + 2.0);
    this.flies.forEach((fly, index) => {
      const a = wallTime * (3 + index * 0.7) + index * 1.3;
      fly.position.set(head.x + Math.cos(a) * 0.45, head.y + Math.sin(a * 1.7) * 0.25 + index * 0.06, head.z + Math.sin(a) * 0.45);
    });
    this.stinkTimer -= dt;
    if (this.stinkTimer <= 0 && dt > 0) {
      this.stinkTimer = 0.2;
      this.world.puffs.emit(head.clone().setY(dockhand.root.position.y + 0.9 + Math.random() * 0.8), {
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
    const home = DEPOT.eventBays.aj;
    aj.place(t < 30800 ? mix(home.x, MASSAGE_TABLE.x + 22, (t - 21000) / 1200) : mix(MASSAGE_TABLE.x + 22, home.x, (t - 30800) / 1200),
      t < 30800 ? mix(home.y, MASSAGE_TABLE.y + 4, (t - 21000) / 1200) : mix(MASSAGE_TABLE.y + 4, home.y, (t - 30800) / 1200));
    aj.faceAngle = null;
    aj.pose = 'none';
  }

  private updateCell(t: number, wallTime: number, model: ShiftModel, reserved: Set<string>): void {
    const hussan = this.actor('hussan');
    const home = DEPOT.eventBays.hussan;
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
      const returnToBay = Math.min(1, elapsed / 450);
      hussan.place(mix(392, home.x, returnToBay), mix(186, home.y, returnToBay));
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
      const station = this.workStation('hussan');
      hussan.place(mix(home.x, station.x, (t - this.cellTime) / 1600), home.y);
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

  /** Truck index that starts first: Hussan's, beside the loaders who cough first. */
  public static readonly FIRST_ENGINE = 0;

  /** When each truck's engine starts (shift ms): one first, then the rest in turn. */
  public engineStartAt(index: number): number {
    if (index === CrewLife.FIRST_ENGINE) return ENGINES_3D.firstAt;
    const order = index < CrewLife.FIRST_ENGINE ? index : index - 1;
    return ENGINES_3D.othersAt + order * ENGINES_3D.staggerMs;
  }

  /** Trucks whose engines are running at shift time t. */
  public runningEngines(t: number): number {
    return this.world.trucks.filter((_, index) => t >= this.engineStartAt(index)).length;
  }

  private updateExhaust(t: number, dt: number, wallTime: number, model: ShiftModel): void {
    // Near the end of the shift the drivers bring their keys while the belt keeps running.
    this.once('drivers', t, ENGINES_3D.driversAt, () => audioSystem.play('truck'));
    const driversVisible = t >= ENGINES_3D.driversAt && t < ENGINES_3D.driversAt + 5200;
    this.drivers.forEach((driver, index) => {
      const door = this.world.trucks[index].cabDoor;
      driver.root.visible = driversVisible;
      if (!driversVisible) return;
      // Drivers walk up to their cab fronts with the keys.
      const outward = door.x < 480 ? -1 : 1;
      driver.place(door.x + outward * mix(34, 0, (t - ENGINES_3D.driversAt - index * 70) / 2200), door.y);
      driver.faceAngle = t - ENGINES_3D.driversAt > 2200 + index * 70 ? (outward < 0 ? Math.PI / 2 : -Math.PI / 2) : null;
      driver.pose = 'keys';
      driver.animate(dt, wallTime, this.reducedMotion);
    });
    // One engine starts; its exhaust drifts onto the platform; the loaders nearby cough.
    this.once('engine-first', t, ENGINES_3D.firstAt, () => {
      audioSystem.play('engine');
      this.caption('[ONE ENGINE STARTS]');
    });
    this.once('engine-others', t, ENGINES_3D.othersAt, () => this.caption('[MORE ENGINES START]'));
    this.world.trucks.forEach((_, index) => {
      this.world.setTruckRunning(index, t >= this.engineStartAt(index));
      if (index === CrewLife.FIRST_ENGINE) return;
      this.once(`engine-${index}`, t, this.engineStartAt(index), () => audioSystem.play('engine'));
    });
    const cough = (id: string, line: string, at: number): void => {
      this.once(`cough-${id}-${at}`, t, at, () => {
        this.say(id, line, 2800);
        audioSystem.play('cough');
        const actor = this.actor(id);
        actor.pose = 'cough';
        actor.poseStart = wallTime;
      });
      if (t >= at + 2800 && t < at + 2900 && this.actor(id).pose === 'cough') this.actor(id).pose = id === 'hussan' ? 'phone' : 'none';
    };
    // The original four cough lines, alternating Hussan and Doris, around the approved line.
    COUGH_LINES.forEach((line, index) => cough(index % 2 === 0 ? 'hussan' : 'doris', line, DRIVERS.originalCoughAt[index]));
    cough(DRIVERS.coughLine.speaker, DRIVERS.coughLine.line, DRIVERS.coughLine.at);
    this.once('drivers-shan', t, DRIVERS.shanLine.at, () => {
      this.shanMode = 'announce';
      this.shanUntil = Math.max(this.shanUntil, t + 3200);
      this.say('shan', DRIVERS.shanLine.line, 3000);
    });
    // More of the crew react as the other trucks start: a cough, without a new line.
    (['fruitloop', 'bannerman', 'brian', 'donna'] as const).forEach((id, index) => {
      const at = ENGINES_3D.firstAt + 6500 + index * 9000;
      this.once(`react-${id}`, t, at, () => {
        const actor = this.actor(id);
        actor.pose = 'cough';
        actor.poseStart = wallTime;
        audioSystem.play('cough');
      });
      if (t >= at + 2200 && t < at + 2300 && this.actor(id).pose === 'cough') this.actor(id).pose = 'none';
    });
    if (t >= ENGINES_3D.firstAt && t < model.durationMs) this.emitExhaust(dt, t);
  }

  /** Subtitles for sounds; main3d shows them so nothing depends on audio alone. */
  public caption: (text: string) => void = () => undefined;

  /** Denser, larger exhaust clouds from every running engine. */
  public emitExhaust(dt: number, t = Infinity): void {
    this.exhaustTimer -= dt;
    if (this.exhaustTimer > 0 || dt <= 0) return;
    this.exhaustTimer = 0.18;
    const at = new THREE.Vector3();
    this.world.trucks.forEach((truck, index) => {
      if (t < this.engineStartAt(index)) return;
      truck.stack.getWorldPosition(at);
      this.world.puffs.emit(at, {
        color: 0xa2aaa4, size: 0.46, life: 3.2, opacity: 0.46, grow: 4.5, spread: 0.15,
        velocity: new THREE.Vector3(-truck.direction * 0.55, 0.46, 0),
      });
    });
  }

  /**
   * A thrown parcel broke: Shan runs over to the worker and yells while the
   * belt keeps moving. A second break during the visit only adds a new line.
   */
  public shanBreakage(worker: { x: number; y: number; side: 'left' | 'right' }, time: number): void {
    const line = SHAN_BREAKAGE_LINES[this.breakageIndex % SHAN_BREAKAGE_LINES.length];
    this.breakageIndex += 1;
    this.breakageLines.push(line.replace(/\n/g, ' '));
    if (this.staged.has('shan') || (this.shanVisit && time < this.shanVisit.start + 6000)) {
      this.say('shan', line, 3400);
      this.shanUntil = Math.max(this.shanUntil, time + 3400);
      return;
    }
    const laneX = worker.side === 'left' ? 365 : 595;
    const top = worker.y > DEPOT.stairs.minY ? DEPOT.stairs.minY + 10 : Math.max(-10, worker.y - 150);
    this.shanVisit = {
      start: time, line, spoken: false,
      from: { x: laneX, y: top },
      to: { x: worker.x + (worker.side === 'left' ? 16 : -16), y: worker.y - 38 },
    };
  }

  private updateShanVisit(t: number, wallTime: number): boolean {
    const visit = this.shanVisit;
    if (!visit || t >= visit.start + 6000 || this.staged.has('shan')) return false;
    const shan = this.actor('shan');
    const e = t - visit.start;
    shan.root.visible = true;
    const p = e < 650 ? e / 650 : e < 4800 ? 1 : 1 - (e - 4800) / 1200;
    shan.place(mix(visit.from.x, visit.to.x, p), mix(visit.from.y, visit.to.y, p));
    shan.faceAngle = e >= 650 && e < 4800 ? Math.atan2(0, 1) : null;
    const yelling = e >= 650 && e < 4800;
    if (yelling && !visit.spoken) {
      visit.spoken = true;
      this.say('shan', visit.line, 3400);
      shan.poseStart = wallTime;
    }
    shan.pose = yelling ? 'shout' : 'none';
    shan.character.skinMaterial.color.setHex(0xe8b98f).lerp(new THREE.Color(0xd8453a), yelling ? Math.min(1, (e - 650) / 1500) : 0);
    return true;
  }

  private updateCrewFreight(t: number, reserved: Set<string>, model: ShiftModel): void {
    RESIDENT_IDS.forEach((id, index) => {
      const actor = this.actor(id);
      const view = this.crewFreight.get(id)!;
      if (reserved.has(id) || this.staged.has(id) || (id === 'ben' && this.benGone)) {
        view.root.visible = false;
        this.crewTrips.delete(id);
        this.crewEpoch.set(id, t + 1000);
        return;
      }
      const start = this.workStation(id);
      const period = 8_000;
      let trip = this.crewTrips.get(id);
      if (!trip && t >= (this.crewEpoch.get(id) ?? (700 + index * 250)) && model.beltSpeed > 0) {
        const spawnY = CrewFreightTrip.spawnY(start.y, model.beltSpeed);
        const gap = 44;
        const occupied = model.packages.some(parcel => parcel.state === 'belt' && Math.abs(parcel.y - spawnY) < gap)
          || [...this.crewTrips.values()].some(other => {
            const state = other.sample(t, model.beltTravel);
            return state.cycle < 1650 && Math.abs(state.beltY - spawnY) < gap;
          })
          || this.snakeState === 'belt' && Math.abs(164 + model.beltTravel - this.cellTravel - spawnY) < gap;
        const intakeClearMs = Math.max(0, model.layout.beltTop + 26 + gap - spawnY) / Math.max(50, model.beltSpeed) * 1000 + 350;
        if (!occupied && (spawnY > model.layout.beltTop + 26 + gap || model.nextArrivalInMs > intakeClearMs)) {
          trip = new CrewFreightTrip(t, model.beltTravel, start.y, model.beltSpeed);
          this.crewTrips.set(id, trip);
        }
      }
      const state = trip?.sample(t, model.beltTravel);
      const cycle = state?.cycle ?? 0;
      const clock = trip ? t - trip.startedAt : 0;
      const door = TRUCK_DOORS[id];
      const pickup = { x: start.x < 480 ? 428 : 532, y: start.y };
      const approach = { x: start.x, y: door.y };
      let from = start; let to = start; let amount = 0;
      if (clock > 0 && cycle < 900) { to = pickup; amount = cycle / 900; }
      else if (clock > 0 && cycle < 1300) { from = pickup; to = pickup; }
      else if (clock > 0 && cycle < 2200) { from = pickup; to = start; amount = (cycle - 1300) / 900; }
      else if (clock > 0 && cycle < 3500) { from = start; to = approach; amount = (cycle - 2200) / 1300; }
      else if (clock > 0 && cycle < 4000) { from = approach; to = door; amount = (cycle - 3500) / 500; }
      else if (clock > 0 && cycle < 4550) { from = door; to = door; }
      else if (clock > 0 && cycle < 5050) { from = door; to = approach; amount = (cycle - 4550) / 500; }
      else if (clock > 0 && cycle < 6350) { from = approach; to = start; amount = (cycle - 5050) / 1300; }
      actor.place(mix(from.x, to.x, amount), mix(from.y, to.y, amount));
      const atRest = from === start && to === start;
      actor.faceAngle = atRest ? (start.x < 480 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5) : null;
      const carrying = clock > 0 && cycle >= 1300 && cycle < 4300;
      actor.carrying = carrying;
      if (id === 'hussan' && actor.pose !== 'cough' && actor.pose !== 'swear') actor.pose = atRest && cycle > 7500 ? 'phone' : 'none';
      view.root.visible = !!trip && cycle < 4300;
      view.root.userData.state = carrying ? 'held' : trip && cycle < 1300 ? 'belt' : 'hidden';
      if (carrying) {
        const forward = new THREE.Vector3(Math.sin(actor.root.rotation.y), 0, Math.cos(actor.root.rotation.y));
        view.root.position.copy(actor.root.position).addScaledVector(forward, 0.32 * actor.root.scale.z + view.carryDepth * view.root.scale.z).setY(actor.root.position.y + 0.82);
        if (state && state.lift < 1) view.root.position.lerp(toWorld({ x: 480, y: state.beltY }, BELT_HEIGHT + 0.01), 1 - state.lift);
        view.root.rotation.y = actor.root.rotation.y;
      } else if (state && cycle < 1300) {
        setFromModel(view.root.position, { x: 480, y: state.beltY }, BELT_HEIGHT + 0.01);
        view.root.rotation.y = 0;
        alignParcelToSurface(view, BELT_HEIGHT + 0.01);
      }
      if (cycle >= period) {
        this.crewTrips.delete(id); this.crewEpoch.set(id, t);
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
    this.crewTrips.delete(id);
    this.actor(id).carrying = false;
  }

  /** Freight is a scene child, so it follows any final clearance correction. */
  public translateActorFreight(id: string, dx: number, dz: number, dy = 0): void {
    const view = this.crewFreight.get(id);
    if (view?.root.visible && view.root.userData.state === 'held') {
      view.root.position.x += dx;
      view.root.position.y += dy;
      view.root.position.z += dz;
    }
    if (id === 'hussan' && this.cell.root.visible && this.snakeState === 'dancing') {
      this.cell.root.position.x += dx;
      this.cell.root.position.y += dy;
      this.cell.root.position.z += dz;
    }
    if (id.startsWith('unloader-')) {
      const index = Number(id.slice('unloader-'.length));
      const crate = this.unloaderCrates[index];
      if (crate?.visible && this.unloaders[index]?.carrying) {
        crate.position.x += dx;
        crate.position.y += dy;
        crate.position.z += dz;
      }
    }
    if (id === 'dockhand') for (const fly of this.flies) {
      fly.position.x += dx;
      fly.position.y += dy;
      fly.position.z += dz;
    }
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
