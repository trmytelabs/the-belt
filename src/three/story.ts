import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { LOT_LAYOUT, MALL_LAYOUT, type KeyReturnModel, type MallEvent, type MallModel } from '../game/slice/MallModel';
import type { Cutscene } from '../game/slice/StoryModel';
import type { StoryScene } from '../game/slice/StoryScript';
import { animateCharacter, createCharacter, mergeCharacter, type Character, type CharacterSpec } from './characters';
import { applyPose, type CrewLife, type Pose } from './crew';
import { upgradeCar } from './propModels';
import { PuffField } from './fx';
import { buildSouthgateMall, mallX, mallZ, type SouthgateMall } from './mall';
import { mergeStatic } from './merge';
import { actorSurfaceAt, setFromModel, shadowed, standard, textPlane, textSprite, toWorld } from './space';
import { RESIDENT_SPECS, SKANKY_SPEC, SKIN, TERMITE_SPEC, VISITORS, createTruck } from './world';
import { DEPOT_3D_LAYOUT as DEPOT } from './layout';

/**
 * The story's locations away from the depot floor (the UPS lot, the break
 * stops, the road and the mall) and the cutscene staging for every scene.
 * Every pose is a function of how far each cue has progressed, so skipping a
 * scene always lands on its final staging.
 */
export type StageId = 'lot' | 'store' | 'coffee' | 'road' | 'mall';

const ease = (t: number): number => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));
const rounded = (w: number, h: number, d: number, material: THREE.Material, r = 0.05): THREE.Mesh =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), material);

/** How far a cue has progressed: 0 before its beat, its progress during it, 1 after (or once skipped). */
export function cueProgress(cutscene: Cutscene, cue: string): number {
  const index = cutscene.scene.beats.findIndex((beat) => beat.cue === cue);
  if (index < 0) return 0;
  if (cutscene.done || cutscene.index > index) return 1;
  if (cutscene.index < index) return 0;
  return cutscene.progress;
}

/** A character placed in a story stage's own metres. */
export class StageActor {
  public readonly character: Character;
  public pose: Pose = 'none';
  public poseStart = 0;
  public faceAngle: number | null = null;
  public carrying = false;
  private readonly previous = new THREE.Vector3();
  private moved = false;
  private heading = 0;

  constructor(character: Character) {
    this.character = character;
  }

  public get root(): THREE.Group { return this.character.root; }

  public at(x: number, z: number, y = 0): void {
    this.previous.copy(this.root.position);
    this.root.position.set(x, y, z);
    const dx = x - this.previous.x;
    const dz = z - this.previous.z;
    this.moved = dx * dx + dz * dz > 1e-6;
    if (this.moved) this.heading = Math.atan2(dx, dz);
  }

  public setPose(pose: Pose, time: number): void {
    if (this.pose !== pose) { this.pose = pose; this.poseStart = time; }
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

const CLERK: CharacterSpec = { name: 'CLERK', skin: SKIN.tan, shirt: 0x2f7d6b, pants: 0x2b2f3a, hair: 0x2a1d14, hairStyle: 'bun' };
const CASHIER: CharacterSpec = { name: 'CASHIER', skin: SKIN.brown, shirt: 0x2e8b57, pants: 0x2b2f3a, hair: 0x1b1612, hairStyle: 'short', vest: 0xe85a2a };

function specFor(id: string): CharacterSpec {
  if (id === 'termite') return TERMITE_SPEC;
  if (id === 'skanky') return SKANKY_SPEC;
  if (id === 'cashier') return CASHIER;
  if (id === 'clerk' || id.startsWith('clerk-')) return CLERK;
  return RESIDENT_SPECS[id] ?? VISITORS[id] ?? { name: id.toUpperCase(), skin: SKIN.light, shirt: 0x667788, pants: 0x333333, hair: 0x222222, hairStyle: 'short' };
}

/**
 * Height of a car seat above the car's origin. The body hides the seated
 * legs, and a seated head stays under the roof (inside 1.52 m).
 */
const SEAT_Y = 0.06;

/**
 * Where a car is along a path of waypoints at progress t (0..1), and which
 * way its nose points. Heading turns smoothly into each new leg.
 */
function alongPath(points: [number, number][], t: number): { x: number; z: number; h: number } {
  const legs = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = legs.reduce((sum, leg) => sum + leg, 0);
  let distance = THREE.MathUtils.clamp(t, 0, 1) * total;
  const heading = (i: number): number => Math.atan2(-(points[i + 1][1] - points[i][1]), points[i + 1][0] - points[i][0]);
  for (let i = 0; i < legs.length; i += 1) {
    if (distance <= legs[i] || i === legs.length - 1) {
      const f = legs[i] > 0 ? Math.min(1, distance / legs[i]) : 1;
      const [x0, z0] = points[i];
      const [x1, z1] = points[i + 1];
      let h = heading(i);
      if (i > 0) {
        const previous = heading(i - 1);
        const turn = Math.atan2(Math.sin(h - previous), Math.cos(h - previous));
        h = previous + turn * Math.min(1, f / 0.35);
      }
      return { x: mix(x0, x1, f), z: mix(z0, z1, f), h };
    }
    distance -= legs[i];
  }
  return { x: points[0][0], z: points[0][1], h: heading(0) };
}

/** A small car whose nose points along local +X. */
function createCar(color: number): THREE.Group {
  const car = new THREE.Group();
  const paint = standard(color, 0.45, 0.35);
  const body = rounded(4.2, 0.72, 1.8, paint, 0.2);
  body.position.y = 0.6;
  const glass = new THREE.MeshStandardMaterial({ color: 0x0d1a22, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.45 });
  const cabin = rounded(2.2, 0.62, 1.62, glass, 0.18);
  cabin.position.set(-0.25, 1.24, 0);
  const roof = rounded(2.0, 0.08, 1.56, paint, 0.04);
  roof.position.set(-0.25, 1.56, 0);
  car.add(body, cabin, roof);
  for (const x of [1.35, -1.35]) for (const z of [0.82, -0.82]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16), standard(0x121416, 0.9));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.34, z);
    car.add(wheel);
  }
  const head = new THREE.MeshStandardMaterial({ color: 0xfff3c8, emissive: 0xfff0c0, emissiveIntensity: 2.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a1010, emissive: 0xff2020, emissiveIntensity: 1.2 });
  for (const z of [0.6, -0.6]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.34), head);
    light.position.set(2.11, 0.7, z);
    light.name = 'headlight';
    light.userData.keep = true;
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.3), tail);
    rear.position.set(-2.11, 0.72, z);
    car.add(light, rear);
  }
  void upgradeCar(car, color);
  return shadowed(car);
}

/** Canvas chain-link, so the fence reads as a fence. */
function chainLink(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(190,200,205,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(64, 64); ctx.moveTo(64, 0); ctx.lineTo(0, 64);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

interface Stage {
  scene: THREE.Scene;
  actors: Map<string, StageActor>;
  props: Record<string, THREE.Object3D>;
  puffs: PuffField;
}

/** Model pixels in the lot's key-return area map onto the lot stage's metres. */
const lotX = (x: number): number => (x - 480) / 32;
const lotZ = (y: number): number => (y - 140) / 32 - 13.5;

export class StoryStage {
  public readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
  public active: StageId | null = null;
  private readonly quality: 'high' | 'low';
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly stages: Partial<Record<StageId, Stage>> = {};
  private readonly cameraLook = new THREE.Vector3();
  private frameDt = 1 / 60;
  private dawn = 0;
  private roadTravel = 0;
  private mallStoreText = new Map<string, string>();
  private southgate: SouthgateMall | null = null;
  private mallIntroBeat = -1;
  private mallSnap = false;

  constructor(quality: 'high' | 'low') {
    this.quality = quality;
  }

  public get scene(): THREE.Scene | null {
    return this.active ? this.stage(this.active).scene : null;
  }

  public resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 60 : 42;
    this.camera.updateProjectionMatrix();
  }

  public end(): void {
    this.active = null;
  }

  /** Every stage returns to its built state for a fresh run. */
  public reset(): void {
    this.end();
    for (const [id, stage] of Object.entries(this.stages)) {
      for (const actor of stage.actors.values()) {
        actor.root.visible = false;
        actor.pose = 'none';
        actor.faceAngle = null;
        actor.carrying = false;
      }
      if (id === 'mall') this.mallStoreText.clear();
    }
  }

  /** Where a speaker's bubble belongs in the active stage. */
  public anchor(id: string): THREE.Vector3 | null {
    if (!this.active) return null;
    const actor = this.stage(this.active).actors.get(id);
    if (!actor) return null;
    return actor.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, actor.character.headHeight + 0.35, 0));
  }

  // ------------------------------------------------------------------ stages

  private stage(id: StageId): Stage {
    let stage = this.stages[id];
    if (stage) return stage;
    const scene = new THREE.Scene();
    stage = { scene, actors: new Map(), props: {}, puffs: new PuffField(scene) };
    this.stages[id] = stage;
    if (id === 'lot') this.buildLot(stage);
    else if (id === 'store') this.buildStore(stage);
    else if (id === 'coffee') this.buildCoffee(stage);
    else if (id === 'road') this.buildRoad(stage);
    else this.buildMall(stage);
    const dynamic = new Set<THREE.Object3D>([...stage.actors.values()].map((actor) => actor.root));
    for (const prop of Object.values(stage.props)) dynamic.add(prop);
    mergeStatic(scene, (object) => dynamic.has(object) || object.userData.keep === true || (object as THREE.Light).isLight === true);
    return stage;
  }

  private cast(stage: Stage, ids: string[]): void {
    for (const id of ids) {
      const character = createCharacter(specFor(id));
      mergeCharacter(character);
      character.root.visible = false;
      stage.scene.add(character.root);
      stage.actors.set(id, new StageActor(character));
    }
  }

  private night(scene: THREE.Scene, background: number): void {
    scene.background = new THREE.Color(background);
    scene.fog = new THREE.Fog(background, 30, 90);
    scene.add(new THREE.HemisphereLight(0xb4c7df, 0x485568, 1.25));
    const key = new THREE.DirectionalLight(0xc8d6ff, 1.1);
    key.position.set(-8, 16, 10);
    key.castShadow = this.quality === 'high';
    key.shadow.mapSize.setScalar(2048);
    const s = key.shadow.camera;
    s.left = -24; s.right = 24; s.top = 24; s.bottom = -24;
    scene.add(key);
  }

  private buildLot(stage: Stage): void {
    const { scene, props } = stage;
    this.night(scene, 0x0b1520);
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), standard(0x23292c, 0.95));
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.receiveShadow = true;
    scene.add(asphalt);
    const paint = new THREE.MeshStandardMaterial({ color: 0xd8d8c8, roughness: 0.8 });
    for (let x = -17; x <= 17; x += 3) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4.2), paint);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.01, -5.2);
      scene.add(stripe);
    }
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe0b23c, roughness: 0.7 });
    for (let x = -40; x < 40; x += 4) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.14), yellow);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.01, 9);
      scene.add(dash);
    }
    // The depot: dock doors, the dispatch door and the key drop.
    const building = new THREE.Mesh(new THREE.BoxGeometry(50, 8, 8), standard(0x2c3438, 0.85));
    building.position.set(0, 4, -18);
    building.receiveShadow = true;
    scene.add(building);
    for (const x of [-16, -10, -4]) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(4, 3.6), standard(0x10181c, 0.9));
      door.position.set(x, 1.8, -13.98);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 0.2), new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 0.4 }));
      frame.position.set(x, 3.7, -13.97);
      scene.add(door, frame);
    }
    const sign = textPlane(['UPS', 'DEPOT 07'], 6, 2.2, { width: 300, height: 110, background: '#3a2a1e', color: '#e8c060', radius: 10 });
    sign.position.set(0, 6.2, -13.95);
    scene.add(sign);
    const dispatch = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), new THREE.MeshStandardMaterial({ color: 0x3a3020, emissive: 0xffc070, emissiveIntensity: 0.6 }));
    dispatch.position.set(9.5, 1.2, -13.97);
    const dispatchSign = textPlane(['DISPATCH'], 1.8, 0.4, { width: 160, height: 36, background: '#14262d', color: '#d9ccab' });
    dispatchSign.position.set(9.5, 2.75, -13.96);
    const keyBox = rounded(0.7, 0.9, 0.3, standard(0x8a2a22, 0.5, 0.3), 0.04);
    keyBox.position.set(lotX(835), 1.3, -13.8);
    const keySign = textPlane(['KEY', 'DROP'], 0.9, 0.7, { width: 120, height: 90, background: '#f2c14e', color: '#1b1f22', radius: 8 });
    keySign.position.set(lotX(835), 2.3, -13.96);
    const doorLight = new THREE.PointLight(0xffc080, 12, 10, 1.6);
    doorLight.position.set(10, 3.2, -12.5);
    scene.add(dispatch, dispatchSign, keyBox, keySign, doorLight);
    // Chain-link fence and the sliding gate.
    const linkTexture = chainLink();
    linkTexture.repeat.set(10, 1);
    const link = new THREE.MeshStandardMaterial({ map: linkTexture, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 });
    const post = standard(0x8a949a, 0.4, 0.6);
    for (const [from, to] of [[-26, -3.2], [3.2, 26]] as const) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(to - from, 2.2), link);
      panel.position.set((from + to) / 2, 1.1, 0);
      scene.add(panel);
      for (let x = from; x <= to; x += 2.6) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), post);
        pole.position.set(x, 1.2, 0);
        scene.add(pole);
      }
    }
    const gate = new THREE.Group();
    const gatePanel = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.2), link);
    gatePanel.position.y = 1.1;
    const frame = new THREE.MeshStandardMaterial({ color: 0xb7c0c4, roughness: 0.4, metalness: 0.6 });
    for (const [x, y, w, h] of [[0, 2.2, 6.4, 0.08], [0, 0.1, 6.4, 0.08], [-3.2, 1.1, 0.08, 2.2], [3.2, 1.1, 0.08, 2.2]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frame);
      bar.position.set(x, y, 0);
      gate.add(bar);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0xe0b23c, metalness: 0.7, roughness: 0.3 }));
    lock.position.set(-3.1, 1.15, 0.12);
    lock.name = 'lock';
    lock.userData.keep = true;
    gate.add(gatePanel, lock);
    gate.position.set(0, 0, 0.05);
    scene.add(gate);
    props.gate = gate;
    const gateSign = textPlane(['NO ENTRY · STAFF ONLY'], 3.2, 0.35, { width: 300, height: 34, background: '#c23a2e', color: '#fff6e8' });
    gateSign.position.set(-6, 2.0, 0.06);
    scene.add(gateSign);
    // Streetlights.
    for (const x of [-14, 0, 14]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), post);
      pole.position.set(x, 3, 11.5);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffc070, emissiveIntensity: 3 }));
      lamp.position.set(x, 6, 11);
      scene.add(pole, lamp);
      if (this.quality === 'high' || x === 0) {
        const light = new THREE.PointLight(0xffb060, 30, 20, 1.6);
        light.position.set(x, 5.6, 10.5);
        scene.add(light);
      }
    }
    const lotLight = new THREE.PointLight(0xffc080, 26, 26, 1.5);
    lotLight.position.set(0, 7, -6);
    scene.add(lotLight);
    // Morning light for the trip home; off at night.
    const dawnLight = new THREE.HemisphereLight(0xffd8b0, 0x40506a, 0);
    dawnLight.userData.keep = true;
    scene.add(dawnLight);
    props.dawnLight = dawnLight;
    // Cars: the crew's, Shan's, Skanky's, and the five-ton for the return.
    const cars: [string, number][] = [
      ['car-skanky', 0x8f3f34], ['car-doris', 0x7d4d9c], ['car-hussan', 0x3f78a8], ['car-brian', 0x6d5534],
      ['car-fruitloop', 0x5fae4e], ['car-shan', 0xd8d4c8], ['park-1', 0x4a5560], ['park-2', 0x7a7a70],
      ['park-3', 0x2e4a5a], ['park-4', 0x5a3030], ['park-5', 0x6a6a7a],
    ];
    for (const [name, color] of cars) {
      const car = createCar(color);
      car.visible = false;
      scene.add(car);
      props[name] = car;
    }
    const fiveTon = createTruck('5 TON', 0x5a4632, 0x4a3a2a, 'right');
    fiveTon.visible = false;
    scene.add(fiveTon);
    props.fiveTon = fiveTon;
    const phone = new THREE.PointLight(0x7fb0ff, 0, 3, 1.5);
    props.phoneGlow = phone;
    scene.add(phone);
    const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.2, 10), standard(0xd8d4c8, 0.6));
    coffee.visible = false;
    props.shanCoffee = coffee;
    scene.add(coffee);
    const sleep = textSprite(['zZz'], 0.4, { width: 70, height: 34, color: '#d8e2d0' });
    sleep.visible = false;
    props.sleep = sleep;
    scene.add(sleep);
    this.cast(stage, ['termite', 'skanky', 'shan', 'doris', 'hussan', 'brian', 'fruitloop', 'vic']);
  }

  private buildStore(stage: Stage): void {
    const { scene, props } = stage;
    scene.background = new THREE.Color(0x0e1418);
    scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x3a3a3a, 1.0));
    const tiles = document.createElement('canvas');
    tiles.width = tiles.height = 64;
    const tctx = tiles.getContext('2d')!;
    tctx.fillStyle = '#d8d8d0'; tctx.fillRect(0, 0, 64, 64);
    tctx.fillStyle = '#b8bcb4'; tctx.fillRect(0, 0, 32, 32); tctx.fillRect(32, 32, 32, 32);
    const tileTexture = new THREE.CanvasTexture(tiles);
    tileTexture.wrapS = tileTexture.wrapT = THREE.RepeatWrapping;
    tileTexture.repeat.set(10, 10);
    tileTexture.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), new THREE.MeshStandardMaterial({ map: tileTexture, roughness: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const wall = standard(0xe8e4d8, 0.8);
    for (const [x, z, w, d] of [[0, -7, 16, 0.2], [-8, 0, 0.2, 14], [8, 0, 0.2, 14]] as const) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), wall);
      panel.position.set(x, 2, z);
      scene.add(panel);
    }
    // Generic convenience-store stripes and a plain sign.
    for (const [y, color] of [[3.2, 0xe8702a], [3.0, 0x2e8b57], [2.8, 0xc8302a]] as const) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(16, 0.16, 0.05), standard(color, 0.6));
      stripe.position.set(0, y, -6.88);
      scene.add(stripe);
    }
    const sign = textPlane(['7-ELEVEN'], 3.2, 0.7, { width: 300, height: 66, background: '#ffffff', color: '#2e8b57', radius: 8 });
    sign.position.set(0, 3.7, -6.86);
    scene.add(sign);
    const counter = rounded(6.4, 1.0, 1.0, standard(0x6a4a3a, 0.6), 0.05);
    counter.position.set(0.4, 0.5, -2.2);
    const register = rounded(0.6, 0.4, 0.5, standard(0x222428, 0.4), 0.04);
    register.position.set(1.8, 1.2, -2.3);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshStandardMaterial({ color: 0x103020, emissive: 0x40ff90, emissiveIntensity: 0.8 }));
    screen.position.set(1.8, 1.36, -2.04);
    scene.add(counter, register, screen);
    // Shelves of junk food, a fridge wall and the slushie machine.
    const colors = [0xe03030, 0xf0c030, 0x3070e0, 0x30a050, 0xe07020, 0xa040c0];
    for (let shelf = 0; shelf < 3; shelf += 1) {
      const unit = rounded(3.4, 1.7, 0.7, standard(0x9aa0a4, 0.5, 0.4), 0.03);
      unit.position.set(-4.8 + shelf * 4.4, 0.85, -6.2);
      scene.add(unit);
      for (let i = 0; i < 18; i += 1) {
        const item = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.18), standard(colors[(i + shelf) % colors.length], 0.6));
        item.position.set(-6.2 + shelf * 4.4 + (i % 9) * 0.34, 0.55 + Math.floor(i / 9) * 0.55, -5.82);
        scene.add(item);
      }
    }
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, 5), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x7fc8ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 }));
    fridge.position.set(-7.6, 1.2, -1);
    const slushie = rounded(0.9, 1.3, 0.6, standard(0x303438, 0.4), 0.05);
    slushie.position.set(6.4, 1.65, -2.4);
    scene.add(fridge, slushie);
    for (const [x, color] of [[6.2, 0x3080ff], [6.6, 0xff3040]] as const) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 14), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }));
      drum.position.set(x, 2.55, -2.4);
      scene.add(drum);
    }
    // On the counter: the crew's junk food, and Termite's bag of apples.
    const junk = new THREE.Group();
    for (let i = 0; i < 9; i += 1) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.12), standard(colors[i % colors.length], 0.5));
      bag.position.set(-0.4 + (i % 5) * 0.4, 1.21, -1.95 - Math.floor(i / 5) * 0.25);
      bag.rotation.z = (i % 3 - 1) * 0.2;
      junk.add(bag);
    }
    scene.add(junk);
    props.junk = junk;
    const apples = new THREE.Group();
    const paperBag = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.26), standard(0xb89868, 0.9));
    paperBag.position.y = 0.21;
    apples.add(paperBag);
    for (let i = 0; i < 5; i += 1) {
      const apple = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), standard(i % 2 ? 0xc02020 : 0x60b030, 0.4));
      apple.position.set(-0.1 + (i % 3) * 0.1, 0.45 + Math.floor(i / 3) * 0.06, (i % 2) * 0.06 - 0.03);
      apples.add(apple);
    }
    scene.add(apples);
    props.apples = apples;
    const bars = new THREE.Group();
    for (let i = 0; i < 3; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.12), standard(0x5a3018, 0.6));
      bar.position.set(0, 0.02 + i * 0.045, 0);
      bars.add(bar);
    }
    scene.add(bars);
    props.bars = bars;
    const extraBar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.12), standard(0x7a2810, 0.6));
    scene.add(extraBar);
    props.extraBar = extraBar;
    const light = new THREE.PointLight(0xffffff, 18, 18, 1.4);
    light.position.set(0, 3.6, 0);
    scene.add(light);
    this.cast(stage, ['termite', 'skanky', 'bannerman', 'doris', 'brian', 'cashier']);
  }

  private buildCoffee(stage: Stage): void {
    const { scene, props } = stage;
    this.night(scene, 0x0b1520);
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), standard(0x262c30, 0.95));
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.receiveShadow = true;
    scene.add(asphalt);
    const shop = new THREE.Mesh(new THREE.BoxGeometry(16, 4.4, 6), standard(0x5a3a2a, 0.8));
    shop.position.set(0, 2.2, -10);
    const windows = new THREE.Mesh(new THREE.PlaneGeometry(12, 2), new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xffc070, emissiveIntensity: 1.1 }));
    windows.position.set(0, 1.6, -6.98);
    const sign = textPlane(['TIM HORTONS'], 6, 0.9, { width: 400, height: 60, background: '#f4efe6', color: '#b0221c', radius: 8 });
    sign.position.set(0, 3.7, -6.97);
    const glow = new THREE.PointLight(0xffc080, 24, 16, 1.5);
    glow.position.set(0, 3, -5);
    scene.add(shop, windows, sign, glow);
    const car = createCar(0x8f3f34);
    car.position.set(0, 0, -1);
    scene.add(car);
    props.car = car;
    // The tray of coffees and the donut box on the hood.
    const tray = new THREE.Group();
    const cardboard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), standard(0xa88a60, 0.9));
    tray.add(cardboard);
    for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.2, 10), standard(0xb0221c, 0.6));
      cup.position.set(x, 0.12, z);
      tray.add(cup);
    }
    tray.position.set(1.35, 0.99, -1.4);
    scene.add(tray);
    props.tray = tray;
    const box = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.44), standard(0xf4efe6, 0.8));
    base.position.y = 0.06;
    box.add(base);
    for (let i = 0; i < 12; i += 1) {
      const donut = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.022, 6, 12), standard(i === 4 ? 0x7a4a2a : 0xc08040, 0.6));
      donut.rotation.x = Math.PI / 2;
      donut.position.set(-0.24 + (i % 4) * 0.16, 0.13, -0.12 + Math.floor(i / 4) * 0.12);
      donut.visible = i !== 11;
      box.add(donut);
    }
    // One donut has a bite out of it.
    const bite = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), standard(0xf4efe6, 0.8));
    bite.position.set(-0.24 + 0 * 0.16 + 0.04, 0.14, -0.12 + 0.12 * 1);
    box.add(bite);
    const lid = new THREE.Group();
    const lidPanel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.44), standard(0xe8e0d0, 0.8));
    lidPanel.position.z = 0.22;
    lid.add(lidPanel);
    lid.position.set(0, 0.13, -0.22);
    lid.userData.keep = true;
    box.add(lid);
    box.position.set(1.4, 0.96, -0.6);
    scene.add(box);
    props.donutBox = box;
    props.lid = lid;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.2, 10), standard(0xb0221c, 0.6));
    scene.add(cup);
    props.cup = cup;
    const stain = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.17), standard(0x4a2a14, 0.9));
    stain.visible = false;
    scene.add(stain);
    props.stain = stain;
    this.cast(stage, ['termite', 'skanky', 'kylie', 'doris', 'brian']);
  }

  private buildRoad(stage: Stage): void {
    const { scene, props } = stage;
    this.night(scene, 0x08121c);
    const road = document.createElement('canvas');
    road.width = 256; road.height = 64;
    const rctx = road.getContext('2d')!;
    rctx.fillStyle = '#26292b'; rctx.fillRect(0, 0, 256, 64);
    rctx.fillStyle = '#e0b23c'; rctx.fillRect(0, 30, 120, 4);
    rctx.fillStyle = '#d8d8c8'; rctx.fillRect(0, 2, 256, 2); rctx.fillRect(0, 60, 256, 2);
    const roadTexture = new THREE.CanvasTexture(road);
    roadTexture.wrapS = THREE.RepeatWrapping;
    roadTexture.repeat.set(12, 1);
    roadTexture.colorSpace = THREE.SRGBColorSpace;
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(120, 8), new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 0.9 }));
    surface.rotation.x = -Math.PI / 2;
    surface.userData.keep = true;
    scene.add(surface);
    props.road = surface;
    const verge = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), standard(0x1a2420, 0.95));
    verge.rotation.x = -Math.PI / 2;
    verge.position.y = -0.01;
    scene.add(verge);
    // Streetlights and buildings that scroll past.
    const passing = new THREE.Group();
    for (let i = 0; i < 10; i += 1) {
      const x = -60 + i * 12;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), standard(0x8a949a, 0.4, 0.6));
      pole.position.set(x, 3, -5);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffb050, emissiveIntensity: 3 }));
      lamp.position.set(x, 6, -4.4);
      const building = new THREE.Mesh(new THREE.BoxGeometry(8, 4 + (i * 7) % 6, 6), standard(0x1c2630, 0.9));
      building.position.set(x + 3, building.geometry.parameters.height / 2, -14);
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffc070, emissiveIntensity: (i % 3) * 0.5 }));
      lit.position.set(x + 2, 2, -10.98);
      passing.add(pole, lamp, building, lit);
    }
    passing.userData.keep = true;
    scene.add(passing);
    props.passing = passing;
    const light = new THREE.PointLight(0xffb060, 28, 30, 1.5);
    light.position.set(0, 6, -2);
    scene.add(light);
    const truck = createTruck('5 TON', 0x5a4632, 0x4a3a2a, 'right');
    scene.add(truck);
    props.truck = truck;
  }

  private buildMall(stage: Stage): void {
    const { scene, props } = stage;
    this.southgate = buildSouthgateMall(scene, this.quality, createCar);
    props.mallFull = this.southgate.full;
    props.mallCut = this.southgate.cut;
    // The five-ton backed up to the dock door; its tailgate opens onto the dock.
    const truck = createTruck('5 TON', 0x5a4632, 0x4a3a2a, 'left', undefined, true);
    truck.position.set(mallX(40 - 74), 0, mallZ(400));
    scene.add(truck);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 4.0), standard(0x8a949a, 0.4, 0.6));
    ramp.position.set(mallX(52), 0.55, mallZ(400));
    ramp.rotation.z = -0.9;
    scene.add(ramp);
    // Six labelled bundles in the truck, one per store.
    for (let slot = 0; slot < 6; slot += 1) {
      const bundle = this.bundle(slot % 2 ? 3 : 2);
      // The slots are squeezed to fit between the truck's side walls; the model's slot rows are unchanged.
      bundle.position.set(mallX(22), 1.1, mallZ(350 + slot * 20) * 0.62);
      scene.add(bundle);
      props[`slot-${slot}`] = bundle;
    }
    const cart = new THREE.Group();
    const deck = rounded(1.15, 0.08, 0.8, standard(0x3a6a8a, 0.5, 0.4), 0.03);
    deck.position.y = 0.32;
    cart.add(deck);
    for (const [x, z] of [[-0.45, -0.32], [0.45, -0.32], [-0.45, 0.32], [0.45, 0.32]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), standard(0x111111, 0.9));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.1, z);
      cart.add(wheel);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), standard(0x8a949a, 0.4, 0.6));
      leg.position.set(x, 0.22, z);
      cart.add(leg);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.7), standard(0x8a949a, 0.4, 0.6));
    handle.position.set(-0.58, 0.75, 0);
    cart.add(handle);
    for (let i = 0; i < 2; i += 1) {
      const load = this.bundle(3);
      load.position.set(-0.22 + i * 0.5, 0.36, 0);
      load.scale.setScalar(0.8);
      load.visible = false;
      cart.add(load);
      props[`cart-${i}`] = load;
    }
    scene.add(cart);
    props.cart = cart;
    const carried = this.bundle(2);
    carried.visible = false;
    scene.add(carried);
    props.carried = carried;
    this.cast(stage, ['skanky', ...MALL_LAYOUT.doors.map((_, index) => `clerk-${index}`)]);
    MALL_LAYOUT.doors.forEach((_, index) => {
      const actor = stage.actors.get(`clerk-${index}`)!;
      actor.character.nameTag.visible = false;
      const pad = rounded(0.24, 0.32, 0.03, standard(0x7a5a3a, 0.7), 0.02);
      pad.position.set(0, -0.1, 0.07);
      actor.character.rightHand.add(pad);
    });
  }

  /** A strapped stack of two or three boxes with a name label above it. */
  private bundle(boxes: number): THREE.Group {
    const group = new THREE.Group();
    for (let i = 0; i < boxes; i += 1) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.36), standard(i % 2 ? 0xb8875a : 0xa47650, 0.9));
      box.position.set((i % 2) * 0.06 - 0.03, 0.15 + i * 0.3, 0);
      box.castShadow = true;
      group.add(box);
    }
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, boxes * 0.3 + 0.02, 0.38), standard(0xd8c060, 0.6));
    strap.position.y = boxes * 0.15;
    group.add(strap);
    group.userData.boxes = boxes;
    return group;
  }

  private setLabel(group: THREE.Object3D, text: string, color = '#f1e5c4'): void {
    if (group.userData.label === text) return;
    const old = group.getObjectByName('label');
    if (old) group.remove(old);
    if (text) {
      const sprite = textSprite([text], 0.32, { width: Math.max(110, text.length * 13 + 20), height: 30, background: color, border: '#9e8452', color: '#2b2116', radius: 5 });
      sprite.name = 'label';
      // Store tags are gameplay labels: never hidden behind the truck's walls.
      sprite.material.depthTest = false;
      sprite.renderOrder = 10;
      sprite.position.y = (group.userData.boxes ?? 2) * 0.3 + 0.35;
      group.add(sprite);
    }
    group.userData.label = text;
  }

  // ------------------------------------------------------------------ cutscenes

  /** Prepares the stage for a story scene away from the depot floor. */
  public beginScene(scene: StoryScene): void {
    const id: StageId = scene.location === 'home' ? 'lot' : scene.location as StageId;
    this.active = id;
    const stage = this.stage(id);
    for (const actor of stage.actors.values()) {
      actor.root.visible = false;
      actor.pose = 'none';
      actor.faceAngle = null;
      actor.carrying = false;
      actor.root.rotation.set(0, 0, 0);
    }
    for (const [name, prop] of Object.entries(stage.props)) if (name.startsWith('car-') || name.startsWith('park-') || name === 'fiveTon') prop.visible = false;
    this.dawn = scene.id === 'go-home' ? 1 : scene.id === 'drive-to-ups' ? 0.6 : 0;
    this.applySky(stage);
    this.roadTravel = 0;
    this.mallIntroBeat = -1;
  }

  private applySky(stage: Stage): void {
    if (!(stage.scene.background instanceof THREE.Color)) return;
    const night = new THREE.Color(this.active === 'road' ? 0x08121c : 0x0b1520);
    const dawn = new THREE.Color(0x5a6a8a).lerp(new THREE.Color(0xd89a70), 0.35);
    (stage.scene.background as THREE.Color).copy(night).lerp(dawn, this.dawn);
    if (stage.scene.fog instanceof THREE.Fog) stage.scene.fog.color.copy(stage.scene.background as THREE.Color);
    const dawnLight = stage.props.dawnLight as THREE.HemisphereLight | undefined;
    if (dawnLight) dawnLight.intensity = this.dawn * 1.4;
  }

  /** Stages the current beat of a cutscene in its location. */
  public direct(cutscene: Cutscene, dt: number, time: number): void {
    if (!this.active) return;
    const stage = this.stage(this.active);
    this.frameDt = dt;
    const id = cutscene.scene.id;
    if (id.startsWith('opener')) this.directOpener(stage, cutscene, time);
    else if (id.startsWith('7eleven')) this.directStore(stage, cutscene, time);
    else if (id.startsWith('timhortons')) this.directCoffee(stage, cutscene, time);
    else if (id === 'drive-to-mall' || id === 'drive-to-ups') this.directRoad(stage, cutscene, dt);
    else if (id === 'go-home') this.directHome(stage, cutscene, time);
    else if (id === 'mall-intro') this.directMallIntro(stage, cutscene);
    for (const actor of stage.actors.values()) if (actor.root.visible) actor.animate(dt, time, this.reducedMotion);
    stage.puffs.update(dt);
  }

  private cameraTo(position: THREE.Vector3, look: THREE.Vector3, dt: number, snap = false): void {
    const blend = snap || this.reducedMotion ? 1 : 1 - Math.exp(-dt * 3);
    this.camera.position.lerp(position, blend);
    this.cameraLook.lerp(look, blend);
    this.camera.lookAt(this.cameraLook);
  }

  private seat(actor: StageActor, car: THREE.Object3D, local: THREE.Vector3): void {
    const world = car.localToWorld(local.clone());
    actor.root.visible = true;
    actor.at(world.x, world.z, world.y);
    actor.faceAngle = car.rotation.y + Math.PI / 2;
    actor.pose = 'sit';
  }

  private placeCar(car: THREE.Object3D, x: number, z: number, heading: number): void {
    car.visible = true;
    car.position.set(x, 0, z);
    car.rotation.y = heading;
  }

  private directOpener(stage: Stage, cutscene: Cutscene, time: number): void {
    const { props, actors } = stage;
    const a = (id: string): StageActor => actors.get(id)!;
    const toGate = Math.PI / 2;
    const gate = props.gate;
    const id = cutscene.scene.id;
    if (id === 'opener-2') {
      // The lot is full and the gate is open; Termite and Skanky are late.
      gate.position.x = 6.3;
      props.gate.getObjectByName('lock')!.visible = false;
      [-14, -11, -8, 5, 8, 11].forEach((x, index) => this.placeCar(props[`park-${(index % 5) + 1}`], x, -5.2, -Math.PI / 2));
      const park = ease(cueProgress(cutscene, 'pair-park'));
      const car = props['car-skanky'];
      const path = park < 0.5 ? { x: mix(-24, 0, park * 2), z: mix(9, 3, park * 2), h: mix(0, toGate, park * 2) }
        : { x: mix(0, -1.5, park * 2 - 1), z: mix(3, -5.4, park * 2 - 1), h: mix(toGate, toGate + 0.45, park * 2 - 1) };
      this.placeCar(car, path.x, path.z, path.h);
      const run = ease(cueProgress(cutscene, 'pair-run'));
      const inside = ease(cueProgress(cutscene, 'walk-in'));
      if (run <= 0) {
        this.seat(a('skanky'), car, new THREE.Vector3(-0.3, SEAT_Y, 0.36));
        this.seat(a('termite'), car, new THREE.Vector3(-0.3, SEAT_Y, -0.36));
      } else {
        for (const [who, offset] of [['skanky', -0.5], ['termite', 0.5]] as const) {
          const actor = a(who);
          actor.root.visible = inside < 0.95;
          actor.pose = 'none';
          actor.faceAngle = null;
          const along = Math.min(1, run * 0.85 + inside * 0.15);
          actor.at(mix(-1.5 + offset, 9.2 + offset * 0.4, along), mix(-3.6, -12.4 - inside * 1.5, along));
        }
        a('termite').setPose(run < 0.4 ? 'handup' : 'none', time);
      }
      const vic = a('vic');
      vic.root.visible = cueProgress(cutscene, 'vic-at-door') > 0;
      vic.at(10.4, -13.2);
      vic.faceAngle = -2.6;
      this.cameraTo(new THREE.Vector3(12, 7.5, 6), new THREE.Vector3(3, 1, -6.5), this.frameDt, cutscene.index === 0 && cutscene.elapsedMs < 50);
      return;
    }
    // Shan is late: the gate is chained and everyone waits outside in their cars.
    const open = ease(cueProgress(cutscene, 'gate-open'));
    gate.position.x = 6.3 * open;
    gate.getObjectByName('lock')!.visible = open < 0.2;
    const drive = ease(cueProgress(cutscene, 'walk-in'));
    // [car, driver, waiting spot x/z, parking stall x]
    const queue: [string, string, number, number, number][] = id === 'opener-3'
      ? [['car-skanky', 'skanky', 0, 5.2, 2.5], ['car-brian', 'brian', -6.5, 6.5, -3.5], ['car-fruitloop', 'fruitloop', 6.5, 6.5, 5.5], ['car-doris', 'doris', -12.5, 7.2, -6.5]]
      : [['car-skanky', 'skanky', 0, 5.2, 2.5], ['car-doris', 'doris', -6.5, 6.5, -3.5], ['car-hussan', 'hussan', 6.5, 6.5, 5.5]];
    queue.forEach(([name, driver, x, z, stall], index) => {
      const car = props[name];
      // One at a time: out to the gate line, straight through, then into a stall.
      const go = THREE.MathUtils.clamp((drive - 0.3 - index * 0.16) / 0.36, 0, 1);
      const path: [number, number][] = x === 0 ? [[x, z], [0, -1.2], [stall, -2.6], [stall, -5.2]]
        : [[x, z], [x * 0.25, 3.8], [0, 2.6], [0, -1.2], [stall, -2.6], [stall, -5.2]];
      const at = go <= 0 ? { x, z, h: toGate } : alongPath(path, ease(go));
      this.placeCar(car, at.x, at.z, at.h);
      this.seat(a(driver), car, new THREE.Vector3(-0.3, SEAT_Y, 0.36));
      if (name === 'car-skanky') this.seat(a('termite'), car, new THREE.Vector3(-0.3, SEAT_Y, -0.36));
    });
    if (id === 'opener-1') {
      a('doris').setPose(cueProgress(cutscene, 'doris-smoke') > 0 ? 'phone' : 'sit', time);
      if (cueProgress(cutscene, 'doris-smoke') > 0 && cueProgress(cutscene, 'doris-smoke') < 1 && Math.random() < 0.2) {
        stage.puffs.emit(a('doris').root.position.clone().add(new THREE.Vector3(0.4, 1.4, 0.3)), { color: 0xc9ccd0, size: 0.18, life: 2.2, velocity: new THREE.Vector3(0.2, 0.4, 0.3), opacity: 0.4, grow: 4 });
      }
      a('hussan').setPose(cueProgress(cutscene, 'hussan-phone') > 0 ? 'phone' : 'sit', time);
    } else {
      // Fruit Loop sleeps on his wheel; Brian leans on his horn.
      props.sleep.visible = drive < 0.1;
      props.sleep.position.copy(a('fruitloop').root.position).add(new THREE.Vector3(0, 1.9 + Math.sin(time * 2) * 0.08, 0));
      a('fruitloop').character.head.rotation.x = 0.5;
      const honk = cueProgress(cutscene, 'brian-honk');
      props['car-brian'].children.filter((child) => child.name === 'headlight').forEach((light) => {
        ((light as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = honk > 0 && honk < 1 && Math.sin(time * 18) > 0 ? 6 : 2.2;
      });
    }
    // Shan's car pulls up; he walks to the gate and opens it.
    const arrive = ease(cueProgress(cutscene, 'shan-arrives'));
    const shanCar = props['car-shan'];
    this.placeCar(shanCar, mix(34, 9.5, arrive), 10.2, Math.PI);
    shanCar.visible = arrive > 0;
    const shan = a('shan');
    const walk = ease(cueProgress(cutscene, 'shan-at-gate'));
    shan.root.visible = walk > 0;
    shan.pose = 'none';
    // Through the gate first and over toward the dispatch door, clear of the cars.
    const inside = Math.min(1, drive / 0.3);
    // From his car round the front of the waiting car beside it, to the gate.
    const toGatePath = alongPath([[9.5, 9.0], [8.6, 2.0], [-1.2, 1.0]], walk);
    shan.at(toGatePath.x + mix(0, 7.4, inside), toGatePath.z + mix(0, -9.6, inside));
    shan.faceAngle = walk >= 1 && drive <= 0 ? Math.PI : null;
    if (walk >= 1 && open <= 0) shan.setPose('press', time);
    props.shanCoffee.visible = id === 'opener-3' && walk > 0;
    if (props.shanCoffee.visible) {
      const hand = new THREE.Vector3();
      shan.character.leftArm.getWorldPosition(hand);
      props.shanCoffee.position.copy(hand).add(new THREE.Vector3(0, -0.55, 0.15));
    }
    this.cameraTo(new THREE.Vector3(13, 8.5, 21), new THREE.Vector3(1.5, 1, 2.5), this.frameDt, cutscene.index === 0 && cutscene.elapsedMs < 50);
  }

  private directStore(stage: Stage, cutscene: Cutscene, time: number): void {
    const { props, actors } = stage;
    const a = (id: string): StageActor => actors.get(id)!;
    const variant = cutscene.scene.id;
    const place = (id: string, x: number, z: number, face = Math.PI): void => {
      const actor = a(id);
      actor.root.visible = true;
      actor.at(x, z);
      actor.faceAngle = face;
    };
    place('cashier', 1.6, -3.1, 0);
    place('doris', 2.6, -0.6);
    place('brian', 3.4, 0.2, Math.PI - 0.4);
    if (variant === '7eleven-2') place('bannerman', -2.6, -0.7, Math.PI + 0.5);
    place('skanky', 0.6, -1.0);
    const leave = ease(cueProgress(cutscene, 'leave'));
    const bag = cueProgress(cutscene, 'termite-bag') > 0 || leave > 0;
    place('termite', mix(-0.9, variant === '7eleven-1' ? -1.2 : -2.2, leave), mix(-1.0, variant === '7eleven-1' ? 3.8 : 2.6, leave), leave > 0.6 && variant === '7eleven-1' ? 0.2 : Math.PI);
    a('termite').carrying = bag;
    const apples = props.apples;
    if (bag) {
      const termite = a('termite').root;
      const forward = new THREE.Vector3(Math.sin(termite.rotation.y), 0, Math.cos(termite.rotation.y));
      apples.position.copy(termite.position).addScaledVector(forward, 0.4).setY(0.75);
    } else apples.position.set(-0.9, 1.0, -2.0);
    const chocolate = ease(cueProgress(cutscene, 'skanky-chocolate'));
    props.bars.position.set(0.6, 1.0, -1.95);
    props.extraBar.position.set(mix(3.6, 0.6, chocolate), 1.0 + 0.14 + Math.sin(chocolate * Math.PI) * 0.4, mix(-5.7, -1.95, chocolate));
    a('skanky').setPose(chocolate > 0 && chocolate < 1 ? 'press' : 'none', time);
    a('cashier').setPose(variant === '7eleven-3' && cutscene.index === 1 ? 'announce' : 'none', time);
    this.cameraTo(new THREE.Vector3(-4.6, 3.0, 3.2), new THREE.Vector3(0.6, 1.2, -1.6), this.frameDt, cutscene.index === 0 && cutscene.elapsedMs < 50);
  }

  private directCoffee(stage: Stage, cutscene: Cutscene, time: number): void {
    const { props, actors } = stage;
    const a = (id: string): StageActor => actors.get(id)!;
    const variant = cutscene.scene.id;
    const car = props.car;
    car.position.set(0, 0, -1);
    car.rotation.y = 0;
    const stand = (id: string, x: number, z: number, face: number): void => {
      const actor = a(id);
      actor.root.visible = true;
      actor.at(x, z);
      actor.faceAngle = face;
    };
    props.stain.visible = false;
    if (variant === 'timhortons-2') {
      // Everyone is in the car; the donut box is on Skanky's lap.
      this.seat(a('skanky'), car, new THREE.Vector3(0.2, SEAT_Y, 0.36));
      this.seat(a('termite'), car, new THREE.Vector3(0.2, SEAT_Y, -0.36));
      this.seat(a('doris'), car, new THREE.Vector3(-0.8, SEAT_Y, 0.36));
      this.seat(a('brian'), car, new THREE.Vector3(-0.8, SEAT_Y, -0.36));
      props.tray.visible = false;
      props.donutBox.position.copy(car.localToWorld(new THREE.Vector3(0.5, 1.0, 0.36)));
      props.lid.rotation.x = -1.6;
      a('brian').character.head.rotation.x = Math.sin(time * 9) * 0.08;
      const back = cueProgress(cutscene, 'back-seat');
      if (back > 0 && back < 1 && Math.random() < 0.15) stage.puffs.emit(a('brian').root.position.clone().add(new THREE.Vector3(0, 1.35, 0.25)), { color: 0xc08040, size: 0.05, life: 0.8, velocity: new THREE.Vector3(0, -0.5, 0.4), opacity: 0.9, grow: 1 });
      props.cup.visible = false;
      this.cameraTo(new THREE.Vector3(4.4, 2.2, 2.2), new THREE.Vector3(0.1, 1.1, -1), this.frameDt, cutscene.index === 0 && cutscene.elapsedMs < 50);
      return;
    }
    props.tray.visible = variant === 'timhortons-1';
    stand('termite', 2.7, -0.4, -Math.PI / 2);
    stand('skanky', 2.9, 0.9, -Math.PI / 2 - 0.6);
    stand('doris', 2.2, -2.5, -0.3);
    stand('brian', 3.4, -2.0, -0.9);
    if (variant === 'timhortons-1') {
      stand('kylie', 1.4, 0.6, Math.PI);
      const hands = cueProgress(cutscene, 'three-hands');
      for (const id of ['skanky', 'doris', 'brian']) a(id).setPose(hands > 0 && cutscene.index <= 3 ? 'handup' : 'none', time);
      const box = cueProgress(cutscene, 'donut-box');
      props.donutBox.position.set(1.4, 0.96, -0.6);
      props.lid.rotation.x = box <= 0 || box >= 1 ? 0 : -Math.sin(Math.min(1, box * 1.6) * Math.PI) * 1.8;
      a('termite').setPose(box > 0 && box < 1 ? 'press' : 'none', time);
      props.cup.visible = false;
    } else {
      // Skanky hands Termite a coffee with a loose lid; it spills on his sleeve.
      props.donutBox.position.set(1.4, 0.96, -0.6);
      props.lid.rotation.x = 0;
      const hand = ease(cueProgress(cutscene, 'hand-coffee'));
      const spill = cueProgress(cutscene, 'spill');
      const from = a('skanky').root.position.clone().add(new THREE.Vector3(-0.35, 1.05, -0.2));
      const to = a('termite').root.position.clone().add(new THREE.Vector3(-0.3, 1.0, 0.1));
      props.cup.visible = true;
      props.cup.position.lerpVectors(from, to, Math.min(1, hand * 1.4));
      a('skanky').setPose(hand > 0 && hand < 0.8 ? 'press' : 'none', time);
      a('termite').setPose(hand > 0.5 ? 'press' : 'none', time);
      if (spill > 0 && spill < 0.6 && Math.random() < 0.6) {
        stage.puffs.emit(to.clone(), { color: 0x5a3018, size: 0.08, life: 0.7, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, -1.2, (Math.random() - 0.5) * 0.6), opacity: 0.95, grow: 1.2 });
      }
      if (spill > 0) {
        const arm = new THREE.Vector3();
        a('termite').character.rightArm.getWorldPosition(arm);
        props.stain.visible = true;
        props.stain.position.copy(arm).add(new THREE.Vector3(0, -0.25, 0));
      }
    }
    this.cameraTo(new THREE.Vector3(2.4, 5.2, 6.2), new THREE.Vector3(2.0, 0.9, -0.9), this.frameDt, cutscene.index === 0 && cutscene.elapsedMs < 50);
  }

  private directRoad(stage: Stage, cutscene: Cutscene, dt: number): void {
    const { props } = stage;
    const depart = cueProgress(cutscene, 'depart');
    const arrive = cueProgress(cutscene, 'arrive');
    const speed = 14 * Math.min(1, depart * 1.5) * (1 - arrive);
    this.roadTravel += speed * dt;
    const map = ((props.road as THREE.Mesh).material as THREE.MeshStandardMaterial).map!;
    map.offset.x = this.roadTravel / 10;
    props.passing.position.x = -(this.roadTravel % 12);
    props.truck.position.set(0, 0, 1.6);
    this.cameraTo(new THREE.Vector3(-7.5, 3.6, 8.5), new THREE.Vector3(1.5, 1.4, 0.5), dt, cutscene.index === 0 && cutscene.elapsedMs < 50);
  }

  private directHome(stage: Stage, cutscene: Cutscene, time: number): void {
    const { props, actors } = stage;
    const skanky = actors.get('skanky')!;
    props.gate.position.x = 6.3;
    props.gate.getObjectByName('lock')!.visible = false;
    this.placeCar(props.fiveTon, lotX(330), lotZ(360), 0);
    // Skanky's car is in the stall past the five-ton. He walks round the truck
    // to it, backs out, and leaves through the open gate.
    const car = props['car-skanky'];
    const walk = ease(cueProgress(cutscene, 'car'));
    const leave = ease(cueProgress(cutscene, 'drive-home'));
    const stall = { x: -9.5, z: -5.2 };
    const backedOut = { x: -10.6, z: -1.6 };
    const at = leave < 0.25
      ? { x: mix(stall.x, backedOut.x, leave / 0.25), z: mix(stall.z, backedOut.z, leave / 0.25), h: mix(Math.PI / 2, 0, leave / 0.25) }
      : alongPath([[backedOut.x, backedOut.z], [-2, -1.6], [0, 0.6], [-1.5, 4], [-30, 8.5]], (leave - 0.25) / 0.75);
    this.placeCar(car, at.x, at.z, at.h);
    if (walk < 1) {
      skanky.root.visible = true;
      skanky.pose = 'none';
      skanky.faceAngle = null;
      const step = alongPath([[9.5, -12.8], [0.5, -3.0], [-8.3, -3.0], [-8.3, -4.9]], walk);
      skanky.at(step.x, step.z);
    } else this.seat(skanky, car, new THREE.Vector3(-0.3, SEAT_Y, 0.36));
    const phone = props.phoneGlow as THREE.PointLight;
    const phoneOn = cueProgress(cutscene, 'phone') > 0 && leave <= 0;
    phone.intensity = phoneOn ? 4 + Math.sin(time * 6) : 0;
    phone.position.copy(skanky.root.position).add(new THREE.Vector3(0, 1.3, 0));
    this.cameraTo(new THREE.Vector3(2, 6.5, 12), new THREE.Vector3(-4.5, 1, -4), this.frameDt, cutscene.index === 0 && cutscene.elapsedMs < 50);
  }

  // ------------------------------------------------------------------ mall and lot gameplay

  public beginMall(): void {
    this.active = 'mall';
    const stage = this.stage('mall');
    for (const actor of stage.actors.values()) actor.root.visible = false;
    this.mallStoreText.clear();
    this.mallSnap = true;
  }

  /** Mirrors the mall model: Skanky, the cart and its load, the truck's bundles, clerks and store badges. */
  public updateMall(model: MallModel, dt: number, time: number): void {
    const stage = this.stage('mall');
    const { props, actors } = stage;
    // Play happens in the cutaway: low south walls, no roofs or door headers.
    props.mallFull.visible = false;
    props.mallCut.visible = true;
    const skanky = actors.get('skanky')!;
    skanky.root.visible = true;
    skanky.at(mallX(model.skanky.x), mallZ(model.skanky.y));
    skanky.faceAngle = { right: Math.PI / 2, left: -Math.PI / 2, down: 0, up: Math.PI }[model.skanky.facing];
    skanky.carrying = model.carrying !== null || model.cart.pushed;
    const cart = props.cart;
    cart.position.set(mallX(model.cart.x), 0, mallZ(model.cart.y));
    const facing = model.cart.facing;
    // The handle is on the side away from the direction of travel.
    cart.rotation.y = { right: 0, left: Math.PI, up: Math.PI / 2, down: -Math.PI / 2 }[facing];
    // The northern of the two loads gets the higher tag, so the tags never stack.
    const raised = facing === 'down' ? 0 : 1;
    for (let i = 0; i < 2; i += 1) {
      const load = props[`cart-${i}`];
      const id = model.cart.load[i];
      load.visible = Boolean(id);
      if (id) this.setLabel(load, model.store(id).name);
      const tag = load.getObjectByName('label');
      if (tag) tag.position.y = (load.userData.boxes ?? 2) * 0.3 + 0.35 + (i === raised ? 0.55 : 0);
    }
    model.truckBundles.forEach((id, slot) => {
      const bundle = props[`slot-${slot}`];
      bundle.visible = id !== null;
      if (id) {
        const store = model.store(id);
        const current = store.run === model.run || (model.runComplete && store.run === model.run + 1);
        this.setLabel(bundle, store.name, current ? '#f2c14e' : '#c8c0b0');
        // Alternate slots' tags sit in two staggered columns over the tailgate.
        const tag = bundle.getObjectByName('label');
        if (tag) tag.position.set(slot % 2 ? 0.75 : -0.75, 1.25, 0);
      }
    });
    const nearestSlot = model.nearestSlot();
    const atTail = model.skanky.x < MALL_LAYOUT.tailgate.x + MALL_LAYOUT.tailgate.w && !model.carrying;
    model.truckBundles.forEach((_, slot) => {
      props[`slot-${slot}`].scale.setScalar(atTail && slot === nearestSlot ? 1.12 + Math.sin(time * 6) * 0.04 : 1);
    });
    const carried = props.carried;
    carried.visible = model.carrying !== null;
    if (model.carrying) {
      const forward = new THREE.Vector3(Math.sin(skanky.root.rotation.y), 0, Math.cos(skanky.root.rotation.y));
      carried.position.copy(skanky.root.position).addScaledVector(forward, 0.42).setY(0.75);
      carried.rotation.y = skanky.root.rotation.y;
      this.setLabel(carried, model.store(model.carrying).name);
    }
    model.stores.forEach((store, index) => {
      const clerk = actors.get(`clerk-${index}`)!;
      const north = store.side === 'north';
      clerk.root.visible = store.state !== 'waiting';
      clerk.at(mallX(store.door.x + 30), mallZ(north ? store.door.y - 26 : store.door.y + 26));
      clerk.faceAngle = north ? 0 : Math.PI;
      clerk.setPose(store.state === 'dropped' ? 'press' : 'none', time);
      // Each storefront's lit status board, angled up to the gameplay camera.
      const thisRun = store.run === model.run && !model.runComplete;
      const text = store.state === 'signed' ? '✓ SIGNED' : store.state === 'dropped' ? 'SIGN HERE' : thisRun ? 'THIS RUN · DELIVER' : `RUN ${store.run + 1}`;
      if (this.mallStoreText.get(store.id) !== text) {
        this.mallStoreText.set(store.id, text);
        this.southgate?.setStatus(index, text, store.state === 'signed' ? '#8fd18a' : store.state === 'dropped' ? '#f2c14e' : thisRun ? '#f0e0b0' : '#9aa4a8');
      }
      const drop = props[`drop-${store.id}`];
      if (store.state !== 'waiting' && !drop) {
        const pile = this.bundle(store.boxes);
        pile.position.set(mallX(store.door.x - 30), 0, mallZ(north ? store.door.y - 30 : store.door.y + 30));
        stage.scene.add(pile);
        props[`drop-${store.id}`] = pile;
      }
    });
    for (const actor of actors.values()) if (actor.root.visible) actor.animate(dt, time, this.reducedMotion);
    const target = skanky.root.position;
    // Kept inside the anchor wall at the concourse's east end.
    const cameraX = Math.min(target.x + 1.0, mallX(1260) - 0.4);
    this.cameraTo(new THREE.Vector3(cameraX, 11.5, target.z + 7.2), new THREE.Vector3(target.x, 0.5, target.z - 1.0), dt, this.mallSnap);
    this.mallSnap = false;
  }

  /**
   * The mall's establishing shots: a crane down from 111 Street and the LRT
   * overpass to the five-ton at the receiving dock, then Skanky looking down
   * the skylit concourse with every wall and roof in place.
   */
  private directMallIntro(stage: Stage, cutscene: Cutscene): void {
    const { props, actors } = stage;
    props.mallFull.visible = true;
    props.mallCut.visible = false;
    const snap = cutscene.index !== this.mallIntroBeat;
    this.mallIntroBeat = cutscene.index;
    props.cart.position.set(mallX(MALL_LAYOUT.cartStart.x), 0, mallZ(MALL_LAYOUT.cartStart.y));
    props.cart.rotation.y = Math.PI / 2;
    const skanky = actors.get('skanky')!;
    skanky.root.visible = true;
    if (cutscene.index === 0) {
      skanky.at(mallX(MALL_LAYOUT.start.x), mallZ(MALL_LAYOUT.start.y));
      skanky.faceAngle = -Math.PI / 2;
      const t = ease(cueProgress(cutscene, 'mall-establish'));
      this.cameraTo(new THREE.Vector3(mix(-60, -34.5, t), mix(14, 5.5, t), mix(18, 4, t)),
        new THREE.Vector3(mix(-38, -19.5, t), mix(4, 1.5, t), mix(-6, 0, t)), this.frameDt, snap);
    } else {
      skanky.at(mallX(440), mallZ(415));
      skanky.faceAngle = Math.PI / 2;
      const t = ease(Math.min(1, cutscene.elapsedMs / 2400));
      this.cameraTo(new THREE.Vector3(mix(-11.0, -10.4, t), mix(3.4, 3.6, t), mix(2.2, 2.0, t)),
        new THREE.Vector3(6, mix(1.6, 2.2, t), -0.6), this.frameDt, snap);
    }
  }

  /** A short "SIGNED" or "DROPPED" pop above a store, for feedback beyond sound. */
  public mallEvent(model: MallModel, event: MallEvent): THREE.Vector3 | null {
    if (!event.storeId) return null;
    const store = model.store(event.storeId);
    return new THREE.Vector3(mallX(store.door.x), 2.6, mallZ(store.door.y));
  }

  /** Clears a previous run's delivered piles so a replay starts clean. */
  public resetMall(): void {
    const stage = this.stages.mall;
    if (!stage) return;
    for (const [name, prop] of Object.entries(stage.props)) {
      if (name.startsWith('drop-')) {
        stage.scene.remove(prop);
        delete stage.props[name];
      }
    }
    this.mallStoreText.clear();
  }

  public beginLot(): void {
    this.active = 'lot';
    this.dawn = 0.7;
    const stage = this.stage('lot');
    this.applySky(stage);
    for (const actor of stage.actors.values()) actor.root.visible = false;
    for (const [name, prop] of Object.entries(stage.props)) if (name.startsWith('car-') || name.startsWith('park-')) prop.visible = false;
    stage.props.gate.position.x = 6.3;
    stage.props.gate.getObjectByName('lock')!.visible = false;
    this.placeCar(stage.props['car-skanky'], -9.5, -5.2, Math.PI / 2);
    const truck = stage.props.fiveTon;
    truck.visible = true;
    truck.position.set(lotX(LOT_LAYOUT.truck.x + LOT_LAYOUT.truck.w / 2), 0, lotZ(LOT_LAYOUT.truck.y + LOT_LAYOUT.truck.h / 2));
    truck.rotation.y = 0;
  }

  public updateLot(model: KeyReturnModel, dt: number, time: number): void {
    const stage = this.stage('lot');
    const skanky = stage.actors.get('skanky')!;
    skanky.root.visible = true;
    skanky.pose = 'keys';
    skanky.at(lotX(model.skanky.x), lotZ(model.skanky.y));
    skanky.faceAngle = { right: Math.PI / 2, left: -Math.PI / 2, down: 0, up: Math.PI }[model.skanky.facing];
    skanky.animate(dt, time, this.reducedMotion);
    stage.puffs.update(dt);
    const target = skanky.root.position;
    this.cameraTo(new THREE.Vector3(target.x + 2, 9, target.z + 9), new THREE.Vector3(target.x + 1, 0.8, target.z - 2), dt);
  }
}

/**
 * The depot's own story beats: the morning scrum at the head of the belt and
 * Shan catching Skanky at clock-out. Actors are the depot's real crew.
 */
export interface DepotCast {
  crew: CrewLife;
  workers: Record<'termite' | 'skanky', Character>;
}

// The huddle fills the clear west lane beside the head of the belt, below the
// receiving feeders, with Shan at its top end facing everyone.
const SCRUM_SPOTS: Record<string, [number, number]> = {
  termite: [366, 214], skanky: [418, 214],
  hussan: [342, 252], aj: [386, 256], ben: [428, 250],
  donna: [336, 292], doris: [368, 296], brian: [402, 292], bannerman: [434, 288],
  fruitloop: [384, 330],
};
const SHAN_SPOT: [number, number] = [392, 166];

export function directDepot(cast: DepotCast, cutscene: Cutscene, dt: number, time: number, reducedMotion: boolean): { position: THREE.Vector3; look: THREE.Vector3 } {
  const { crew, workers } = cast;
  const shan = crew.actor('shan');
  shan.root.visible = true;
  const face = (from: [number, number], to: [number, number]): number => Math.atan2(to[0] - from[0], to[1] - from[1]);
  const placeWorker = (id: 'termite' | 'skanky', x: number, y: number, angle: number, pose: Pose, moving = false): void => {
    const character = workers[id];
    setFromModel(character.root.position, { x, y }, actorSurfaceAt(x, y));
    character.root.rotation.y = angle;
    animateCharacter(character, dt, { moving, time, reducedMotion });
    character.body.rotation.set(0, 0, 0);
    character.head.rotation.set(0, 0, 0);
    applyPose(character, pose, time, reducedMotion);
  };
  if (cutscene.scene.id === 'scrum') {
    const gather = ease(cueProgress(cutscene, 'gather'));
    const turns = cueProgress(cutscene, 'everyone-turns') > 0;
    const furious = cueProgress(cutscene, 'crew-furious') > 0;
    const look = cueProgress(cutscene, 'pair-look') > 0 && cueProgress(cutscene, 'shan-over') <= 0;
    const pair: [number, number] = [392, 214];
    for (const [id, spot] of Object.entries(SCRUM_SPOTS)) {
      const x = spot[0];
      const y = spot[1] + 60 * (1 - gather);
      if (id === 'termite' || id === 'skanky') {
        const other = SCRUM_SPOTS[id === 'termite' ? 'skanky' : 'termite'];
        const angle = look ? face([x, y], other) : face([x, y], SHAN_SPOT);
        placeWorker(id, x, y, angle, 'none', gather > 0 && gather < 1);
        continue;
      }
      if (id === 'ben' && crew.benGone) continue;
      const actor = crew.actor(id);
      crew.hideCrewFreight(id);
      actor.root.visible = true;
      actor.place(x, y);
      actor.faceAngle = gather < 1 ? Math.PI : turns ? face(spot, pair) : face(spot, SHAN_SPOT);
      const pose: Pose = id === 'hussan' && cueProgress(cutscene, 'hands-up') > 0 ? 'shout'
        : furious ? 'swear' : cueProgress(cutscene, 'shrug') > 0 && cueProgress(cutscene, 'shrug') < 1 ? 'shrug' : 'none';
      actor.setPoseAt(pose, time);
    }
    shan.place(SHAN_SPOT[0], SHAN_SPOT[1]);
    shan.faceAngle = face(SHAN_SPOT, [392, 260]);
    const speaking = cutscene.beat.speaker === 'shan';
    shan.setPoseAt(speaking ? 'announce' : 'none', time);
    shan.character.skinMaterial.color.setHex(0xe8b98f);
    crew.animateActors(dt, time, new Set([...Object.keys(SCRUM_SPOTS), 'shan']));
    return {
      position: toWorld({ x: 640, y: 330 }, 6.4),
      look: toWorld({ x: 392, y: 236 }, 1.6),
    };
  }
  // Clock-out: Shan catches Skanky at the belt end; Termite heads down the stairs.
  const leaves = ease(cueProgress(cutscene, 'termite-leaves'));
  const catches = ease(cueProgress(cutscene, 'shan-catches'));
  const endY = DEPOT.dockD.y + 22;
  placeWorker('skanky', 560, endY, face([560, endY], [500, endY - 10]), 'none');
  const exit = alongPath([[400, endY], [365, DEPOT.stairs.centerY], [200, DEPOT.stairs.centerY]], leaves);
  placeWorker('termite', exit.x, exit.z, leaves > 0 ? exit.h : face([400, endY], [500, endY - 10]), 'none', leaves > 0 && leaves < 1);
  // Down the east side of the bulk pallet, never through it.
  shan.place(mix(532, 526, catches), mix(endY - 90, endY + 2, catches));
  shan.faceAngle = Math.PI / 2;
  shan.setPoseAt(cutscene.beat.speaker === 'shan' ? 'announce' : 'none', time);
  crew.animateActors(dt, time, new Set(['shan']));
  return { position: toWorld({ x: 600, y: DEPOT.stairs.centerY - 10 }, 6.0), look: toWorld({ x: 490, y: endY }, 1.6) };
}
