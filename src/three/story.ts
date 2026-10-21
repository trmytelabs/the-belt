import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { LOT_LAYOUT, MALL_LAYOUT, type KeyReturnModel, type MallEvent } from '../game/slice/MallModel';
import type { MallModel3D as MallModel } from './MallModel3D';
import type { Cutscene } from '../game/slice/StoryModel';
import type { StoryScene } from '../game/slice/StoryScript';
import { animateCharacter, blendPose, createCharacter, faceToward, mergeCharacter, snapshotPose, type Character, type CharacterSpec } from './characters';
import { applyPose, type CrewLife, type Pose } from './crew';
import { placeProp, upgradeCar } from './propModels';
import { poseSeated, seatRootPosition, type SeatTargetPoints } from './seating';
import { followWheels, type SeatName, type VehicleContract, type WheelRig } from './vehicleRig';
import { PAVING_TILE, scaleUVs, surfaceMaterial, surfacesLoaded } from './textures';
import { PuffField } from './fx';
import { buildSouthgateMall, mallX, mallZ, type SouthgateMall } from './mall';
import { mergeStatic } from './merge';
import { disposeObject3D } from './resources';
import { physicalBounds } from './collision3d';
import { actorSurfaceAt, setFromModel, shadowed, standard, textPlane, textSprite, toWorld } from './space';
import { RESIDENT_SPECS, SKANKY_SPEC, SKIN, TERMITE_SPEC, VISITORS, createTruck } from './world';
import { DEPOT_3D_LAYOUT as DEPOT } from './layout';
import { snowBank, snowCap, snowField, snowfall, type Snowfall } from './snow';

/**
 * The story's locations away from the depot floor (the UPS lot, the break
 * stops, the road and the mall) and the cutscene staging for every scene.
 * Every pose is a function of how far each cue has progressed, so skipping a
 * scene always lands on its final staging.
 */
export type StageId = 'lot' | 'store' | 'coffee' | 'road' | 'mall' | 'house';

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
  /** A seated passenger can contact their own vehicle; other solids still apply. */
  public seatedIn: THREE.Object3D | null = null;
  /** Which of the vehicle's seats, so the hands and feet find their targets. */
  public seat: SeatName | null = null;
  private readonly previous = new THREE.Vector3();
  private moved = false;
  private heading = 0;

  constructor(character: Character) {
    this.character = character;
  }

  public get root(): THREE.Group { return this.character.root; }

  public at(x: number, z: number, y = 0): void {
    this.seatedIn = null;
    this.seat = null;
    this.previous.copy(this.root.position);
    this.root.position.set(x, y, z);
    const dx = x - this.previous.x;
    const dz = z - this.previous.z;
    this.moved = dx * dx + dz * dz > 1e-6;
    if (this.moved) this.heading = Math.atan2(dx, dz);
  }

  public setPose(pose: Pose, time: number): void {
    if (this.pose !== pose) { snapshotPose(this.character, time); this.pose = pose; this.poseStart = time; }
  }

  public animate(dt: number, time: number, reducedMotion: boolean): void {
    const c = this.character;
    animateCharacter(c, dt, { moving: this.moved, carrying: this.carrying, time, reducedMotion });
    // A seated figure turns with its car; a standing one turns on the spot for a big change of facing.
    if (this.seatedIn) { if (c.motion) c.motion.turn = null; c.root.rotation.y = this.faceAngle ?? c.root.rotation.y; }
    else faceToward(c, this.faceAngle ?? this.heading, dt, this.moved, time);
    if (c.motion) { c.motion.pose = this.pose; c.motion.seated = this.seatedIn !== null; }
    // A posed or seated figure owns its torso; a plain walk keeps the walk cycle's lean and sway.
    if (this.pose !== 'none' || this.seatedIn) c.body.rotation.set(0, 0, 0);
    c.head.rotation.set(0, 0, 0);
    // Smoking/phone gestures are upper-body actions. Preserve the seat's hip
    // height and folded legs so they cannot stand a passenger through the roof.
    if (this.seatedIn) applyPose(c, 'sit', time - this.poseStart, reducedMotion);
    applyPose(c, this.pose, time - this.poseStart, reducedMotion);
    blendPose(c, time);
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
 * Height of a seated figure's root above the procedural car's origin. The
 * body hides the seated legs, and a seated head stays under the roof (inside
 * 1.52 m). A loaded model's contract places the seats instead.
 */
const SEAT_Y = 0.06;
const PLAIN_SEATS: Record<SeatName, THREE.Vector3> = {
  driver: new THREE.Vector3(-0.3, SEAT_Y, 0.36), passenger: new THREE.Vector3(-0.3, SEAT_Y, -0.36),
  rearL: new THREE.Vector3(-0.98, SEAT_Y, -0.34), rearR: new THREE.Vector3(-0.98, SEAT_Y, 0.34),
};

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

/** A small car whose nose points along local +X. With `detailed` off it stays procedural: the road's traffic draws its sedans in batches instead. */
export function createCar(color: number, detailed = true): THREE.Group {
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
  if (detailed) void upgradeCar(car, color);
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
  /** Snow falling outside, wherever this stage shows the outdoors. */
  snow: Snowfall[];
}

/** Model pixels in the lot's key-return area map onto the lot stage's metres. */
const lotX = (x: number): number => (x - 480) / 32;
const lotZ = (y: number): number => (y - 140) / 32 - 13.5;

/** Tim Hortons seating: the booths' centre line, each bench's depth position and the crew's table. */
const BOOTH_X = 3.4;
const BOOTHS = { north: -1.45, south: 0.25, next: 1.15, table: -0.6 } as const;
const TABLE_TOP = 0.76;

/** The living room's indoor camera angles. */
const HOUSE_VIEWS = {
  door: { position: new THREE.Vector3(-4.0, 2.15, 3.3), look: new THREE.Vector3(2.4, 0.95, 0.1) },
  room: { position: new THREE.Vector3(3.9, 2.2, 3.4), look: new THREE.Vector3(-1.8, 0.95, -0.9) },
} as const;

/** What the house's windows show: a snowy street at night, flakes in the air. */
function snowyWindow(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, 44);
  sky.addColorStop(0, '#0e1a30'); sky.addColorStop(1, '#2a3e5e');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 128, 64);
  // Neighbours' roofs under snow, a lit window, then the snowy yard.
  ctx.fillStyle = '#1a2436';
  ctx.fillRect(8, 26, 40, 20); ctx.fillRect(74, 22, 46, 24);
  ctx.fillStyle = '#e8eef4';
  ctx.fillRect(6, 23, 44, 4); ctx.fillRect(72, 19, 50, 4);
  ctx.fillStyle = '#f0c070'; ctx.fillRect(86, 30, 8, 7);
  ctx.fillStyle = '#e4ebf2'; ctx.fillRect(0, 44, 128, 20);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 70; i += 1) ctx.fillRect((i * 37) % 128, (i * 23) % 44, 1.5, 1.5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class StoryStage {
  public readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
  public active: StageId | null = null;
  private readonly quality: 'high' | 'low';
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly stages: Partial<Record<StageId, Stage>> = {};
  /** The night outside, as reflections and ambient for every stage scene. */
  private environment: { texture: THREE.Texture; intensity: number } | null = null;
  private readonly cameraLook = new THREE.Vector3();
  private frameDt = 1 / 60;
  private dawn = 0;
  private roadTravel = 0;
  /** The road scrolls past a parked truck, so its snow is carried backwards at the truck's speed. */
  private roadWind = 0;
  private mallStoreText = new Map<string, string>();
  private southgate: SouthgateMall | null = null;
  private mallIntroBeat = -1;
  private mallSnap = false;
  private houseLights: { lamp: THREE.PointLight; tvGlow: THREE.PointLight; sun: THREE.DirectionalLight } | null = null;
  private houseOutside = false;
  private houseCloseUp = false;

  constructor(quality: 'high' | 'low') {
    this.quality = quality;
  }

  public get scene(): THREE.Scene | null {
    return this.active ? this.stage(this.active).scene : null;
  }

  public geometrySnapshot(): { actors: { id: string; bounds: THREE.Box3 }[]; props: { id: string; bounds: THREE.Box3 }[] } {
    if (!this.active) return { actors: [], props: [] };
    const stage = this.stage(this.active);
    return {
      actors: [...stage.actors].filter(([, actor]) => actor.root.visible).map(([id, actor]) => ({ id, bounds: physicalBounds(actor.root) })),
      props: Object.entries(stage.props).filter(([, prop]) => prop.visible).map(([id, prop]) => ({ id, bounds: physicalBounds(prop) })),
    };
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
      stage.puffs.clear();
      for (const actor of stage.actors.values()) {
        actor.root.visible = false;
        actor.pose = 'none';
        actor.faceAngle = null;
        actor.carrying = false;
      }
      if (id === 'mall') this.mallStoreText.clear();
    }
  }

  public dispose(): void {
    this.end();
    for (const stage of Object.values(this.stages)) {
      stage.puffs.dispose();
      disposeObject3D(stage.scene);
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

  /** Gives every stage scene, built or still to build, the same environment map. */
  public setEnvironment(texture: THREE.Texture, intensity: number): void {
    this.environment = { texture, intensity };
    for (const stage of Object.values(this.stages)) {
      if (!stage) continue;
      stage.scene.environment = texture;
      stage.scene.environmentIntensity = intensity;
    }
  }

  private stage(id: StageId): Stage {
    let stage = this.stages[id];
    if (stage) return stage;
    const scene = new THREE.Scene();
    if (this.environment) {
      scene.environment = this.environment.texture;
      scene.environmentIntensity = this.environment.intensity;
    }
    stage = { scene, actors: new Map(), props: {}, puffs: new PuffField(scene), snow: [] };
    this.stages[id] = stage;
    if (id === 'lot') this.buildLot(stage);
    else if (id === 'store') this.buildStore(stage);
    else if (id === 'coffee') this.buildCoffee(stage);
    else if (id === 'road') this.buildRoad(stage);
    else if (id === 'house') this.buildHouse(stage);
    else this.buildMall(stage);
    for (const flakes of stage.snow) scene.add(flakes.points);
    const dynamic = new Set<THREE.Object3D>([...stage.actors.values()].map((actor) => actor.root));
    for (const [name, prop] of Object.entries(stage.props)) {
      prop.name = name;
      dynamic.add(prop);
    }
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
    // The environment map now carries part of the ambient, so the sky light eases
    // off and the moon's shadow softens: the lot read as flat and hard-edged.
    scene.add(new THREE.HemisphereLight(0xb4c7df, 0x485568, 1.05));
    const key = new THREE.DirectionalLight(0xc8d6ff, 0.9);
    key.position.set(-8, 16, 10);
    key.castShadow = this.quality === 'high';
    key.shadow.mapSize.setScalar(2048);
    key.shadow.radius = 3;
    key.shadow.normalBias = 0.03;
    const s = key.shadow.camera;
    s.left = -24; s.right = 24; s.top = 24; s.bottom = -24;
    scene.add(key);
  }

  private buildLot(stage: Stage): void {
    const { scene, props } = stage;
    this.night(scene, 0x0b1520);
    // A snowy Christmas night: the street, the gate apron and the lot are plowed; the rest is under snow.
    scene.add(snowField(90, 70, 0, 0, -0.01));
    // Plowed asphalt with snow worked into the grain: a CC0 photo set, tinted to the old wet colour.
    const paved = surfacesLoaded();
    const wet = surfaceMaterial('asphalt', { color: 0x262c30, roughness: 0.7 });
    for (const [x0, x1, z0, z1] of [[-45, 45, 2.2, 13.5], [-3.6, 3.6, -0.3, 2.2], [-24, 24, -13.9, -0.3]] as const) {
      const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      if (paved) scaleUVs(geometry, (x1 - x0) / PAVING_TILE, (z1 - z0) / PAVING_TILE);
      const asphalt = new THREE.Mesh(geometry, wet);
      asphalt.rotation.x = -Math.PI / 2;
      asphalt.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      asphalt.receiveShadow = true;
      scene.add(asphalt);
    }
    // Plowed banks along the fence, across the street and down both sides of the lot.
    for (const [x, z, length, turn] of [[-15, 1.1, 21, 0], [15, 1.1, 21, 0], [0, 15.4, 88, 0], [-25.2, -7, 13, Math.PI / 2], [25.2, -7, 13, Math.PI / 2]] as const) {
      const bank = snowBank(length, 1.4, 0.6);
      bank.position.set(x, 0, z);
      bank.rotation.y = turn;
      scene.add(bank);
    }
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
    props.lotBuilding = building;
    const roofSnow = snowCap(50.2, 8.2, 0.24);
    roofSnow.position.set(0, 8.12, -18);
    scene.add(roofSnow);
    stage.snow.push(snowfall([-30, 0, -16], [30, 12, 18], { count: this.quality === 'high' ? 3500 : 900, size: 0.1 }));
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
    const models = this.quality === 'high';
    for (const [from, to] of [[-26, -3.2], [3.2, 26]] as const) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(to - from, 2.2), link);
      panel.position.set((from + to) / 2, 1.1, 0);
      scene.add(panel);
      props[from < 0 ? 'fence-west' : 'fence-east'] = panel;
      if (models) {
        // Twelve photographed chain-link panels and their posts stand in for the drawn run.
        const bays = 12;
        const bay = (to - from) / bays;
        for (let i = 0; i < bays; i += 1) {
          const slot = new THREE.Group();
          slot.position.set(from + bay * (i + 0.5), 0, 0);
          void placeProp(slot, 'chainlink-panel', { fallback: i === 0 ? panel : undefined, size: { x: bay - 0.04, y: 2.2 } });
          scene.add(slot);
        }
        for (let i = 0; i <= bays; i += 1) {
          const slot = new THREE.Group();
          slot.position.set(from + bay * i, 0, 0);
          void placeProp(slot, 'chainlink-post', { size: { y: 2.4 } });
          scene.add(slot);
        }
      } else {
        for (let x = from; x <= to; x += 2.6) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), post);
          pole.position.set(x, 1.2, 0);
          scene.add(pole);
        }
      }
    }
    const gate = new THREE.Group();
    const gatePanel = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.2), link);
    gatePanel.position.y = 1.1;
    if (models) {
      // The sliding gate carries three of the same panels inside its frame.
      for (const x of [-2.13, 0, 2.13]) {
        const slot = new THREE.Group();
        slot.position.set(x, 0, 0);
        void placeProp(slot, 'chainlink-panel', { fallback: x === 0 ? gatePanel : undefined, size: { x: 2.1, y: 2.1 } });
        gate.add(slot);
      }
    }
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
    // Streetlights: a photographed lamp post on GPU renderers, over the drawn pole and head.
    for (const x of [-14, 0, 14]) {
      const fixture = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), post);
      pole.position.set(0, 3, 0);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffc070, emissiveIntensity: 3 }));
      lamp.position.set(0, 6, -0.5);
      fixture.add(pole, lamp);
      fixture.position.set(x, 0, 11.5);
      scene.add(fixture);
      if (models) {
        const slot = new THREE.Group();
        slot.position.set(x, 0, 11.5);
        slot.rotation.y = Math.PI;
        void placeProp(slot, 'street-lamp', { fallback: fixture, size: { y: 6.6 } });
        scene.add(slot);
      }
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
    for (const [x, z, w, d] of [[0, -7, 16, 0.2], [-8, 0, 0.2, 14]] as const) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), wall);
      panel.position.set(x, 2, z);
      scene.add(panel);
    }
    // The east wall has a window onto the snowy street.
    for (const [y, z, h, d] of [[0.5, 0, 1, 14], [3.3, 0, 1.4, 14], [1.8, -6.25, 1.6, 1.5], [1.8, 3.75, 1.6, 6.5]] as const) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, d), wall);
      panel.position.set(8, y, z);
      scene.add(panel);
    }
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.6), new THREE.MeshStandardMaterial({ color: 0x9cb6c8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false }));
    pane.rotation.y = -Math.PI / 2;
    pane.position.set(7.95, 1.8, -2.5);
    scene.add(pane);
    scene.add(snowField(30, 24, 23, 0, -0.02));
    const street = new THREE.PointLight(0xffc080, 14, 16, 1.5);
    street.position.set(13, 4.5, -2.5);
    scene.add(street);
    stage.snow.push(snowfall([8.3, 0, -10], [26, 8, 6], { count: this.quality === 'high' ? 1200 : 350, size: 0.08 }));
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

  /**
   * Inside a Tim Hortons on a snowy Christmas night: the counter and menu
   * boards along the back wall, two booths by the side windows, and Skanky's
   * car parked in the snow outside.
   */
  private buildCoffee(stage: Stage): void {
    const { scene, props } = stage;
    scene.background = new THREE.Color(0x0b1520);
    scene.add(new THREE.HemisphereLight(0xfff1dc, 0x4a3a2e, 1.05));
    // Brown and cream floor tiles.
    const tiles = document.createElement('canvas');
    tiles.width = tiles.height = 64;
    const tctx = tiles.getContext('2d')!;
    tctx.fillStyle = '#c9b292'; tctx.fillRect(0, 0, 64, 64);
    tctx.fillStyle = '#8a6646'; tctx.fillRect(0, 0, 32, 32); tctx.fillRect(32, 32, 32, 32);
    const tileTexture = new THREE.CanvasTexture(tiles);
    tileTexture.wrapS = tileTexture.wrapT = THREE.RepeatWrapping;
    tileTexture.repeat.set(9, 7);
    tileTexture.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 13), new THREE.MeshStandardMaterial({ map: tileTexture, roughness: 0.45 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -0.5;
    floor.receiveShadow = true;
    scene.add(floor);
    // Walls: cream above a dark wood wainscot. The window wall (east) is built round its glass.
    const cream = standard(0xe9dcc4, 0.85);
    const wood = standard(0x5a3826, 0.6);
    const wall = (x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material = cream): void => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      panel.position.set(x, y, z);
      scene.add(panel);
    };
    wall(0, 2, -7, 16, 4, 0.2);
    wall(0, 0.55, -6.88, 16, 1.1, 0.06, wood);
    wall(-8, 2, -0.5, 0.2, 4, 13);
    wall(-7.88, 0.55, -0.5, 0.06, 1.1, 13, wood);
    wall(8, 0.45, -0.5, 0.2, 0.9, 13, wood);
    wall(8, 3.3, -0.5, 0.2, 1.4, 13);
    wall(8, 1.75, -6.4, 0.2, 1.7, 1.2); wall(8, 1.75, 5.4, 0.2, 1.7, 1.2);
    for (const z of [-3.2, 0, 3.2]) wall(8, 1.75, z, 0.2, 1.7, 0.16, wood);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.7), new THREE.MeshStandardMaterial({ color: 0x9cb6c8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false }));
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(7.95, 1.75, -0.5);
    scene.add(glass);
    // A red band and the sign over the counter, and the menu boards.
    const red = new THREE.Mesh(new THREE.BoxGeometry(16, 0.22, 0.05), standard(0xb0221c, 0.6));
    red.position.set(0, 3.75, -6.86);
    scene.add(red);
    const sign = textPlane(['TIM HORTONS'], 4.6, 0.62, { width: 400, height: 54, background: '#f4efe6', color: '#b0221c', radius: 8 });
    sign.position.set(-2.6, 3.35, -6.86);
    scene.add(sign);
    const menus: [number, string[]][] = [
      [-5.6, ['COFFEE', 'DOUBLE-DOUBLE · 2.29', 'FRENCH VANILLA · 2.49', 'STEEPED TEA · 1.99']],
      [-2.6, ['DONUTS', 'HONEY DIP · 1.59', 'DOZEN · 13.49', 'TIMBITS 20 · 5.99']],
      [0.4, ['BREAKFAST', "FARMER'S WRAP · 4.99", 'BAGEL B.E.L.T. · 6.49', 'HOT CHOC · 2.39']],
    ];
    for (const [x, lines] of menus) {
      const board = textPlane(lines, 2.6, 1.2, { width: 300, height: 140, background: '#2a1a12', color: '#f3e3c4', radius: 6 });
      board.position.set(x, 2.45, -6.86);
      scene.add(board);
    }
    // The service counter, with the donut case and two registers; brewers behind it.
    const counter = rounded(7.4, 1.05, 0.9, wood, 0.04);
    counter.position.set(-2.4, 0.525, -5.0);
    const top = rounded(7.5, 0.06, 1.0, standard(0xd8cdb8, 0.35), 0.02);
    top.position.set(-2.4, 1.08, -5.0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.42, 0.12, 0.02), standard(0xb0221c, 0.6));
    stripe.position.set(-2.4, 0.86, -4.54);
    scene.add(counter, top, stripe);
    for (const x of [-1.2, 0.2]) {
      const register = rounded(0.5, 0.3, 0.42, standard(0x222428, 0.4), 0.04);
      register.position.set(x, 1.26, -5.1);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), new THREE.MeshStandardMaterial({ color: 0x102030, emissive: 0x60b0ff, emissiveIntensity: 0.7 }));
      screen.position.set(x, 1.48, -4.95);
      screen.rotation.x = -0.4;
      scene.add(register, screen);
    }
    const caseGlass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: 0xcfe6f0, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }));
    caseGlass.position.set(-4.6, 1.46, -5.0);
    scene.add(caseGlass);
    const glazes = [0xc08040, 0x6a3a1e, 0xf2d8e2, 0xe8c070, 0x8a4a2a, 0xf4efe6];
    for (let i = 0; i < 24; i += 1) {
      const donut = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.035, 6, 12), standard(glazes[i % glazes.length], 0.55));
      donut.rotation.x = Math.PI / 2;
      donut.position.set(-5.65 + (i % 8) * 0.3, 1.18 + Math.floor(i / 8) * 0.22, -5.0 + (Math.floor(i / 8) % 2) * 0.12);
      scene.add(donut);
    }
    const back = rounded(7.4, 0.95, 0.6, standard(0x7a7e82, 0.4, 0.4), 0.03);
    back.position.set(-2.4, 0.475, -6.5);
    scene.add(back);
    for (const x of [-5.4, -4.2, -3.0]) {
      const brewer = rounded(0.55, 0.75, 0.45, standard(0x2c2e30, 0.35, 0.5), 0.04);
      brewer.position.set(x, 1.33, -6.5);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 12), standard(0xb0221c, 0.5));
      pot.position.set(x, 1.06, -6.25);
      scene.add(brewer, pot);
    }
    // Two pairs of booths by the windows; the crew's is nearer the counter.
    const vinyl = standard(0x8a2420, 0.6);
    const booth = (z: number, facing: 1 | -1): THREE.Mesh => {
      const seat = rounded(1.9, 0.45, 0.55, vinyl, 0.06);
      seat.position.set(BOOTH_X, 0.225, z);
      const rest = rounded(1.9, 0.75, 0.16, vinyl, 0.05);
      rest.position.set(BOOTH_X, 0.8, z - facing * 0.3);
      scene.add(shadowed(seat), shadowed(rest));
      return seat;
    };
    const table = (z: number): void => {
      const slab = rounded(1.8, 0.05, 0.85, standard(0xd8cdb8, 0.4), 0.02);
      slab.position.set(BOOTH_X, TABLE_TOP - 0.025, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, TABLE_TOP - 0.03, 10), standard(0x3a3a3a, 0.4, 0.6));
      post.position.set(BOOTH_X, (TABLE_TOP - 0.03) / 2, z);
      scene.add(shadowed(slab), post);
    };
    props.boothNorth = booth(BOOTHS.north, 1);
    props.boothSouth = booth(BOOTHS.south, -1);
    props.nextBooth = booth(BOOTHS.next, 1);
    booth(2.85, -1);
    table(BOOTHS.table);
    table(2.0);
    // A Christmas tree in the corner by the window.
    const tree = new THREE.Group();
    const needles = standard(0x1f5a32, 0.8);
    for (const [r, h, y] of [[0.8, 1.0, 0.6], [0.62, 0.85, 1.15], [0.42, 0.7, 1.62]] as const) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), needles);
      tier.position.y = y;
      tree.add(tier);
    }
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshStandardMaterial({ color: 0xffe080, emissive: 0xffd040, emissiveIntensity: 1.6 }));
    star.position.y = 2.05;
    tree.add(star);
    const baubles = [0xd02a2a, 0xf2c14e, 0x3a7ad0, 0xe8e8e8];
    for (let i = 0; i < 16; i += 1) {
      const angle = i * 2.4;
      const y = 0.45 + (i % 8) * 0.17;
      const radius = 0.75 - (y - 0.3) * 0.38;
      const bauble = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: baubles[i % 4], emissive: baubles[i % 4], emissiveIntensity: 0.4 }));
      bauble.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      tree.add(bauble);
    }
    tree.position.set(6.9, 0, -5.7);
    scene.add(tree);
    if (this.quality === 'high') {
      // A wall clock over the counter, between the menu boards and the window wall.
      const slot = new THREE.Group();
      slot.position.set(3.2, 2.42, -6.84);
      void placeProp(slot, 'wall-clock', { size: { y: 0.4 } });
      scene.add(slot);
    }
    const ceiling = new THREE.PointLight(0xfff0d8, 16, 16, 1.4);
    ceiling.position.set(-1.5, 3.6, -2.5);
    const boothLight = new THREE.PointLight(0xffd8a0, 9, 8, 1.5);
    boothLight.position.set(BOOTH_X, 2.6, 0.4);
    scene.add(ceiling, boothLight);
    // Outside the windows: snow, the lot's lamp, and Skanky's car.
    scene.add(snowField(40, 30, 22, -0.5, -0.02));
    for (const z of [-8, 7]) {
      const bank = snowBank(10, 1.6, 0.7);
      bank.position.set(16, 0, z);
      scene.add(bank);
    }
    const lotLamp = new THREE.PointLight(0xffc080, 18, 18, 1.5);
    lotLamp.position.set(13, 5, 0);
    scene.add(lotLamp);
    const car = createCar(0x8f3f34);
    car.position.set(11.5, 0, 0.4);
    car.rotation.y = Math.PI / 2;
    scene.add(car);
    props.car = car;
    stage.snow.push(snowfall([8.3, 0, -12], [34, 9, 12], { count: this.quality === 'high' ? 1800 : 500, size: 0.08 }));
    // The tray of coffees and the donut box on the crew's table.
    const tray = new THREE.Group();
    const cardboard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), standard(0xa88a60, 0.9));
    tray.add(cardboard);
    for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.2, 10), standard(0xb0221c, 0.6));
      cup.position.set(x, 0.12, z);
      tray.add(cup);
    }
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
    this.cast(stage, ['termite', 'skanky', 'kylie', 'doris', 'brian', 'cashier']);
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
    scene.add(snowField(120, 60, 0, 0, -0.01));
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
      const roofSnow = snowCap(8.1, 6.1, 0.2);
      roofSnow.position.set(x + 3, building.geometry.parameters.height + 0.1, -14);
      passing.add(roofSnow);
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffc070, emissiveIntensity: (i % 3) * 0.5 }));
      lit.position.set(x + 2, 2, -10.98);
      passing.add(pole, lamp, building, lit);
    }
    // Plowed banks line both sides of the road.
    for (const z of [-4.7, 4.7]) {
      const bank = snowBank(120, 1.3, 0.55);
      bank.position.set(0, 0, z);
      passing.add(bank);
    }
    passing.userData.keep = true;
    scene.add(passing);
    props.passing = passing;
    stage.snow.push(snowfall([-26, 0, -12], [26, 10, 12], { count: this.quality === 'high' ? 3000 : 800, size: 0.1 }));
    const light = new THREE.PointLight(0xffb060, 28, 30, 1.5);
    light.position.set(0, 6, -2);
    scene.add(light);
    const truck = createTruck('5 TON', 0x5a4632, 0x4a3a2a, 'right');
    scene.add(truck);
    props.truck = truck;
  }

  /** Termite and Skanky's living room, with the driveway and Skanky's car outside the side door. */
  private buildHouse(stage: Stage): void {
    const { scene, props } = stage;
    this.night(scene, 0x0a121c);
    // Snow on the lawns; the driveway and the street are shovelled and plowed.
    const grass = snowField(60, 50, 0, 0, -0.02);
    const driveway = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 16), standard(0x3a3e40, 0.9));
    driveway.rotation.x = -Math.PI / 2; driveway.position.set(9.3, -0.01, 3); driveway.receiveShadow = true;
    const street = new THREE.Mesh(new THREE.PlaneGeometry(60, 7), standard(0x25292b, 0.95));
    street.rotation.x = -Math.PI / 2; street.position.set(0, -0.005, 13.5);
    scene.add(grass, driveway, street);
    // Wood floor with plank lines.
    const planks = document.createElement('canvas');
    planks.width = planks.height = 128;
    const pctx = planks.getContext('2d')!;
    pctx.fillStyle = '#7a5434'; pctx.fillRect(0, 0, 128, 128);
    pctx.fillStyle = '#6a4629';
    for (let i = 0; i < 8; i += 1) pctx.fillRect(0, i * 16, 128, 2);
    const plankTexture = new THREE.CanvasTexture(planks);
    plankTexture.wrapS = plankTexture.wrapT = THREE.RepeatWrapping;
    plankTexture.repeat.set(4, 4);
    plankTexture.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ map: plankTexture, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.005; floor.receiveShadow = true;
    scene.add(floor);
    // A closed room: painted walls inside, siding outside, a ceiling, skirting
    // and crown molding. The back and front walls have windows, the east wall the door.
    const paint = standard(0xcdbf9f, 0.9);
    const siding = standard(0x5d6a72, 0.9);
    const trim = standard(0xebe5d6, 0.6);
    const wall = (x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material = paint): void => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      panel.position.set(x, y, z);
      scene.add(shadowed(panel));
    };
    // Each wall is solid up to its openings: the back window spans x -0.25..2.65,
    // the side door z 0.8..2.0; the walls meet at the corners (±5.08, ±4.08).
    wall(-2.665, 1.4, -4, 4.83, 2.8, 0.16); wall(3.865, 1.4, -4, 2.43, 2.8, 0.16);
    wall(1.2, 0.5, -4, 2.9, 1.0, 0.16); wall(1.2, 2.65, -4, 2.9, 0.3, 0.16);
    wall(-5, 1.4, 0, 0.16, 2.8, 8.16);
    wall(5, 1.4, -1.64, 0.16, 2.8, 4.88); wall(5, 1.4, 3.04, 0.16, 2.8, 2.08); wall(5, 2.4, 1.4, 0.16, 0.8, 1.2);
    // The east wall's outside face, seen from the driveway.
    for (const [y, z, h, d] of [[1.4, -1.64, 2.8, 4.88], [1.4, 3.04, 2.8, 2.08], [2.4, 1.4, 0.8, 1.2]] as const) wall(5.09, y, z, 0.02, h, d, siding);
    // The front wall: siding and a lit window outside, paint and a curtained window inside.
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(10.16, 2.8, 0.16), siding);
    frontWall.position.set(0, 1.4, 4);
    const frontWindow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshStandardMaterial({ color: 0x40301c, emissive: 0xffc27a, emissiveIntensity: 0.9 }));
    frontWindow.position.set(-1.5, 0.15, 0.09);
    frontWall.add(frontWindow);
    scene.add(frontWall);
    props.frontWall = frontWall;
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.8), paint);
    inner.rotation.y = Math.PI;
    inner.position.set(0, 1.4, 3.915);
    scene.add(inner);
    // The ceiling faces down only, so the roof still shows from outside.
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(10.16, 8.16), standard(0xf0ebe0, 0.9));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 2.8, 0);
    const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 18), new THREE.MeshStandardMaterial({ color: 0xf4ecd8, emissive: 0xffe2b0, emissiveIntensity: 0.5 }));
    fixture.position.set(0, 2.76, 0);
    scene.add(ceiling, fixture);
    // Skirting and crown molding round the room; the skirting breaks for the door.
    for (const [x, z, w, d] of [[0, -3.9, 9.84, 0.04], [0, 3.9, 9.84, 0.04], [-4.9, 0, 0.04, 7.84], [4.9, -1.56, 0.04, 4.72], [4.9, 2.96, 0.04, 1.92]] as const) {
      const skirting = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), trim);
      skirting.position.set(x, 0.06, z);
      scene.add(skirting);
    }
    for (const [x, z, w, d] of [[0, -3.89, 9.84, 0.06], [0, 3.89, 9.84, 0.06], [-4.89, 0, 0.06, 7.84], [4.89, 0, 0.06, 7.84]] as const) {
      const crown = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), trim);
      crown.position.set(x, 2.75, z);
      scene.add(crown);
    }
    // Trim round the side door.
    for (const [y, z, h, d] of [[1.07, 0.78, 2.14, 0.12], [1.07, 2.02, 2.14, 0.12], [2.16, 1.4, 0.08, 1.36]] as const) {
      const casing = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, d), trim);
      casing.position.set(4.9, y, z);
      scene.add(casing);
    }
    const roof = new THREE.Group();
    for (const side of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(11, 0.18, 5.0), standard(0x3a2c2a, 0.9));
      slope.position.set(0, 3.55, side * 2.2);
      slope.rotation.x = side * 0.38;
      const roofSnow = snowCap(11.1, 5.05, 0.12);
      roofSnow.position.y = 0.14;
      slope.add(roofSnow);
      roof.add(slope);
    }
    roof.visible = false;
    scene.add(roof);
    props.roof = roof;
    // The back window looks out on the snowy yard: night, then morning.
    const view = snowyWindow();
    const backWindow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.5), new THREE.MeshStandardMaterial({ color: 0x8090a8, map: view, emissiveMap: view, emissive: 0x8a9ab8, emissiveIntensity: 0.6 }));
    backWindow.position.set(1.2, 1.75, -3.95);
    scene.add(backWindow);
    props.backWindow = backWindow;
    const frontView = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshStandardMaterial({ color: 0x8090a8, map: view, emissiveMap: view, emissive: 0x8a9ab8, emissiveIntensity: 0.6 }));
    frontView.rotation.y = Math.PI;
    frontView.position.set(-1.5, 1.55, 3.9);
    scene.add(frontView);
    // Frames, sills, rods and curtains on both windows.
    const curtain = standard(0x7a2a2a, 0.95);
    for (const [cx, cy, w, h, z, facing] of [[1.2, 1.75, 2.9, 1.5, -3.9, 1], [-1.5, 1.55, 2.2, 1.1, 3.86, -1]] as const) {
      for (const [x, y, fw, fh] of [[cx, cy + h / 2 + 0.03, w + 0.12, 0.06], [cx, cy - h / 2 - 0.03, w + 0.12, 0.06], [cx - w / 2 - 0.03, cy, 0.06, h], [cx + w / 2 + 0.03, cy, 0.06, h], [cx, cy, 0.04, h]] as const) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.05), trim);
        frame.position.set(x, y, z);
        scene.add(frame);
      }
      const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.04, 0.16), trim);
      sill.position.set(cx, cy - h / 2 - 0.07, z + facing * 0.06);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, w + 1.0, 8), standard(0x3a2a20, 0.5, 0.4));
      rod.rotation.z = Math.PI / 2;
      rod.position.set(cx, cy + h / 2 + 0.2, z + facing * 0.08);
      scene.add(sill, rod);
      for (const side of [-1, 1]) {
        const drape = rounded(0.42, h + 0.55, 0.08, curtain, 0.03);
        drape.position.set(cx + side * (w / 2 + 0.18), cy + 0.02, z + facing * 0.1);
        scene.add(shadowed(drape));
      }
    }
    // The side door swings open on the way out.
    const door = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.1, 1.16), standard(0x5a3a24, 0.7));
    slab.position.set(0, 1.05, 0.58);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), standard(0xd4b060, 0.3, 0.8));
    knob.position.set(-0.06, 1.0, 1.0);
    door.add(slab, knob);
    door.position.set(4.97, 0, 0.82);
    scene.add(door);
    props.door = door;
    for (const [x, z, length, turn] of [[12.8, 2.5, 13, Math.PI / 2], [-12, 10.4, 34, 0], [20, 10.4, 15, 0]] as const) {
      const bank = snowBank(length, 1.2, 0.5);
      bank.position.set(x, 0, z);
      bank.rotation.y = turn;
      scene.add(bank);
    }
    // Snow falls all round the house. The living room is an open-fronted set
    // seen from the yard, so directHouse shows it only for outdoor shots.
    const flakes = this.quality === 'high' ? 1 : 0.3;
    for (const [min, max, count] of [
      [[5.3, 0, -14], [26, 9, 18], 1300], [[-26, 0, 4.3], [5.3, 9, 18], 1300],
      [[-26, 0, -22], [5.3, 9, -4.3], 900], [[-26, 0, -4.3], [-5.3, 9, 4.3], 300],
    ] as [[number, number, number], [number, number, number], number][]) {
      stage.snow.push(snowfall(min, max, { count: Math.round(count * flakes), size: 0.08 }));
    }
    const porch = new THREE.PointLight(0xffd49a, 14, 9, 1.6);
    porch.position.set(5.6, 2.6, 1.4);
    scene.add(porch);
    this.furnishHouse(scene);
    // TV stand, TV and the Wii.
    const tvStand = rounded(0.5, 0.5, 1.9, standard(0x2a2522, 0.7), 0.03);
    tvStand.position.set(-4.62, 0.25, 0);
    const tv = rounded(0.12, 1.0, 1.7, standard(0x101214, 0.4), 0.03);
    tv.position.set(-4.72, 1.1, 0);
    scene.add(tvStand, tv);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.9), new THREE.MeshBasicMaterial({ map: this.tvTexture('menu') }));
    screen.position.set(-4.655, 1.1, 0);
    screen.rotation.y = Math.PI / 2;
    screen.userData.menu = screen.material.map;
    screen.userData.game = this.tvTexture('game');
    screen.userData.movie = this.tvTexture('movie');
    scene.add(screen);
    props.tvScreen = screen;
    const wii = rounded(0.21, 0.05, 0.16, standard(0xf2f2ee, 0.3), 0.012);
    wii.position.set(-4.55, 0.525, 0.55);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.012, 0.12), new THREE.MeshStandardMaterial({ color: 0x0c3a66, emissive: 0x3aa0ff, emissiveIntensity: 1.6 }));
    slot.position.set(-4.443, 0.53, 0.55);
    const sensor = rounded(0.04, 0.03, 0.24, standard(0x15171a, 0.4), 0.01);
    sensor.position.set(-4.68, 1.62, 0);
    scene.add(wii, slot, sensor);
    // The couch faces the TV: a photographed sofa on GPU renderers, over the drawn one.
    const models = this.quality === 'high';
    const fabric = standard(0x46566a, 0.95);
    const couch = new THREE.Group();
    const seat = rounded(0.9, 0.42, 2.3, fabric, 0.08);
    seat.position.set(0.6, 0.21, 0);
    const back = rounded(0.26, 0.6, 2.3, fabric, 0.08);
    back.position.set(1.0, 0.7, 0);
    couch.add(shadowed(seat), shadowed(back));
    for (const z of [-1.24, 1.24]) {
      const arm = rounded(0.9, 0.62, 0.22, fabric, 0.08);
      arm.position.set(0.6, 0.31, z);
      couch.add(shadowed(arm));
    }
    scene.add(couch);
    props.couch = seat;
    if (models) {
      const slot = new THREE.Group();
      slot.position.set(0.7, 0, 0);
      slot.rotation.y = -Math.PI / 2;
      void placeProp(slot, 'sofa', { fallback: couch, size: { x: 2.3, y: 0.76 } });
      scene.add(slot);
    }
    const coffeeTable = new THREE.Group();
    const table = rounded(0.62, 0.06, 1.2, standard(0x6b4a30, 0.6), 0.02);
    table.position.set(-1.55, 0.4, 0);
    coffeeTable.add(table);
    for (const [x, z] of [[-1.8, -0.52], [-1.3, -0.52], [-1.8, 0.52], [-1.3, 0.52]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.38, 0.05), standard(0x4a3220, 0.6));
      leg.position.set(x, 0.19, z);
      coffeeTable.add(leg);
    }
    scene.add(coffeeTable);
    if (models) {
      const slot = new THREE.Group();
      slot.position.set(-1.55, 0, 0);
      slot.rotation.y = Math.PI / 2;
      void placeProp(slot, 'coffee-table', { fallback: coffeeTable, size: { x: 1.2, y: 0.42 } });
      scene.add(slot);
    }
    // Skanky's Warsteiner keg behind the couch, with its tap.
    const keg = new THREE.Group();
    const steel = standard(0xb8bec4, 0.28, 0.85);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.58, 24), steel);
    barrel.position.y = 0.31;
    keg.add(barrel);
    for (const y of [0.04, 0.58]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.212, 0.014, 6, 24), steel);
      rib.rotation.x = Math.PI / 2;
      rib.position.y = y;
      keg.add(rib);
    }
    // A tall label wrapping the barrel three times, so the name always faces the camera.
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 1536;
    labelCanvas.height = 480;
    const lctx = labelCanvas.getContext('2d')!;
    lctx.fillStyle = '#163d26'; lctx.fillRect(0, 0, 1536, 480);
    lctx.fillStyle = '#d8b25a'; lctx.fillRect(0, 22, 1536, 14); lctx.fillRect(0, 444, 1536, 14);
    lctx.fillStyle = '#fbf2d6'; lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
    lctx.font = 'bold 118px Georgia, "Times New Roman", serif';
    for (const x of [256, 768, 1280]) lctx.fillText('WARSTEINER', x, 250, 470);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    labelTexture.anisotropy = 4;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.42, 36, 1, true), new THREE.MeshStandardMaterial({
      map: labelTexture, emissiveMap: labelTexture, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.55 }));
    band.position.y = 0.31;
    // Centre one name between the room and couch camera angles.
    band.rotation.y = 0.87;
    const coupler = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 12), standard(0x2a2c2e, 0.4, 0.6));
    coupler.position.y = 0.64;
    const hose = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 16, Math.PI), standard(0x1a1a1a, 0.6));
    hose.position.set(0.16, 0.64, 0);
    const tap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), standard(0x1a1a1a, 0.5));
    tap.position.set(0.32, 0.6, 0);
    keg.add(band, coupler, hose, tap);
    keg.position.set(-0.5, 0, -2.1);
    scene.add(shadowed(keg));
    // A bag of Hershey's Eggies on the table; the eggs spill out once it's open.
    const eggies = new THREE.Group();
    const bag = rounded(0.2, 0.26, 0.06, standard(0xe9c64a, 0.6), 0.02);
    bag.position.y = 0.13;
    const label = textPlane(["HERSHEY'S", 'EGGIES'], 0.18, 0.12, { width: 180, height: 120, background: '#5a3420', color: '#fbe7a8' });
    label.position.set(0, 0.15, 0.031);
    eggies.add(bag, label);
    eggies.position.set(-1.62, 0.43, -0.28);
    eggies.rotation.set(-0.35, 0.5, 0);
    scene.add(eggies);
    const eggs = new THREE.Group();
    const pastel = [0xf4b8c8, 0xb8d8f4, 0xf4e6a0, 0xc8f0c0, 0xe0c8f4];
    for (let i = 0; i < 14; i += 1) {
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), standard(pastel[i % pastel.length], 0.35));
      egg.scale.set(1, 0.8, 1.3);
      egg.position.set(-1.45 + Math.sin(i * 2.3) * 0.14, 0.445, -0.2 + Math.cos(i * 1.7) * 0.16);
      egg.rotation.y = i;
      eggs.add(egg);
    }
    eggs.visible = false;
    scene.add(eggs);
    props.eggs = eggs;
    // Empty plastic cups pile up on the table and floor through the night.
    const cupMaterial = standard(0xc8282a, 0.5);
    const cupGeometry = new THREE.CylinderGeometry(0.045, 0.032, 0.12, 12, 1, true);
    const cups = new THREE.Group();
    const cupSpots: [number, number, number][] = [
      [-1.4, 0.49, 0.2], [-1.7, 0.49, 0.3], [-1.35, 0.49, 0.45], [-1.75, 0.49, 0.05], [-1.5, 0.49, 0.35],
      [-0.9, 0.045, 1.6], [-1.3, 0.49, -0.45], [-0.7, 0.045, -1.5], [-1.8, 0.49, -0.45], [0.0, 0.045, 1.9],
      [-1.0, 0.045, -1.8], [-0.4, 0.045, 1.4],
    ];
    for (const [i, [x, y, z]] of cupSpots.entries()) {
      const cup = new THREE.Mesh(cupGeometry, cupMaterial);
      cup.position.set(x, y, z);
      // Empties on the floor lie on their sides.
      if (y < 0.1) cup.rotation.set(Math.PI / 2, 0, i * 1.3);
      cup.visible = false;
      cups.add(cup);
    }
    scene.add(cups);
    props.cups = cups;
    // The full cups they drink from, carried in the left hand.
    for (const id of ['termite', 'skanky']) {
      const cup = new THREE.Group();
      const shell = new THREE.Mesh(cupGeometry, cupMaterial);
      const beer = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), standard(0xe8b040, 0.3));
      beer.rotation.x = -Math.PI / 2;
      beer.position.y = 0.045;
      cup.add(shell, beer);
      cup.visible = false;
      scene.add(cup);
      props[`cup-${id}`] = cup;
    }
    // Wii remotes, Termite's phone and the mess.
    for (const id of ['termite', 'skanky']) {
      const remote = rounded(0.04, 0.15, 0.03, standard(0xf2f2ee, 0.3), 0.01);
      scene.add(remote);
      props[`remote-${id}`] = remote;
    }
    const phone = rounded(0.08, 0.012, 0.15, new THREE.MeshStandardMaterial({ color: 0x111418, emissive: 0x6fd0ff, emissiveIntensity: 0 }), 0.01);
    scene.add(phone);
    props.phone = phone;
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18), new THREE.MeshStandardMaterial({ color: 0x9a9a3a, roughness: 0.25 }));
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(0.35, 0.012, -1.75);
    puddle.visible = false;
    scene.add(puddle);
    props.puddle = puddle;
    const car = createCar(0x8f3f34);
    this.placeCar(car, 9.2, 0.6, -Math.PI / 2);
    scene.add(car);
    props.homeCar = car;
    const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.32, 14, 1, true), standard(0xe8d8b0, 0.8));
    lampShade.position.set(3.4, 1.75, -3.4);
    const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), standard(0x2a2a2a, 0.5));
    lampPole.position.set(3.4, 0.8, -3.4);
    const lamp = new THREE.PointLight(0xffc68a, 9, 9, 1.5);
    lamp.position.set(3.4, 2.1, -3.2);
    const tvGlow = new THREE.PointLight(0x7fb0ff, 5, 7, 1.4);
    tvGlow.position.set(-3.6, 1.2, 0);
    const sun = new THREE.DirectionalLight(0xffe0b8, 0);
    sun.position.set(2, 8, -12);
    scene.add(lampShade, lampPole, lamp, tvGlow, sun);
    this.houseLights = { lamp, tvGlow, sun };
    this.cast(stage, ['termite', 'skanky']);
  }

  /**
   * The rest of a lived-in living room, kept clear of every path the pair
   * walk (couch to door, door to couch) and of the keg, the table and the TV:
   * a rug, a bookcase, an armchair, a dining corner, coats by the door,
   * pictures and a clock, and for Christmas a tree, presents and string lights.
   */
  private furnishHouse(scene: THREE.Scene): void {
    const wood = standard(0x5a3a24, 0.6);
    const add = (mesh: THREE.Mesh, x: number, y: number, z: number, turn = 0): THREE.Mesh => {
      mesh.position.set(x, y, z);
      mesh.rotation.y = turn;
      scene.add(shadowed(mesh));
      return mesh;
    };
    // On GPU renderers a photographed model stands over a drawn piece, which it hides once loaded.
    const model = (parts: THREE.Object3D[], id: Parameters<typeof placeProp>[1], x: number, z: number, turn: number, size: { x?: number; y?: number }): void => {
      const fallback = new THREE.Group();
      for (const part of parts) fallback.attach(part);
      scene.add(fallback);
      if (this.quality !== 'high') return;
      const slot = new THREE.Group();
      slot.position.set(x, 0, z);
      slot.rotation.y = turn;
      void placeProp(slot, id, { fallback, size });
      scene.add(slot);
    };
    // A rug under the coffee table, between the couch and the TV.
    const rugEdge = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.5), standard(0xc8b48a, 0.95));
    rugEdge.rotation.x = -Math.PI / 2;
    rugEdge.position.set(-1.75, 0.008, 0);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 2.25), standard(0x7a3328, 0.95));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-1.75, 0.01, 0);
    scene.add(rugEdge, rug);
    // A bookcase against the back wall.
    const bookcase: THREE.Object3D[] = [];
    bookcase.push(add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.9, 0.03), wood), -2.4, 0.95, -3.89));
    for (const x of [-3.18, -1.62]) bookcase.push(add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.9, 0.36), wood), x, 0.95, -3.72));
    const bookColors = [0x8a2a2a, 0x2a4a7a, 0x3a6a3a, 0xc8a040, 0x5a3a6a, 0xd8d0c0, 0x2a2a2a];
    for (let shelf = 0; shelf < 5; shelf += 1) {
      bookcase.push(add(new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.03, 0.34), wood), -2.4, 0.03 + shelf * 0.46, -3.72));
      if (shelf === 4) continue;
      let x = -3.12;
      for (let i = 0; x < -1.75; i += 1) {
        const w = 0.05 + ((i * 7 + shelf * 3) % 4) * 0.012;
        const h = 0.28 + ((i * 5 + shelf) % 3) * 0.04;
        bookcase.push(add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.24), standard(bookColors[(i + shelf * 2) % bookColors.length], 0.7)), x + w / 2, 0.045 + shelf * 0.46 + h / 2, -3.74));
        x += w + 0.008;
        if (i % 9 === 8) x += 0.18;
      }
    }
    model(bookcase, 'bookshelf', -2.4, -3.62, 0, { x: 1.6, y: 2.0 });
    // An armchair in the back corner by the lamp, facing the TV.
    const fabric = standard(0x6a4a3a, 0.95);
    const armchair: THREE.Object3D[] = [];
    armchair.push(add(rounded(0.85, 0.42, 0.85, fabric, 0.08), 3.2, 0.21, -2.2));
    armchair.push(add(rounded(0.22, 0.62, 0.85, fabric, 0.08), 3.56, 0.72, -2.2));
    for (const z of [-2.62, -1.78]) armchair.push(add(rounded(0.85, 0.58, 0.18, fabric, 0.07), 3.2, 0.29, z));
    model(armchair, 'armchair', 3.2, -2.2, -Math.PI / 2, { x: 0.9, y: 1.0 });
    // A dining corner by the front window door side.
    add(rounded(1.1, 0.05, 0.75, wood, 0.02), 3.4, 0.74, 3.05);
    for (const [x, z] of [[2.95, 2.8], [3.85, 2.8], [2.95, 3.3], [3.85, 3.3]] as const) add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), wood), x, 0.36, z);
    for (const [z, facing] of [[2.42, 1], [3.62, -1]] as const) {
      add(rounded(0.45, 0.05, 0.42, wood, 0.02), 3.4, 0.46, z);
      add(rounded(0.45, 0.5, 0.05, wood, 0.02), 3.4, 0.72, z - facing * 0.2);
      for (const [x, dz] of [[3.21, -0.17], [3.59, -0.17], [3.21, 0.17], [3.59, 0.17]] as const) add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.44, 0.04), wood), x, 0.22, z + dz);
    }
    // Coats on hooks beside the door, and a mat inside it.
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.04), wood), 4.35, 1.78, 3.88);
    for (const [x, color] of [[4.1, 0x2a3a4a], [4.6, 0x6a2a20]] as const) add(rounded(0.4, 0.75, 0.12, standard(color, 0.9), 0.06), x, 1.38, 3.8);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.0), standard(0x4a3a2a, 1));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(4.55, 0.009, 1.4);
    scene.add(mat);
    // Pictures, and a clock over the keg.
    const picture = (x: number, y: number, z: number, turn: number, w: number, h: number, colors: [string, string]): void => {
      add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), wood), x, y, z, turn);
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 48;
      const ctx = canvas.getContext('2d')!;
      const sky = ctx.createLinearGradient(0, 0, 0, 48);
      sky.addColorStop(0, colors[0]); sky.addColorStop(1, colors[1]);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 64, 48);
      ctx.fillStyle = '#2a3a2a'; ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(20, 22); ctx.lineTo(34, 34); ctx.lineTo(48, 18); ctx.lineTo(64, 36); ctx.lineTo(64, 48); ctx.lineTo(0, 48); ctx.fill();
      const art = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.08), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.6 }));
      (art.material as THREE.MeshStandardMaterial).map!.colorSpace = THREE.SRGBColorSpace;
      art.position.set(x + Math.sin(turn) * 0.025, y, z + Math.cos(turn) * 0.025);
      art.rotation.y = turn;
      scene.add(art);
    };
    picture(-4.9, 1.65, 2.4, Math.PI / 2, 0.9, 0.65, ['#d88a5a', '#f4d8a0']);
    picture(4.9, 1.65, -2.4, -Math.PI / 2, 0.8, 0.6, ['#5a8ac8', '#d8e8f0']);
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 24), standard(0xf4efe4, 0.5));
    clock.rotation.x = Math.PI / 2;
    const clockParts: THREE.Object3D[] = [add(clock, -0.6, 2.2, -3.9)];
    for (const [len, angle] of [[0.11, 0.6], [0.14, 2.4]] as const) {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.012, len, 0.01), standard(0x1a1a1a, 0.5));
      hand.position.set(-0.6 + Math.sin(angle) * len / 2, 2.2 + Math.cos(angle) * len / 2, -3.87);
      hand.rotation.z = -angle;
      scene.add(hand);
      clockParts.push(hand);
    }
    if (this.quality === 'high') {
      // The clock model hangs from its centre; the slot sits at the drawn clock's centre.
      const fallback = new THREE.Group();
      for (const part of clockParts) fallback.attach(part);
      scene.add(fallback);
      const slot = new THREE.Group();
      slot.position.set(-0.6, 2.2 - 0.18, -3.9);
      void placeProp(slot, 'wall-clock', { fallback, size: { y: 0.36 } });
      scene.add(slot);
    }
    // A Christmas tree in the corner by the TV, with presents underneath.
    const tree = new THREE.Group();
    const needles = standard(0x1f5a32, 0.8);
    for (const [r, h, y] of [[0.7, 0.9, 0.55], [0.55, 0.75, 1.05], [0.38, 0.6, 1.47]] as const) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), needles);
      tier.position.y = y;
      tree.add(tier);
    }
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshStandardMaterial({ color: 0xffe080, emissive: 0xffd040, emissiveIntensity: 1.6 }));
    star.position.y = 1.86;
    tree.add(star);
    const lights = [0xd02a2a, 0xf2c14e, 0x3a7ad0, 0x40c060];
    for (let i = 0; i < 18; i += 1) {
      const angle = i * 2.4;
      const y = 0.4 + (i % 9) * 0.14;
      const radius = 0.66 - (y - 0.3) * 0.36;
      const bauble = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshStandardMaterial({ color: lights[i % 4], emissive: lights[i % 4], emissiveIntensity: 0.8 }));
      bauble.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      tree.add(bauble);
    }
    tree.position.set(-4.2, 0, -3.15);
    scene.add(tree);
    for (const [x, z, s, color, ribbon] of [[-3.6, -2.6, 0.32, 0xb02a2a, 0xf2c14e], [-4.1, -2.4, 0.26, 0x2a5a9a, 0xe8e8e8], [-3.55, -3.2, 0.24, 0x2a7a3a, 0xd02a2a]] as const) {
      add(new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), standard(color, 0.6)), x, s * 0.4, z, 0.3);
      add(new THREE.Mesh(new THREE.BoxGeometry(s + 0.01, s * 0.8 + 0.01, 0.05), standard(ribbon, 0.5)), x, s * 0.4, z, 0.3);
    }
    // String lights along the top of the back and TV walls.
    for (let i = 0; i < 46; i += 1) {
      const t = i / 45;
      const [x, z] = t < 0.55 ? [-4.85 + (t / 0.55) * 9.6, -3.84] : [-4.84, -3.8 + ((t - 0.55) / 0.45) * 7.5];
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), new THREE.MeshStandardMaterial({ color: lights[i % 4], emissive: lights[i % 4], emissiveIntensity: 1.8 }));
      bulb.position.set(x, 2.6 - Math.abs(Math.sin(i * 1.3)) * 0.06, z);
      scene.add(bulb);
    }
    const glow = new THREE.PointLight(0xffb070, 4, 5, 1.6);
    glow.position.set(-3.8, 1.4, -2.6);
    scene.add(glow);
  }

  /** The TV picture: the Wii menu, a twilit field with a little hero in green, or the movie. */
  private tvTexture(kind: 'menu' | 'game' | 'movie'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 144;
    const ctx = canvas.getContext('2d')!;
    if (kind === 'menu') {
      ctx.fillStyle = '#eef1f4'; ctx.fillRect(0, 0, 256, 144);
      for (let row = 0; row < 3; row += 1) for (let col = 0; col < 4; col += 1) {
        ctx.fillStyle = row === 0 && col === 1 ? '#d8a040' : '#c9ced4';
        ctx.fillRect(16 + col * 58, 14 + row * 36, 50, 28);
      }
      ctx.fillStyle = '#5a6a7a'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('12:20', 128, 136);
    } else if (kind === 'movie') {
      // An animated sci-fi movie: a glowing green orb over a red desert, a rider on a winged beast.
      const sky = ctx.createLinearGradient(0, 0, 0, 110);
      sky.addColorStop(0, '#0a0418'); sky.addColorStop(1, '#5a1830');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 256, 144);
      const glow = ctx.createRadialGradient(190, 40, 4, 190, 40, 34);
      glow.addColorStop(0, '#eaffd0'); glow.addColorStop(0.35, '#6af04a'); glow.addColorStop(1, 'rgba(60,200,40,0)');
      ctx.fillStyle = glow; ctx.fillRect(150, 0, 90, 90);
      ctx.fillStyle = '#a8402a';
      ctx.beginPath(); ctx.moveTo(0, 112); ctx.lineTo(40, 96); ctx.lineTo(70, 98); ctx.lineTo(80, 84); ctx.lineTo(120, 84); ctx.lineTo(130, 100);
      ctx.lineTo(256, 104); ctx.lineTo(256, 144); ctx.lineTo(0, 144); ctx.fill();
      ctx.fillStyle = '#120a10';
      ctx.beginPath(); ctx.moveTo(60, 60); ctx.quadraticCurveTo(80, 40, 104, 58); ctx.quadraticCurveTo(84, 54, 82, 66);
      ctx.quadraticCurveTo(78, 52, 60, 60); ctx.fill();
      ctx.fillRect(80, 54, 3, 8);
      ctx.fillStyle = '#e8e8f0'; ctx.font = 'bold 20px serif'; ctx.textAlign = 'center';
      ctx.fillText('HEAVY METAL', 128, 134);
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, 100);
      sky.addColorStop(0, '#2a1840'); sky.addColorStop(0.6, '#d0703a'); sky.addColorStop(1, '#f0b060');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 256, 144);
      ctx.fillStyle = '#2c3a24';
      ctx.beginPath(); ctx.moveTo(0, 100); ctx.quadraticCurveTo(70, 70, 140, 98); ctx.quadraticCurveTo(200, 80, 256, 96);
      ctx.lineTo(256, 144); ctx.lineTo(0, 144); ctx.fill();
      ctx.fillStyle = '#1a1a14';
      for (const [x, y] of [[40, 96], [190, 92]]) {
        ctx.fillRect(x, y - 30, 4, 30);
        ctx.beginPath(); ctx.arc(x + 2, y - 32, 12, 0, Math.PI * 2); ctx.fill();
      }
      // The hero: green tunic and cap, a shield on the back.
      ctx.fillStyle = '#2f8a3a'; ctx.fillRect(122, 96, 12, 18);
      ctx.beginPath(); ctx.moveTo(122, 92); ctx.lineTo(138, 92); ctx.lineTo(142, 86); ctx.fill();
      ctx.fillStyle = '#e8c0a0'; ctx.fillRect(124, 88, 8, 8);
      ctx.fillStyle = '#3a4a9a'; ctx.fillRect(118, 98, 5, 12);
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(124, 114, 3, 8); ctx.fillRect(129, 114, 3, 8);
      ctx.fillStyle = '#e03030';
      for (let i = 0; i < 6; i += 1) { ctx.beginPath(); ctx.arc(12 + i * 13, 12, 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#f4e8c0'; ctx.font = 'bold 13px serif'; ctx.textAlign = 'right';
      ctx.fillText('TWILIGHT PRINCESS', 248, 136);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
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
      const bundle = this.bundle(6 + slot % 3 * 2);
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
    const handleMaterial = standard(0x8a949a, 0.4, 0.6);
    for (const z of [-0.32, 0.32]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.8, 0.045), handleMaterial);
      post.position.set(-0.58, 0.75, z); cart.add(post);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.7), handleMaterial);
    handle.position.set(-0.58, 1.15, 0); cart.add(handle);
    for (let i = 0; i < 2; i += 1) {
      const load = this.bundle(6);
      load.position.set(0, 0.36, i ? 0.2 : -0.2);
      load.scale.setScalar(0.9);
      load.visible = false;
      cart.add(load);
      props[`cart-${i}`] = load;
    }
    scene.add(cart);
    props.cart = cart;
    const carried = this.bundle(6);
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

  /** Two columns of real cartons make a visibly full, strapped store delivery. */
  private bundle(boxes: number): THREE.Group {
    const group = new THREE.Group();
    for (let i = 0; i < boxes; i += 1) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.3), standard(i % 2 ? 0xb8875a : 0xa47650, 0.9));
      box.name = 'delivery-box';
      box.position.set(i % 2 ? 0.16 : -0.16, 0.11 + Math.floor(i / 2) * 0.24, 0);
      box.castShadow = true;
      group.add(box);
    }
    const height = Math.ceil(boxes / 2) * 0.24;
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, height + 0.02, 0.32), standard(0xd8c060, 0.6));
    strap.position.y = height / 2;
    group.add(strap);
    group.userData.boxes = boxes;
    return group;
  }

  private setBundleCount(group: THREE.Object3D, boxes: number): void {
    if (group.userData.boxes === boxes) return;
    for (const child of [...group.children]) disposeObject3D(child);
    group.add(...this.bundle(boxes).children);
    group.userData.boxes = boxes; group.userData.label = undefined;
  }

  private highlightBundle(group: THREE.Object3D, active: boolean): void {
    group.userData.pickable = active;
    group.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive.setHex(0xffe7ab); child.material.emissiveIntensity = active ? 0.32 : 0;
      }
    });
  }

  private setLabel(group: THREE.Object3D, text: string, color = '#f1e5c4'): void {
    if (group.userData.label === text) return;
    const old = group.getObjectByName('label');
    if (old) disposeObject3D(old);
    if (text) {
      const sprite = textSprite([text], 0.32, { width: Math.max(110, text.length * 13 + 20), height: 30, background: color, border: '#9e8452', color: '#2b2116', radius: 5 });
      sprite.name = 'label';
      // Store tags are gameplay labels: never hidden behind the truck's walls.
      sprite.material.depthTest = false;
      sprite.renderOrder = 10;
      sprite.position.y = Math.ceil((group.userData.boxes ?? 2) / 2) * 0.24 + 0.35;
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
    this.roadWind = 0;
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
    else if (id === 'home-decision' || id === 'leave-house' || id === 'quit-night') this.directHouse(stage, cutscene, time);
    else if (id === 'mall-intro') this.directMallIntro(stage, cutscene);
    for (const actor of stage.actors.values()) if (actor.root.visible) actor.animate(dt, time, this.reducedMotion);
    for (const actor of stage.actors.values()) if (actor.root.visible && actor.seatedIn && actor.seat) this.settleInSeat(actor);
    // Cars that moved this beat roll and steer their wheels to match.
    for (const prop of Object.values(stage.props)) if (prop.visible && prop.userData.wheels) followWheels(prop.userData.wheels as WheelRig, prop, dt);
    stage.puffs.update(dt);
    for (const flakes of stage.snow) flakes.update(dt, this.reducedMotion, this.active === 'road' ? this.roadWind : 0);
  }

  private cameraTo(position: THREE.Vector3, look: THREE.Vector3, dt: number, snap = false): void {
    const blend = snap || this.reducedMotion ? 1 : 1 - Math.exp(-dt * 3);
    this.camera.position.lerp(position, blend);
    this.cameraLook.lerp(look, blend);
    this.camera.lookAt(this.cameraLook);
  }

  /**
   * Sits an actor in one of a car's seats. With the car's model loaded, its
   * contract (vehicleRig.ts) says where the seat's hips are and the root
   * stands the seat's drop below them; the procedural car keeps its old
   * offsets, so the scene plays the same before a download lands.
   */
  private seat(actor: StageActor, car: THREE.Object3D, seat: SeatName): void {
    const contract = car.userData.contract as VehicleContract | undefined;
    const node = contract?.seats[seat]?.seat;
    let world: THREE.Vector3;
    if (node) {
      car.updateWorldMatrix(true, true);
      world = seatRootPosition(node, actor.root.scale.x);
    } else world = car.localToWorld(PLAIN_SEATS[seat].clone());
    actor.root.visible = true;
    actor.at(world.x, world.z, world.y);
    actor.seatedIn = car;
    actor.seat = seat;
    actor.faceAngle = car.rotation.y + Math.PI / 2;
    // A seated figure turns with the car, not a few frames behind it: eased round, it would
    // reach for the wheel and the pedals from the wrong way while the car swings into a stall.
    actor.root.rotation.y = actor.faceAngle;
    actor.pose = 'sit';
  }

  /**
   * Hands on the wheel or the lap and feet on the pedals or the floor, from
   * the car's contract. A gesture (the phone, a hand up) keeps the arms it
   * posed; only a plain seat puts the hands down. The procedural car has no
   * contract and keeps the sit pose as it was.
   */
  private settleInSeat(actor: StageActor): void {
    const car = actor.seatedIn!;
    const targets = (car.userData.contract as VehicleContract | undefined)?.seats[actor.seat!];
    if (!targets) return;
    car.updateWorldMatrix(true, true);
    const points: SeatTargetPoints = {};
    if (actor.pose === 'sit' && targets.hands) {
      points.hands = { left: targets.hands.left.getWorldPosition(new THREE.Vector3()), right: targets.hands.right.getWorldPosition(new THREE.Vector3()) };
      // The wheel is held exactly: the driver keeps the whole figure under the model (characterModels.ts).
      if (actor.character.motion && actor.seat === 'driver') actor.character.motion.hands = true;
    }
    if (targets.feet) points.feet = { left: targets.feet.left.getWorldPosition(new THREE.Vector3()), right: targets.feet.right.getWorldPosition(new THREE.Vector3()) };
    poseSeated(actor.character, points);
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
        this.seat(a('skanky'), car, 'driver');
        this.seat(a('termite'), car, 'passenger');
      } else {
        for (const [who, offset] of [['skanky', -0.6], ['termite', 0.6]] as const) {
          const actor = a(who);
          actor.root.visible = inside < 0.95;
          actor.pose = 'none';
          actor.faceAngle = null;
          const along = Math.min(1, run * 0.85 + inside * 0.15);
          // Exit on opposite sides, pass behind the parked car, then follow
          // the empty aisle. The previous diagonal began inside one car seat
          // and squeezed the pair to less than a shoulder-width at the door.
          const path = alongPath([[offset < 0 ? -3.6 : 0.6, -2.8], [2 + offset, -2.0], [2 + offset, -10], [9 + offset, -13.2]], along);
          actor.at(path.x, path.z);
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
      ? [['car-skanky', 'skanky', 0, 5.2, 3], ['car-brian', 'brian', -6.5, 6.5, -3], ['car-fruitloop', 'fruitloop', 6.5, 6.5, 7], ['car-doris', 'doris', -12.5, 7.2, -7]]
      : [['car-skanky', 'skanky', 0, 5.2, 3], ['car-doris', 'doris', -6.5, 6.5, -3], ['car-hussan', 'hussan', 6.5, 6.5, 7]];
    queue.forEach(([name, driver, x, z, stall], index) => {
      const car = props[name];
      // One at a time: out to the gate line, straight through, then into a stall.
      const window = 0.7 / queue.length;
      const go = THREE.MathUtils.clamp((drive - 0.3 - index * window) / window, 0, 1);
      // Clear the gate with the full car before turning; deep stalls leave a
      // complete turning aisle ahead of already parked vehicles.
      const path: [number, number][] = x === 0 ? [[x, z], [0, -3.6], [stall, -3.6], [stall, -8.4]]
        : [[x, z], [x * 0.25, 3.8], [0, 2.6], [0, -3.6], [stall, -3.6], [stall, -8.4]];
      const at = go <= 0 ? { x, z, h: toGate } : alongPath(path, ease(go));
      this.placeCar(car, at.x, at.z, at.h);
      this.seat(a(driver), car, 'driver');
      if (name === 'car-skanky') this.seat(a('termite'), car, 'passenger');
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
    const insidePath = alongPath([[-1.2, 1], [-1.2, -3], [10, -3], [10, -12.8]], inside);
    shan.at(inside > 0 ? insidePath.x : toGatePath.x, inside > 0 ? insidePath.z : toGatePath.z);
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

  /** Inside Tim Hortons: the crew's booth, the tray and donut box on its table, and the pickup counter. */
  private directCoffee(stage: Stage, cutscene: Cutscene, time: number): void {
    const { props, actors } = stage;
    const a = (id: string): StageActor => actors.get(id)!;
    const variant = cutscene.scene.id;
    const stand = (id: string, x: number, z: number, face: number): void => {
      const actor = a(id);
      actor.root.visible = true;
      actor.at(x, z);
      actor.faceAngle = face;
    };
    // Seated on a booth bench, facing the table (+z from the north bench, -z from the south).
    const sit = (id: string, bench: 'north' | 'south' | 'next', x: number): void => {
      const actor = a(id);
      const facing = bench === 'south' ? -1 : 1;
      actor.root.visible = true;
      actor.at(x, BOOTHS[bench] + facing * 0.05);
      actor.seatedIn = props[bench === 'north' ? 'boothNorth' : bench === 'south' ? 'boothSouth' : 'nextBooth'];
      actor.faceAngle = facing > 0 ? 0 : Math.PI;
      actor.pose = 'sit';
    };
    const onTable = (prop: THREE.Object3D, x: number, z: number, lift = 0): void => {
      prop.position.set(x, TABLE_TOP + lift, z);
    };
    stand('cashier', -0.5, -5.95, 0);
    props.stain.visible = false;
    props.tray.visible = variant === 'timhortons-1';
    onTable(props.tray, BOOTH_X - 0.45, BOOTHS.table + 0.05, 0.03);
    onTable(props.donutBox, BOOTH_X + 0.45, BOOTHS.table);
    props.lid.rotation.x = 0;
    props.cup.visible = false;
    const snap = cutscene.index === 0 && cutscene.elapsedMs < 50;
    if (variant === 'timhortons-2') {
      // Everyone is in the booth with a dozen donuts; Brian is in the next one, chewing.
      sit('skanky', 'north', BOOTH_X - 0.45);
      sit('termite', 'north', BOOTH_X + 0.45);
      sit('doris', 'south', BOOTH_X - 0.45);
      sit('brian', 'next', BOOTH_X + 0.2);
      props.lid.rotation.x = -1.6;
      a('skanky').setPose(cueProgress(cutscene, 'count-donuts') > 0 && cutscene.index <= 2 ? 'press' : 'sit', time);
      a('brian').character.head.rotation.x = Math.sin(time * 9) * 0.08;
      const back = cueProgress(cutscene, 'back-seat');
      if (back > 0 && back < 1 && Math.random() < 0.15) stage.puffs.emit(a('brian').root.position.clone().add(new THREE.Vector3(0, 1.3, 0.25)), { color: 0xc08040, size: 0.05, life: 0.8, velocity: new THREE.Vector3(0, -0.5, 0.4), opacity: 0.9, grow: 1 });
      this.cameraTo(new THREE.Vector3(0.6, 2.4, 2.6), new THREE.Vector3(BOOTH_X, 0.9, BOOTHS.table), this.frameDt, snap);
      return;
    }
    if (variant === 'timhortons-1') {
      // Kylie brings the tray to the booth and asks whose double-double it is.
      sit('skanky', 'north', BOOTH_X - 0.45);
      sit('termite', 'north', BOOTH_X + 0.45);
      sit('doris', 'south', BOOTH_X - 0.45);
      sit('brian', 'south', BOOTH_X + 0.45);
      stand('kylie', BOOTH_X - 1.35, BOOTHS.table, Math.PI / 2);
      const hands = cueProgress(cutscene, 'three-hands');
      for (const id of ['skanky', 'doris', 'brian']) a(id).setPose(hands > 0 && cutscene.index <= 3 ? 'handup' : 'sit', time);
      const box = cueProgress(cutscene, 'donut-box');
      props.lid.rotation.x = box <= 0 || box >= 1 ? 0 : -Math.sin(Math.min(1, box * 1.6) * Math.PI) * 1.8;
      a('termite').setPose(box > 0 && box < 1 ? 'press' : 'sit', time);
      this.cameraTo(new THREE.Vector3(0.4, 2.7, 2.9), new THREE.Vector3(BOOTH_X - 0.2, 0.9, BOOTHS.table - 0.3), this.frameDt, snap);
      return;
    }
    // At the pickup end of the counter, Skanky hands Termite a coffee with a loose lid; it spills on his sleeve.
    sit('doris', 'north', BOOTH_X - 0.45);
    sit('brian', 'north', BOOTH_X + 0.45);
    stand('termite', 1.0, -3.7, Math.PI / 2);
    stand('skanky', 1.95, -3.75, -Math.PI / 2);
    const hand = ease(cueProgress(cutscene, 'hand-coffee'));
    const spill = cueProgress(cutscene, 'spill');
    // Hand to hand, following each reaching arm.
    const from = a('skanky').character.rightHand.getWorldPosition(new THREE.Vector3());
    const to = a('termite').character.rightHand.getWorldPosition(new THREE.Vector3());
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
    this.cameraTo(new THREE.Vector3(1.4, 2.3, -0.4), new THREE.Vector3(1.45, 1.1, -3.9), this.frameDt, snap);
  }

  private directRoad(stage: Stage, cutscene: Cutscene, dt: number): void {
    const { props } = stage;
    const depart = cueProgress(cutscene, 'depart');
    const arrive = cueProgress(cutscene, 'arrive');
    const speed = 14 * Math.min(1, depart * 1.5) * (1 - arrive);
    this.roadTravel += speed * dt;
    this.roadWind = -speed;
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
    } else this.seat(skanky, car, 'driver');
    const phone = props.phoneGlow as THREE.PointLight;
    const phoneOn = cueProgress(cutscene, 'phone') > 0 && leave <= 0;
    phone.intensity = phoneOn ? 4 + Math.sin(time * 6) : 0;
    phone.position.copy(skanky.root.position).add(new THREE.Vector3(0, 1.3, 0));
    this.cameraTo(new THREE.Vector3(2, 6.5, 12), new THREE.Vector3(-4.5, 1, -4), this.frameDt, cutscene.index === 0 && cutscene.elapsedMs < 50);
  }

  /** The prologue at home: the decision, the walk out to the car, or the long night in. */
  private directHouse(stage: Stage, cutscene: Cutscene, time: number): void {
    const { props, actors } = stage;
    const id = cutscene.scene.id;
    const termite = actors.get('termite')!, skanky = actors.get('skanky')!;
    const couch = props.couch;
    // Seated on the couch, facing the TV; the couch keeps their legs folded.
    const sit = (actor: StageActor, z: number): void => {
      actor.root.visible = true;
      actor.at(0.45, z);
      actor.seatedIn = couch;
      actor.faceAngle = -Math.PI / 2;
    };
    const stand = (actor: StageActor, x: number, z: number, face: number | null): void => {
      actor.root.visible = true;
      actor.at(x, z);
      actor.faceAngle = face;
    };
    // Hand-held props ride the hand pivots, which also drive the imported models' hands.
    const put = (prop: THREE.Object3D, parent: THREE.Object3D, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void => {
      if (prop.parent !== parent) parent.add(prop);
      prop.position.set(x, y, z);
      prop.rotation.set(rx, ry, rz);
    };
    const car = props.homeCar;
    this.placeCar(car, 9.2, 0.6, -Math.PI / 2);
    const headlights = (on: boolean): void => {
      for (const light of car.children) if (light.name === 'headlight') ((light as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 2.6 : 0.15;
    };
    headlights(false);
    let outside = false;
    let emptyCups = 0;
    let morning = 0;
    let screen: 'menu' | 'game' | 'movie' = 'menu';
    let onPhone = false;
    // Who is playing Zelda with a remote, and who has a beer in hand.
    let gaming = id === 'home-decision' ? new Set(['skanky']) : new Set<string>();
    let drinking = new Set<string>();
    props.puddle.visible = false;
    props.eggs.visible = false;
    props.door.rotation.y = 0;
    const phone = props.phone as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    phone.material.emissiveIntensity = 0;
    put(phone, stage.scene, -1.45, 0.435, 0.05, 0, 0.3);

    if (id === 'home-decision') {
      sit(skanky, -0.55);
      skanky.setPose(cueProgress(cutscene, 'skanky-pitch') > 0 && cueProgress(cutscene, 'tempted') <= 0 ? 'handup' : 'sit', time);
      const tempted = cueProgress(cutscene, 'tempted');
      // Termite waits by the side door, then looks at it, then at the Wii.
      stand(termite, 2.6, 1.4, tempted > 0 && tempted < 0.45 ? Math.PI / 2 : -Math.PI / 2);
      termite.setPose(cueProgress(cutscene, 'termite-keys') > 0 && tempted <= 0 ? 'keys' : 'none', time);
    } else if (id === 'leave-house') {
      const up = ease(cueProgress(cutscene, 'get-up'));
      const out = ease(cueProgress(cutscene, 'out'));
      const start = cueProgress(cutscene, 'start-car');
      outside = out > 0.42 || start > 0;
      props.door.rotation.y = out > 0.2 && out < 0.8 ? -1.4 * Math.sin((out - 0.2) / 0.6 * Math.PI) : 0;
      if (start > 0) {
        this.seat(skanky, car, 'driver');
        this.seat(termite, car, 'passenger');
        headlights(true);
        if (start < 1 && Math.random() < 0.3) {
          stage.puffs.emit(car.localToWorld(new THREE.Vector3(-2.3, 0.3, 0.5)), { color: 0xb8bcc0, size: 0.14, life: 1.6, velocity: new THREE.Vector3(0, 0.3, -0.6), opacity: 0.35, grow: 3 });
        }
      } else {
        // Up off the couch, round its end, out the side door, then either side of the car.
        if (up <= 0) {
          sit(skanky, -0.55);
          skanky.setPose('sit', time);
        } else {
          skanky.seatedIn = null;
          const path = alongPath([[-0.4, -0.55], [-0.5, 1.8], [3.6, 1.6], [5.0, 1.4], [6.6, 1.4], [8.4, 1.4], [8.45, 0.6]], out);
          stand(skanky, out > 0 ? path.x : mix(0.45, -0.4, up), out > 0 ? path.z : -0.55, out <= 0 ? -Math.PI / 2 : out >= 1 ? Math.PI / 2 : null);
          skanky.setPose(cueProgress(cutscene, 'keys') > 0 ? 'keys' : 'none', time);
        }
        if (up <= 0) gaming = new Set(['skanky']);
        const path = alongPath([[2.6, 1.4], [4.4, 1.4], [5.0, 1.4], [6.6, 1.6], [10.0, 2.8], [10.0, 0.6]], Math.max(0, (out - 0.1) / 0.9));
        stand(termite, path.x, path.z, out <= 0 || out >= 1 ? -Math.PI / 2 : null);
        termite.setPose('none', time);
      }
    } else {
      const pour = cueProgress(cutscene, 'pour');
      const play = cueProgress(cutscene, 'play');
      const movie = cueProgress(cutscene, 'movie');
      const woozy = cueProgress(cutscene, 'woozy');
      const vomit = cueProgress(cutscene, 'vomit');
      const ring = cueProgress(cutscene, 'ring');
      const answer = cueProgress(cutscene, 'answer');
      const hangUp = cueProgress(cutscene, 'hang-up');
      morning = ease(cueProgress(cutscene, 'morning'));
      screen = movie > 0 ? 'movie' : play > 0 ? 'game' : 'menu';
      props.eggs.visible = play > 0;
      emptyCups = Math.min(12, Math.round(2 * play + 3 * movie + 2 * cueProgress(cutscene, 'round') + 2 * woozy + vomit + 2 * morning));
      sit(skanky, -0.55);
      // Termite comes over from the door and takes the other end of the couch.
      const seated = pour >= 0.5;
      if (!seated) {
        const walk = alongPath([[2.6, 1.4], [-0.4, 1.7], [-0.4, 0.55]], ease(pour * 2));
        stand(termite, walk.x, walk.z, null);
      } else sit(termite, 0.55);
      onPhone = answer > 0 && hangUp < 0.4;
      // Zelda until Heavy Metal goes on; after that, just the beer.
      const zelda = movie <= 0;
      termite.setPose(!seated ? 'none' : onPhone ? 'phone' : zelda ? 'wii' : 'sip', time);
      const sick = vomit > 0 && vomit < 1;
      // Skanky turns to the side of the couch to be sick.
      skanky.faceAngle = sick ? Math.PI : -Math.PI / 2;
      const queasy = sick || woozy > 0 && vomit <= 0;
      skanky.setPose(queasy ? 'cough' : zelda ? 'wii' : 'sip', time);
      if (sick && vomit < 0.7 && Math.random() < 0.7) {
        stage.puffs.emit(new THREE.Vector3(0.4, 0.9, -1.2), { color: 0xa8a838, size: 0.07, life: 0.6, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.3, -1.3, -0.5), opacity: 0.95, grow: 1.4 });
      }
      props.puddle.visible = vomit > 0.25;
      props.puddle.scale.setScalar(Math.min(1, 0.2 + (vomit - 0.25) * 1.6));
      gaming = new Set(zelda ? ['skanky', ...(seated ? ['termite'] : [])] : []);
      drinking = new Set([...(queasy ? [] : ['skanky']), ...(seated ? ['termite'] : [])]);
      // The phone buzzes on the table, then goes to Termite's ear.
      const ringing = ring > 0 && answer <= 0;
      phone.material.emissiveIntensity = ringing ? (Math.sin(time * 14) > 0 ? 2.4 : 0.6) : onPhone ? 1.2 : 0;
      if (onPhone) {
        put(phone, termite.character.rightHand, 0, -0.07, 0.03, Math.PI / 2);
      } else if (ringing) {
        phone.position.x += Math.sin(time * 60) * 0.008;
        phone.rotation.y = Math.sin(time * 45) * 0.08;
      }
    }
    for (const [i, cup] of props.cups.children.entries()) cup.visible = i < emptyCups;
    for (const [who, actor] of [['termite', termite], ['skanky', skanky]] as const) {
      // Remotes in the right hand while they play; otherwise on the couch, table or floor.
      const remote = props[`remote-${who}`];
      if (gaming.has(who)) put(remote, actor.character.rightHand, 0, -0.07, 0.03);
      else if (who === 'skanky' && id === 'quit-night') put(remote, stage.scene, 0.5, 0.44, -0.05, Math.PI / 2, 0, 0.4);
      else if (who === 'skanky') put(remote, stage.scene, 0.5, 0.44, -0.1, Math.PI / 2, 0, 0.6);
      else put(remote, stage.scene, -1.5, 0.445, 0.32, Math.PI / 2, 0, 0.2);
      // A beer in the left hand, kept upright as the arm moves.
      const cup = props[`cup-${who}`];
      cup.visible = drinking.has(who);
      if (cup.visible) actor.character.leftHand.getWorldPosition(cup.position).add(new THREE.Vector3(0, -0.08, 0));
    }
    // Lamp and TV at night; the sun through the back window in the morning.
    const lights = this.houseLights!;
    const tv = props.tvScreen as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    tv.material.map = tv.userData[screen] as THREE.Texture;
    lights.tvGlow.color.set(screen === 'game' ? 0xf0a060 : screen === 'movie' ? 0x8af06a : 0x9fc0ff);
    lights.tvGlow.intensity = (screen === 'menu' ? 4 : 6 + Math.sin(time * 7) * 1.2) * (1 - morning * 0.5);
    lights.lamp.intensity = 9 * (1 - morning);
    lights.sun.intensity = morning * 2.2;
    const window = props.backWindow as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    window.material.emissive.set(0x8a9ab8).lerp(new THREE.Color(0xffe2a8), morning);
    window.material.emissiveIntensity = 0.6 + morning * 1.4;
    const sky = new THREE.Color(0x0a121c).lerp(new THREE.Color(0x9ab8d8), morning);
    (stage.scene.background as THREE.Color).copy(sky);
    (stage.scene.fog as THREE.Fog).color.copy(sky);
    props.roof.visible = outside;
    for (const flakes of stage.snow) flakes.points.visible = outside;
    const closeUp = !outside && (onPhone || id === 'quit-night' && cutscene.index >= 3 && morning <= 0);
    const snap = cutscene.index === 0 && cutscene.elapsedMs < 50 || outside !== this.houseOutside || closeUp !== this.houseCloseUp;
    this.houseOutside = outside;
    this.houseCloseUp = closeUp;
    // Every indoor shot is taken from inside the room, under the ceiling.
    if (outside) this.cameraTo(new THREE.Vector3(15.5, 4.2, 10.5), new THREE.Vector3(7.2, 1.0, 0.6), this.frameDt, snap);
    // From the TV side for the long night and the call, so both faces show.
    else if (closeUp) this.cameraTo(new THREE.Vector3(-2.7, 1.9, 2.7), new THREE.Vector3(0.45, 0.9, -0.3), this.frameDt, snap);
    // Leaving: from the TV corner, the couch and the side door both in view.
    else if (id !== 'quit-night') this.cameraTo(HOUSE_VIEWS.door.position, HOUSE_VIEWS.door.look, this.frameDt, snap);
    // The long night: from the front corner, the TV, the couch and the tree.
    else this.cameraTo(HOUSE_VIEWS.room.position, HOUSE_VIEWS.room.look, this.frameDt, snap);
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
      if (id) { this.setBundleCount(load, model.store(id).boxes); this.setLabel(load, `${model.store(id).name} · ${model.store(id).boxes} BOXES`); }
      const tag = load.getObjectByName('label');
      if (tag) tag.position.y = Math.ceil((load.userData.boxes ?? 2) / 2) * 0.24 + 0.35 + (i === raised ? 0.55 : 0);
    }
    model.truckBundles.forEach((id, slot) => {
      const bundle = props[`slot-${slot}`];
      bundle.visible = id !== null;
      if (id) {
        const store = model.store(id);
        this.setBundleCount(bundle, store.boxes);
        const current = store.run === model.run || (model.runComplete && store.run === model.run + 1);
        this.setLabel(bundle, `${store.name} · ${store.boxes} BOXES`, current ? '#f2c14e' : '#c8c0b0');
        // Alternate slots' tags sit in two staggered columns over the tailgate.
        const tag = bundle.getObjectByName('label');
        if (tag) tag.position.set(slot % 2 ? 0.75 : -0.75, 1.25, 0);
      }
    });
    const selection = model.interaction;
    model.truckBundles.forEach((_, slot) => {
      const selected = selection.action === 'take' && slot === selection.slot;
      props[`slot-${slot}`].scale.setScalar(selected ? 1.08 + Math.sin(time * 6) * 0.02 : 1);
      this.highlightBundle(props[`slot-${slot}`], selected);
    });
    const carried = props.carried;
    carried.visible = model.carrying !== null;
    if (model.carrying) {
      this.setBundleCount(carried, model.store(model.carrying).boxes);
      const forward = new THREE.Vector3(Math.sin(skanky.root.rotation.y), 0, Math.cos(skanky.root.rotation.y));
      carried.position.copy(skanky.root.position).addScaledVector(forward, 0.58).setY(0.75);
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
        disposeObject3D(prop);
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
    for (const flakes of stage.snow) flakes.update(dt, this.reducedMotion);
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
  termite: [366, 214], skanky: [414, 214],
  hussan: [342, 252], aj: [386, 256], ben: [386, 300], bannerman: [386, 344],
  brian: [414, 238], fruitloop: [414, 272], doris: [414, 306], donna: [414, 340],
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
    if (character.motion) character.motion.pose = pose;
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
