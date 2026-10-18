import * as THREE from 'three';

import { SHOT_WORDS } from '../game/slice/DepotReferences';
import { SHIFT_LAYOUT, type ShiftModel } from '../game/slice/ShiftModel';
import { audioSystem } from '../game/systems/AudioSystem';
import { createCharacter } from './characters';
import { mix, type Actor, type CrewLife, type Say } from './crew';
import { setFromModel, standard, textSprite, toWorld, toWorldX } from './space';
import { RALPH_BAY, type DepotWorld } from './world';

/**
 * The 2D depot's big set pieces, on its authored clocks
 * (src/game/slice/DepotLife.ts, DepotRoutines.ts). Staging positions are
 * adapted so nobody walks through a parked truck; words, order and timing
 * are unchanged.
 */
export const BEN_START = 68_000;
export const BEN_END = 92_500;
export const BEN_CAST = new Set(['ben', 'gunman', 'paula']);
const SHOT_TIMES = [78_500, 78_760, 79_180, 79_500, 80_020];
const GATE = { x: 56, y: 392 };
const FALLEN = { x: 112, y: 394 };

export class SetPieces {
  public ralphState: 'waiting' | 'entering' | 'loading' | 'leaving' | 'done' = 'waiting';
  public ralphLoaded = 0;
  public ralphLifted = 0;
  public benStage: 'waiting' | 'threat' | 'boast' | 'dodge' | 'fallen' | 'gate' | 'demon' | 'drag' | 'sink' | 'paula' | 'done' = 'waiting';
  public shotsFired = 0;
  public buttonStage: 'waiting' | 'vic' | 'stopped' | 'shan' | 'running' | 'done' = 'waiting';
  private readonly world: DepotWorld;
  private readonly crew: CrewLife;
  private readonly say: Say;
  private readonly reducedMotion: boolean;
  private readonly ralph: Actor;
  private readonly gunman: Actor;
  private readonly paula: Actor;
  private readonly ralphBox: THREE.Mesh;
  private readonly gate = new THREE.Group();
  private readonly gateLight: THREE.PointLight;
  private readonly flames: THREE.Mesh[] = [];
  private readonly demon = new THREE.Group();
  private readonly demonArms: THREE.Group[] = [];
  private readonly bang: THREE.Sprite[];
  private readonly deadMarker: THREE.Sprite;
  private readonly muzzle: THREE.Mesh;
  private cues = new Set<string>();
  private ralphStart = 0;

  constructor(world: DepotWorld, crew: CrewLife, say: Say) {
    this.world = world;
    this.crew = crew;
    this.say = say;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ralph = crew.addActor('ralph', createCharacter({ name: 'RALPH', skin: 0xd1a07d, shirt: 0x8b6f47, pants: 0x3b4048, hair: 0x8a7051, hairStyle: 'short', beard: true, scale: 1.08 }));
    this.gunman = crew.addActor('gunman', createCharacter({ name: 'GUNMAN', skin: 0xb88462, shirt: 0x30383f, pants: 0x1f2328, hair: 0x2c2b2b, hairStyle: 'bald', headwear: 'beanie' }));
    this.paula = crew.addActor('paula', createCharacter({ name: 'PAULA ABDUL', skin: 0xb78363, shirt: 0xb85a94, pants: 0x2b2a33, hair: 0x543344, hairStyle: 'long', necklace: true }));
    // The comic pistol, with a muzzle flash for each shot.
    const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.1), standard(0x1a1a1a, 0.4, 0.6));
    pistol.position.set(0, -0.15, 0.04);
    this.gunman.character.rightHand.add(pistol);
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0xffa030, emissiveIntensity: 5 }));
    this.muzzle.position.set(0, -0.32, 0.04);
    this.muzzle.visible = false;
    this.gunman.character.rightHand.add(this.muzzle);

    this.ralphBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.5), standard(0xb8875a, 0.9));
    this.ralphBox.castShadow = true;
    this.ralphBox.visible = false;
    world.scene.add(this.ralphBox);

    this.gateLight = new THREE.PointLight(0xff5a1c, 0, 9, 1.6);
    this.buildGate();
    this.buildDemon();
    this.bang = SHOT_WORDS.map((word) => {
      const sprite = textSprite([word], 0.55, { width: Math.max(120, word.length * 26), height: 56, color: '#f0dfb3', font: '900 SIZEpx Impact, "Arial Black", sans-serif' });
      sprite.material.color.setHex(0xffffff);
      sprite.visible = false;
      world.scene.add(sprite);
      return sprite;
    });
    this.deadMarker = textSprite(['X_X'], 0.3, { width: 80, height: 34, background: '#f0dfb3', color: '#4a1f1f', radius: 6 });
    this.deadMarker.visible = false;
    world.scene.add(this.deadMarker);
  }

  private buildGate(): void {
    // BenGunmanEvent's pointed red/black gate with concentric hellfire.
    const pillar = standard(0x5c0707, 0.6);
    const tip = standard(0x240000, 0.6);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.7, 0.32), pillar);
      post.position.set(0, 1.35, side * 0.95);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.8, 4), tip);
      spike.position.set(0, 3.1, side * 0.95);
      const lit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.5, 0.06), new THREE.MeshStandardMaterial({ color: 0xb34a31, emissive: 0x6a1a0f, emissiveIntensity: 0.6 }));
      lit.position.set(0.17, 1.35, side * 0.8);
      this.gate.add(post, spike, lit);
    }
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x140000 }));
    hole.scale.set(0.72, 1.18, 1);
    hole.rotation.y = Math.PI / 2;
    hole.position.set(0.02, 1.35, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 40), new THREE.MeshStandardMaterial({ color: 0xff2b1c, emissive: 0xff2b1c, emissiveIntensity: 3 }));
    ring.scale.set(0.74, 1.2, 1);
    ring.rotation.y = Math.PI / 2;
    ring.position.copy(hole.position);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 40), new THREE.MeshStandardMaterial({ color: 0xff8a25, emissive: 0xff8a25, emissiveIntensity: 3 }));
    inner.scale.set(0.52, 1.0, 1);
    inner.rotation.y = Math.PI / 2;
    inner.position.set(0.04, 1.35, 0);
    this.gate.add(hole, ring, inner);
    // Five nested tongues of fire stay inside the opening.
    for (let index = 0; index < 5; index += 1) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9 - Math.abs(index - 2) * 0.18, 6), new THREE.MeshStandardMaterial({
        color: index % 2 ? 0xff8a25 : 0xcf3c18, emissive: index % 2 ? 0xff8a25 : 0xcf3c18, emissiveIntensity: 2.5, transparent: true, opacity: 0.9,
      }));
      flame.position.set(0.08, 0.75, -0.4 + index * 0.2);
      this.gate.add(flame);
      this.flames.push(flame);
    }
    this.gateLight.position.set(0.6, 1.3, 0);
    this.gate.add(this.gateLight);
    this.gate.position.copy(toWorld(GATE));
    this.gate.visible = false;
    this.world.scene.add(this.gate);
  }

  private buildDemon(): void {
    // The adult demon: purple, winged, horned, with glowing eyes and long arms.
    const skin = new THREE.MeshStandardMaterial({ color: 0x7a4aa8, roughness: 0.55, emissive: 0x2a0f40, emissiveIntensity: 0.4 });
    const dark = standard(0x4b2a6a, 0.6);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 6, 12), skin);
    torso.position.y = 1.45;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), standard(0x9a6ac0, 0.6));
    belly.position.set(0, 1.35, 0.2);
    belly.scale.set(1, 1.1, 0.5);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), skin);
    head.position.y = 2.3;
    head.scale.set(1, 0.9, 0.95);
    this.demon.add(torso, belly, head);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 8), standard(0xe8d8a8, 0.5));
      horn.position.set(side * 0.2, 2.65, 0);
      horn.rotation.z = -side * 0.45;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff4030, emissive: 0xff2010, emissiveIntensity: 4 }));
      eye.position.set(side * 0.12, 2.34, 0.28);
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 5), standard(0xf3ead8, 0.4));
      fang.rotation.x = Math.PI;
      fang.position.set(side * 0.08, 2.12, 0.3);
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0); wingShape.lineTo(1.3, 0.9); wingShape.lineTo(1.1, 0.1); wingShape.lineTo(1.4, -0.3);
      wingShape.lineTo(0.9, -0.2); wingShape.lineTo(0.9, -0.7); wingShape.lineTo(0, -0.4); wingShape.closePath();
      const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), new THREE.MeshStandardMaterial({ color: 0x5a3080, side: THREE.DoubleSide, roughness: 0.7 }));
      wing.position.set(side * 0.3, 1.8, -0.25);
      wing.scale.set(side, 1, 1);
      wing.rotation.y = side * 0.5;
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.8, 4, 8), skin);
      upper.position.y = -0.5;
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 5), dark);
      claw.position.y = -1.05;
      claw.rotation.x = Math.PI;
      arm.add(upper, claw);
      arm.position.set(side * 0.55, 1.95, 0);
      this.demonArms.push(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.6, 4, 8), dark);
      leg.position.set(side * 0.22, 0.5, 0);
      this.demon.add(horn, eye, fang, wing, arm, leg);
    }
    this.demon.visible = false;
    this.world.scene.add(this.demon);
  }

  public reset(): void {
    this.cues = new Set();
    this.ralphState = 'waiting';
    this.ralphLoaded = 0;
    this.ralphLifted = 0;
    this.benStage = 'waiting';
    this.shotsFired = 0;
    this.buttonStage = 'waiting';
    for (const actor of [this.ralph, this.gunman, this.paula]) actor.root.visible = false;
    this.ralphBox.visible = false;
    this.world.ralphTruck.visible = false;
    this.world.setRalphLoad(0);
    this.world.setButton('stop', 'ready');
    this.world.setButton('start', 'ready');
    this.gate.visible = false;
    this.demon.visible = false;
    this.deadMarker.visible = false;
    for (const sprite of this.bang) sprite.visible = false;
  }

  private once(key: string, time: number, at: number, action: () => void): void {
    if (time < at || this.cues.has(key)) return;
    this.cues.add(key);
    action();
  }

  /** Runs with the shift clock: Vic/Shan's buttons and Ralph's five-ton. */
  public update(dt: number, model: ShiftModel, wallTime: number): void {
    this.updateButtons(model);
    this.updateRalph(model);
    // Vic and Shan are animated here, after their button poses are set.
    const staged = [...this.crew.staged].filter((id) => id !== 'ben');
    this.crew.animateActors(dt, wallTime, new Set(['ralph', ...staged]));
  }

  private updateButtons(model: ShiftModel): void {
    const t = model.elapsedMs;
    const vic = this.crew.actor('vic');
    const shan = this.crew.actor('shan');
    // Vic walks down the west lane and presses STOP: the belt really stops.
    if (t >= 94_000 && t < 102_000) {
      this.crew.staged.add('vic');
      vic.root.visible = true;
      vic.root.rotation.x = 0;
      vic.place(414, t < 96_000 ? mix(40, 346, (t - 94_000) / 2000) : t < 97_500 ? 346 : mix(346, 40, (t - 97_500) / 4500));
      vic.faceAngle = t >= 96_000 && t < 97_500 ? Math.PI / 2 : null;
      vic.pose = t >= 95_800 && t < 96_600 ? 'press' : 'none';
      if (this.buttonStage === 'waiting') this.buttonStage = 'vic';
    } else if (this.crew.staged.has('vic') && t >= 102_000) {
      this.crew.staged.delete('vic');
      vic.root.visible = false;
    }
    this.once('vic-stop', t, 96_000, () => {
      model.eventStopped = true;
      this.buttonStage = 'stopped';
      this.world.setButton('stop', 'pressed');
      this.say('vic', 'BELT STOPPED', 2600);
      audioSystem.play('belt-stop');
    });
    // Shan comes down the east lane, rants, and restarts it at START.
    if (t >= 99_200 && t < 108_000) {
      this.crew.staged.add('shan');
      shan.root.visible = true;
      shan.place(546, t < 101_200 ? mix(40, 346, (t - 99_200) / 2000) : t < 104_000 ? 346 : mix(346, 40, (t - 104_000) / 4000));
      shan.faceAngle = t >= 101_200 && t < 104_000 ? -Math.PI / 2 : null;
      if (t >= 101_600 && t < 102_200) shan.pose = 'press';
      if (this.buttonStage === 'stopped') this.buttonStage = 'shan';
    } else if (this.crew.staged.has('shan') && t >= 108_000) {
      this.crew.staged.delete('shan');
      shan.root.visible = false;
      this.world.setButton('start', 'ready');
    }
    this.once('shan-rant', t, 99_600, () => this.crew.rant(t));
    this.once('shan-restart', t, 101_800, () => {
      model.eventStopped = false;
      this.buttonStage = 'running';
      this.world.setButton('stop', 'ready');
      this.world.setButton('start', 'lit');
      this.say('shan', 'BELT RUNNING', 2200);
      audioSystem.play('button');
    });
  }

  private updateRalph(model: ShiftModel): void {
    const t = model.elapsedMs;
    const ralph = this.ralph;
    if (this.ralphState === 'waiting' && model.bulkSorted >= 5 && t >= 90_000) {
      this.ralphState = 'entering';
      this.ralphStart = t;
      this.world.ralphTruck.visible = true;
      audioSystem.play('truck');
    }
    if (this.ralphState === 'waiting' || this.ralphState === 'done') return;
    const elapsed = t - this.ralphStart;
    const truck = this.world.ralphTruck;
    if (elapsed < 1800) {
      truck.position.x = toWorldX(mix(RALPH_BAY.from, RALPH_BAY.x, elapsed / 1800));
      return;
    }
    truck.position.x = toWorldX(RALPH_BAY.x);
    if (this.ralphState === 'entering') {
      this.ralphState = 'loading';
      ralph.root.visible = true;
      this.say('ralph', 'I NEED TO HURRY UP\nAND GET BACK TO MY\n3 SETS OF TRIPLETS!', 4900);
    }
    const loading = elapsed - 1800;
    if (loading < 15_000) {
      // Five separate trips: each lifts one real crate from the shared pile.
      const trip = loading % 3000;
      const loaded = Math.min(5, Math.floor(loading / 3000));
      if (loaded > this.ralphLoaded) audioSystem.play('bulk');
      this.ralphLoaded = loaded;
      this.ralphLifted = Math.min(5, loaded + Number(trip >= 1600));
      this.world.setRalphLoad(loaded);
      // From the flatbed, backed against the platform edge, to the shared pile.
      const door = { x: 330, y: RALPH_BAY.y };
      const pile = { x: SHIFT_LAYOUT.bulkPile.x - 46, y: SHIFT_LAYOUT.bulkPile.y + 8 };
      if (trip < 1300) ralph.place(mix(door.x, pile.x, trip / 1300), mix(door.y, pile.y, trip / 1300));
      else if (trip < 1600) ralph.place(pile.x, pile.y);
      else ralph.place(mix(pile.x, door.x, (trip - 1600) / 1400), mix(pile.y, door.y, (trip - 1600) / 1400));
      ralph.faceAngle = trip >= 1300 && trip < 1600 ? Math.PI / 2 : null;
      ralph.pose = trip >= 1600 ? 'carry' : 'none';
      this.ralphBox.visible = trip >= 1600;
      if (this.ralphBox.visible) {
        const forward = new THREE.Vector3(Math.sin(ralph.root.rotation.y), 0, Math.cos(ralph.root.rotation.y));
        this.ralphBox.position.copy(ralph.root.position).addScaledVector(forward, 0.45).setY(ralph.root.position.y + 1.0);
        this.ralphBox.rotation.y = ralph.root.rotation.y;
      }
    } else {
      this.ralphState = 'leaving';
      this.ralphLoaded = 5;
      this.ralphLifted = 5;
      this.world.setRalphLoad(5);
      this.ralphBox.visible = false;
      ralph.root.visible = false;
      truck.position.x = toWorldX(mix(RALPH_BAY.x, RALPH_BAY.from - 40, (loading - 15_000) / 2200));
      if (loading >= 17_200) {
        this.ralphState = 'done';
        truck.visible = false;
      }
    }
  }

  /** Ben's robbery runs on its own story clock while the shift is frozen. */
  public updateBen(clock: number, dt: number, wallTime: number): void {
    const t = clock;
    const ben = this.crew.actor('ben');
    const gunman = this.gunman;
    const paula = this.paula;
    if (!this.crew.staged.has('ben')) {
      // His routine parcel would otherwise float where he left it.
      this.crew.hideCrewFreight('ben');
      this.crew.staged.add('ben');
    }
    ben.carrying = false;

    // The gunman comes in along the outer wall and threatens the floor.
    gunman.root.visible = t >= 68_000 && t < 81_700;
    if (gunman.root.visible) {
      gunman.place(40, t < 69_500 ? mix(520, 420, (t - 68_000) / 1500) : t < 80_500 ? 420 : mix(420, 520, (t - 80_500) / 1200));
      const aiming = t >= 69_500 && t < 80_500;
      gunman.faceAngle = aiming
        ? Math.atan2(ben.root.position.x - gunman.root.position.x, ben.root.position.z - gunman.root.position.z) : null;
      gunman.pose = aiming ? 'aim' : 'none';
    }
    this.once('gunman', t, 69_500, () => { this.benStage = 'threat'; this.say('gunman', "I'M GOING TO\nROB THIS PLACE!", 2400); });
    this.once('ben-training', t, 72_000, () => { this.benStage = 'boast'; this.say('ben', "DON'T WORRY GUYS\nI GOT THIS\nI TOOK TRAINING ON\nHOW TO DODGE GUNS", 5200); });

    // Ben's dodge, five comic shots, and the fall.
    const dodge = THREE.MathUtils.clamp((t - 77_200) / 1300, 0, 1);
    ben.root.visible = t < 85_600;
    ben.character.nameTag.visible = t < 80_020;
    if (t < 77_200) {
      ben.place(150, 390);
      ben.faceAngle = -Math.PI / 2;
      ben.pose = t >= 72_000 && t < 77_200 ? 'announce' : 'none';
      ben.root.rotation.x = 0;
    } else if (t < 80_020) {
      if (this.benStage === 'boast') this.benStage = 'dodge';
      ben.place(150 - (150 - FALLEN.x) * dodge + Math.sin(dodge * Math.PI * 4) * 16, 390 + Math.sin(dodge * Math.PI * 3) * 14);
      ben.faceAngle = this.reducedMotion ? -Math.PI / 2 : -Math.PI / 2 + Math.sin(t / 90) * 0.9;
      ben.pose = 'crouch';
    } else if (t < 81_700 || t >= 85_600) {
      if (this.benStage === 'dodge') this.benStage = 'fallen';
      this.lie(ben, FALLEN.x, FALLEN.y, THREE.MathUtils.clamp((t - 80_020) / 280, 0, 1));
    }
    SHOT_TIMES.forEach((at, index) => this.once(`shot-${index}`, t, at, () => {
      this.shotsFired = index + 1;
      audioSystem.play('gunshot');
    }));
    const shot = SHOT_TIMES.findLastIndex((at) => t >= at);
    this.muzzle.visible = shot >= 0 && t - SHOT_TIMES[shot] < 120 && t < 80_500;
    this.bang.forEach((sprite, index) => {
      sprite.visible = index === shot && t >= 78_500 && t < 80_500;
      if (sprite.visible) {
        const from = gunman.root.position;
        const to = ben.root.position;
        sprite.position.set(mix(from.x, to.x, 0.55), 2.3 + index % 2 * 0.25, mix(from.z, to.z, 0.55) - 0.2);
      }
    });

    // The hell gate opens; the demon rises, drags Ben in and sinks with him.
    const opening = THREE.MathUtils.clamp((t - 80_500) / 1200, 0, 1);
    const departure = THREE.MathUtils.clamp((t - 85_000) / 600, 0, 1);
    this.gate.visible = t >= 80_500 && t < 85_600;
    if (this.gate.visible) {
      const amount = (1 - (1 - opening) ** 3) * (1 - departure * departure);
      this.gate.position.y = -3.6 * (1 - amount);
      this.gate.scale.setScalar(Math.max(0.01, amount));
      this.gateLight.intensity = 30 * amount * (this.reducedMotion ? 1 : 0.85 + Math.sin(wallTime * 13) * 0.15);
      this.flames.forEach((flame, index) => {
        flame.scale.y = this.reducedMotion ? 1 : 0.8 + Math.abs(Math.sin(wallTime * 7 + index * 1.8)) * 0.45;
      });
      if (this.benStage === 'fallen') this.benStage = 'gate';
    }
    const gateWorld = toWorld(GATE);
    this.demon.visible = t >= 81_700 && t < 85_600;
    if (t >= 81_700 && t < 85_000) {
      const emergence = THREE.MathUtils.clamp((t - 81_700) / 1500, 0, 1);
      const drag = THREE.MathUtils.clamp((t - 83_200) / 1800, 0, 1);
      this.benStage = drag > 0 ? 'drag' : 'demon';
      // The demon reaches Ben's ankles, then both travel together to the gate.
      const demonX = mix(GATE.x + 12, FALLEN.x - 30, emergence) - (FALLEN.x - GATE.x - 26) * drag;
      setFromModel(this.demon.position, { x: demonX, y: FALLEN.y }, -0.6 * (1 - emergence));
      this.demon.scale.setScalar(mix(0.25, 1, emergence));
      this.demon.rotation.y = Math.PI / 2;
      for (const arm of this.demonArms) arm.rotation.x = -1.2 * emergence;
      this.lie(ben, FALLEN.x - (FALLEN.x - GATE.x - 26) * drag, FALLEN.y, 1);
    } else if (t >= 85_000 && t < 85_600) {
      this.benStage = 'sink';
      const sink = departure * departure;
      this.demon.position.set(mix(this.demon.position.x, gateWorld.x, sink), -2.2 * sink, gateWorld.z);
      this.demon.scale.setScalar(Math.max(0.01, 1 - sink));
      ben.root.position.set(mix(ben.root.position.x, gateWorld.x, sink), 0.15 - 1.4 * sink, gateWorld.z);
      ben.root.scale.setScalar(Math.max(0.01, 1 - sink));
    }
    this.deadMarker.visible = t >= 80_020 && t < 85_600;
    if (this.deadMarker.visible) this.deadMarker.position.copy(ben.root.position).add(new THREE.Vector3(0, 0.9, 0));

    // Paula arrives only after the body and the demon have gone.
    paula.root.visible = t >= 85_600 && t < BEN_END;
    if (paula.root.visible) {
      if (this.benStage !== 'paula') {
        this.benStage = 'paula';
        this.crew.benGone = true;
        ben.root.visible = false;
      }
      paula.place(t < 86_400 ? mix(10, 104, (t - 85_600) / 800) : t < 91_600 ? 104 : mix(104, 10, (t - 91_600) / 900), 404);
      paula.faceAngle = t >= 86_400 && t < 91_600 ? Math.PI / 2 : null;
      paula.pose = t >= 86_400 && t < 91_600 ? 'swear' : 'none';
    }
    this.once('paula', t, 86_400, () => this.say('paula', 'GREAT\nNOW WHICH BITCH\nIS GOING TO LOAD\nMY FUCKING TRUCK', 5200));
    this.crew.animateActors(dt, wallTime, new Set(['ben', 'gunman', 'paula']));
    if (t >= BEN_END) {
      this.benStage = 'done';
      this.crew.staged.delete('ben');
      this.crew.benGone = true;
      ben.root.visible = false;
      paula.root.visible = false;
    }
  }

  /** Lays Ben on his back, feet toward the gate (yaw is applied after the fall). */
  private lie(actor: Actor, x: number, y: number, amount: number): void {
    actor.root.rotation.order = 'YXZ';
    setFromModel(actor.root.position, { x, y }, 0.15 * amount);
    actor.faceAngle = -Math.PI / 2;
    actor.pose = 'none';
    actor.root.rotation.x = -Math.PI / 2 * amount;
  }
}
