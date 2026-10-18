import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { ROUTE_INFO, streetRange } from '../game/slice/ShiftModel';
import { DEPOT_3D_LAYOUT as SHIFT_LAYOUT, floorPileSlot, truckInteriorAt } from './layout';
import { BODY, bendElbows, bendKnees, createCharacter, mergeCharacter, type Character, type CharacterSpec } from './characters';
import { mergeStatic } from './merge';
import { PuffField } from './fx';
import {
  BELT_HEIGHT, BELT_WIDTH, BELT_WORK_HEIGHT, PALETTE, PLATFORM_HEIGHT, ROUTE_COLORS, WORLD_SCALE, shadowed, standard, textPlane,
  toWorld, toWorldX, toWorldZ,
} from './space';
import { SHAN_NAME } from '../game/slice/StoryScript';

const rounded = (w: number, h: number, d: number, material: THREE.Material, r = 0.05): THREE.Mesh =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), material);

export interface Resident {
  id: string;
  character: Character;
  home: THREE.Vector3;
}

export const SKIN = { light: 0xe8b98f, tan: 0xc98d62, brown: 0x8d5a3b, pale: 0xf0c9a5, olive: 0xb88356 };

/** Original cast identities: see docs/reference-parity.md, cast table. */
const RESIDENTS: [string, number, number, CharacterSpec][] = [
  ['hussan', 150, 198, { name: 'HUSSAN', skin: SKIN.olive, shirt: 0x3f78a8, pants: 0x2d3440, hair: 0x1b1612, hairStyle: 'short', beard: true }],
  ['aj', 150, 294, { name: 'AJ', skin: SKIN.tan, shirt: SKIN.tan, pants: 0x4b5a66, hair: 0x6b4a2c, hairStyle: 'short', barefoot: true }],
  ['ben', 150, 390, { name: 'BEN', skin: SKIN.pale, shirt: 0x5a6b48, pants: 0x34383d, hair: 0x5a3a22, hairStyle: 'slick' }],
  ['bannerman', 150, 486, { name: 'BANNERMAN', skin: SKIN.light, shirt: 0x8a6a3a, pants: 0x2f3b45, hair: 0x6e4c2e, hairStyle: 'short', glasses: true, moustache: true }],
  ['fruitloop', 810, 198, { name: 'FRUIT LOOP', skin: SKIN.light, shirt: 0x5fae4e, pants: 0x354052, hair: 0x2f2318, hairStyle: 'curly', scale: 0.78 }],
  ['doris', 810, 294, { name: 'DORIS', skin: SKIN.pale, shirt: 0x7d4d9c, pants: 0x2f3440, hair: 0xf0d35a, hairStyle: 'curly' }],
  ['brian', 810, 390, { name: 'BRIAN', skin: SKIN.tan, shirt: 0x7a5534, pants: 0x5b4330, hair: 0x3a2618, hairStyle: 'short' }],
  ['donna', 810, 486, { name: 'DONNA', skin: SKIN.pale, shirt: 0x3f8a86, pants: 0x2f3440, hair: 0x9a3f25, hairStyle: 'long', necklace: true }],
];
export const RESIDENT_SPECS: Record<string, CharacterSpec> = Object.fromEntries(RESIDENTS.map(([id, , , spec]) => [id, spec]));

export const VISITORS: Record<string, CharacterSpec & { x: number; y: number }> = {
  kylie: { name: 'KYLIE', x: 850, y: 400, skin: SKIN.pale, shirt: 0xb24a6a, pants: 0x2b2f3a, hair: 0x83569a, hairStyle: 'bun' },
  john: { name: 'JOHN RUSHTON', x: 77, y: 397, skin: 0xbf9672, shirt: 0x2f4f64, pants: 0x2b3038, hair: 0x3a2a19, hairStyle: 'short', scale: 0.92 },
  vic: { name: 'VIC', x: 132, y: 286, skin: 0xc29c7a, shirt: 0x727f83, pants: 0x34383d, hair: 0xb4b4a1, hairStyle: 'short', moustache: true },
  shan: { name: SHAN_NAME, dynamicSkin: true, x: 880, y: 395, skin: SKIN.light, shirt: 0xe9e4d6, pants: 0x30343c, hair: 0x8b8b88, hairStyle: 'bald', tie: 0x8a2630 },
};

export const TERMITE_SPEC: CharacterSpec = { name: 'TERMITE', skin: 0xe2b088, shirt: 0x2f5f8f, pants: 0x2a3f5c, overalls: 0x2a3f5c, hair: 0x5a3a20, hairStyle: 'short', headwear: 'termiteHat', beard: true };
export const SKANKY_SPEC: CharacterSpec = { name: 'SKANKY', skin: 0xe8b98f, shirt: 0x8f3f34, pants: 0x34404c, hair: 0x5b3a22, hairStyle: 'long', beard: true };

/** Where Ralph's five-ton backs in: the empty bay beside the bulk pile, west side. */
export const RALPH_BAY = SHIFT_LAYOUT.ralphBay;

type PlayerTruckRoute = 'A' | 'B' | 'D' | 'E';
const PLAYER_TRUCKS: { route: PlayerTruckRoute; body: number; cab: number }[] = [
  { route: 'A', body: 0x4f8fc0, cab: 0x3b6f98 },
  { route: 'B', body: 0x6faa6a, cab: 0x568a52 },
  { route: 'D', body: 0x5672b8, cab: 0x3f5590 },
  { route: 'E', body: 0xb1b34f, cab: 0x8b8c3a },
];

export class DepotWorld {
  public readonly scene = new THREE.Scene();
  public readonly tread: THREE.Texture;
  public readonly residents = new Map<string, Resident>();
  public readonly puffs: PuffField;
  public readonly bulkStack = new THREE.Group();
  public platformDeck!: THREE.Mesh;
  public groundSurface!: THREE.Mesh;
  public bulkRearWall!: THREE.Mesh;
  public readonly stairTreads: { side: 'left' | 'right'; index: number; mesh: THREE.Mesh }[] = [];
  public readonly stairRails: THREE.Mesh[] = [];
  public readonly intakeAnchor = new THREE.Group();
  public readonly ralphTruck = new THREE.Group();
  /** Lower-floor drop piles: one instanced box per delivered parcel. */
  public readonly floorPiles = {} as Record<'T' | 'S', THREE.InstancedMesh>;
  private readonly ralphLoad: THREE.Mesh[] = [];
  private stopCap!: THREE.Mesh;
  private startCap!: THREE.Mesh;
  public readonly trucks: {
    name: string; group: THREE.Group; homeX: number; direction: number; stack: THREE.Object3D;
    cabDoor: { x: number; y: number }; route?: PlayerTruckRoute;
  }[] = [];
  /** Freight visibly stacking up inside each player truck's open rear. */
  /** Emitters that need per-frame particles: cigarette, stink. */
  private readonly emitters: { anchor: THREE.Object3D; kind: 'smoke' | 'stink'; timer: number }[] = [];
  private readonly lamps: THREE.Mesh[] = [];
  private readonly fish: THREE.Mesh[] = [];
  private readonly beltRollers: THREE.Mesh[] = [];
  private readonly warcraft: THREE.CanvasTexture;
  private warcraftClock = 0;

  constructor(quality: 'high' | 'low') {
    const scene = this.scene;
    scene.background = new THREE.Color(0x0a1317);
    scene.fog = new THREE.Fog(0x0a1317, 26, 62);
    this.puffs = new PuffField(scene);

    this.addLights(quality);
    this.addShell();
    this.addPlatform();
    this.tread = this.addBelt();
    this.addReceiving();
    this.addDocks();
    this.addLowerFloor();
    this.addTrucks();
    this.addResidents();
    this.warcraft = this.addDonnaHusband();
    this.addPaytmanTank();
    scene.add(this.bulkStack, this.intakeAnchor);
    this.addBulkCrates();
    this.addRalphTruck();
    this.mergeStaticGeometry();
  }

  /** Collapses ~1,300 separate meshes into a few hundred draw calls. */
  private mergeStaticGeometry(): void {
    // Wheels join the body: they only turn during the brief clock-out drive.
    for (const truck of this.trucks) mergeStatic(truck.group, (object) => object.name === 'stack-top' || object.userData.keep === true);
    mergeStatic(this.ralphTruck, (object) => object.userData.keep === true);
    for (const resident of this.residents.values()) mergeCharacter(resident.character);
    const dynamic = new Set<THREE.Object3D>([
      ...[...this.residents.values()].map((resident) => resident.character.root),
      ...this.trucks.map((truck) => truck.group), ...this.fish, ...this.beltRollers, this.bulkStack, this.intakeAnchor, this.ralphTruck,
      ...Object.values(this.floorPiles),
    ]);
    mergeStatic(this.scene, (object) => dynamic.has(object) || object.userData.keep === true || (object as THREE.Light).isLight === true);
  }

  private addLights(quality: 'high' | 'low'): void {
    const scene = this.scene;
    scene.add(new THREE.HemisphereLight(0xb2c8dc, 0x424b53, 0.95));
    const key = new THREE.DirectionalLight(0xcfdcff, 1.2);
    key.position.set(9, 20, 9);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.setScalar(quality === 'high' ? 4096 : 1024);
    const s = key.shadow.camera;
    s.left = -18; s.right = 18; s.top = 24; s.bottom = -22; s.near = 1; s.far = 64;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 3;
    scene.add(key, key.target);

    // Sodium work lights make warm pools over each working area, including the lower floor.
    const pools: [number, number, number, number][] = [
      [480, 150, 0xffc07a, 70], [480, 420, 0xffc07a, 76], [480, 700, 0xffcf96, 72], [480, 830, 0xffc98c, 72],
      [244, 260, 0xffb26a, 40], [716, 260, 0xffb26a, 40], [480, -120, 0x8fc4ff, 55],
      [150, 420, 0xffb26a, 26], [810, 420, 0xffb26a, 26],
    ];
    const fixtureMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe2b0, emissiveIntensity: 4 });
    // Software renderers get the four central pools only.
    for (const [x, y, color, power] of quality === 'high' ? pools : pools.slice(0, 4)) {
      const light = new THREE.PointLight(color, power, 16, 1.7);
      light.position.copy(toWorld({ x, y }, 5.8));
      scene.add(light);
    }
    // Wall-mounted fixtures stay out of the follow camera's line of sight.
    for (let y = -200; y <= SHIFT_LAYOUT.worldBottom; y += 150) {
      for (const x of [-4, 964]) {
        const lamp = rounded(0.3, 0.16, 1.4, fixtureMaterial, 0.05);
        lamp.position.copy(toWorld({ x, y }, 6.4));
        scene.add(lamp);
        this.lamps.push(lamp);
      }
    }
  }

  private concreteTexture(base: string, repeat: number): THREE.CanvasTexture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    // Concrete: layered noise, trowel marks, scuffs and expansion joints.
    for (let i = 0; i < 26000; i += 1) {
      const shade = 70 + Math.random() * 40;
      ctx.fillStyle = `rgba(${shade},${shade + 8},${shade + 10},${Math.random() * 0.18})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    for (let i = 0; i < 40; i += 1) {
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 30 + Math.random() * 90);
      gradient.addColorStop(0, `rgba(25,30,32,${0.08 + Math.random() * 0.12})`);
      gradient.addColorStop(1, 'rgba(25,30,32,0)');
      ctx.save();
      ctx.translate(Math.random() * size, Math.random() * size);
      ctx.scale(1, 0.4 + Math.random());
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(25,30,32,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= size; i += size / 2) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = 8;
    return texture;
  }

  private addShell(): void {
    const scene = this.scene;
    // The lower ground: truck courts, the outer bays and the lower floor.
    const groundTop = -23;
    const groundEnd = toWorldZ(SHIFT_LAYOUT.bulkRearWall.y - SHIFT_LAYOUT.bulkRearWall.height / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, groundEnd - groundTop), new THREE.MeshStandardMaterial({ map: this.concreteTexture('#3d494c', 6), roughness: 0.86, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = (groundTop + groundEnd) / 2;
    floor.receiveShadow = true;
    floor.userData.keep = true;
    this.groundSurface = floor;
    scene.add(floor);

    const wall = standard(PALETTE.wall, 0.9);
    const backZ = toWorldZ(SHIFT_LAYOUT.worldTop) - 0.4;
    // Real receiving openings: a single solid wall used to pass directly
    // through both articulated trailers behind the painted door rectangles.
    for (const [from, to] of [[-20, -5.175], [-1.575, 1.575], [5.175, 20]]) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(to - from, 7.4, 0.4), wall);
      back.position.set((from + to) / 2, 3.7, backZ);
      back.receiveShadow = true;
      scene.add(back);
    }
    for (const x of [toWorldX(372), toWorldX(588)]) {
      for (const [bottom, top] of [[0, PLATFORM_HEIGHT], [PLATFORM_HEIGHT + 3.4, 7.4]]) {
        const surround = new THREE.Mesh(new THREE.BoxGeometry(3.6, top - bottom, 0.4), wall);
        surround.position.set(x, (bottom + top) / 2, backZ);
        surround.receiveShadow = true;
        scene.add(surround);
      }
    }
    // One solid terminal wall closes the depot behind bulk and both side drops.
    // The follow camera stays on its interior side; there is no rear landing.
    const rear = SHIFT_LAYOUT.bulkRearWall;
    const southZ = toWorldZ(rear.y + rear.height / 2);
    const south = new THREE.Mesh(new THREE.BoxGeometry(rear.width * WORLD_SCALE, 7.4, rear.height * WORLD_SCALE), wall);
    south.position.copy(toWorld(rear, 3.7));
    south.receiveShadow = true;
    south.userData.keep = true;
    south.name = 'final-depot-wall';
    this.bulkRearWall = south;
    scene.add(south);
    // Close the 20cm seams to the shell's inner side faces at ±15.2m.
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7.4, rear.height * WORLD_SCALE), wall);
      cap.position.set(side * 15.1, 3.7, south.position.z);
      cap.receiveShadow = true;
      scene.add(cap);
    }
    const southSign = textPlane(['BULK / END OF DEPOT'], 5.2, 0.5, { width: 420, height: 40, background: '#13252cdd', color: '#d8c79a' });
    southSign.position.set(0, 4.2, groundEnd - 0.02);
    southSign.rotation.y = Math.PI;
    scene.add(southSign);
    // Each truck row faces an open dock bay, so the fleet can drive out at
    // clock-out. Solid corrugated wall covers receiving and the far end.
    const bayTop = toWorldZ(100);
    const bayBottom = toWorldZ(796);
    const pillar = standard(0x2c3c43, 0.6, 0.3);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(30, groundEnd - groundTop), standard(0x101619, 0.95));
    outside.rotation.x = -Math.PI / 2;
    for (const side of [-1, 1]) {
      const segments: [number, number][] = [[-22, bayTop], [bayBottom, southZ]];
      for (const [from, to] of segments) {
        const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.4, to - from), wall);
        sideWall.position.set(side * 15.4, 3.7, (from + to) / 2);
        sideWall.receiveShadow = true;
        scene.add(sideWall);
        // Corrugated wall panels and a painted dado catch the light.
        for (let z = from + 0.6; z < to; z += 1.2) {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 6.8, 0.12), standard(0x24343b, 0.8));
          rib.position.set(side * 15.18, 3.5, z);
          scene.add(rib);
        }
        const dado = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, to - from), standard(0x33505a, 0.7));
        dado.position.set(side * 15.16, 0.55, (from + to) / 2);
        scene.add(dado);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.0, bayBottom - bayTop), wall);
      lintel.position.set(side * 15.4, 5.9, (bayTop + bayBottom) / 2);
      scene.add(lintel);
      for (const y of [100, 196, 292, 388, 484, 580, 676, 796]) {
        const post = rounded(0.36, 4.4, 0.3, pillar, 0.04);
        post.position.set(side * 15.4, 2.2, toWorldZ(y));
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.0, 0.32), standard(PALETTE.safety, 0.6));
        stripe.position.set(side * 15.4, 0.5, toWorldZ(y));
        scene.add(shadowed(post), stripe);
      }
      for (const y of [148, 244, 340, 436, 532, 628, 740]) {
        // Rolled-up shutter drums above each open bay.
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.7, 14), standard(0x56656b, 0.5, 0.5));
        drum.rotation.x = Math.PI / 2;
        drum.position.set(side * 15.1, 4.25, toWorldZ(y));
        scene.add(drum);
      }
      const yard = outside.clone();
      yard.position.set(side * 30.6, -0.01, (groundTop + groundEnd) / 2);
      scene.add(yard);
      const yardLight = new THREE.PointLight(0xffa64d, 22, 18, 1.6);
      yardLight.position.set(side * 21, 5, 3);
      scene.add(yardLight);
    }
  }

  /** The raised loading platform: belt, both lanes, every truck's rear door and the bulk pile. */
  private addPlatform(): void {
    const scene = this.scene;
    const { platform, stairs } = SHIFT_LAYOUT;
    const x0 = toWorldX(platform.left);
    const x1 = toWorldX(platform.right);
    const z0 = toWorldZ(platform.top);
    const z1 = toWorldZ(platform.bottom);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, PLATFORM_HEIGHT, z1 - z0), [
      standard(0x27353a, 0.85), standard(0x27353a, 0.85),
      new THREE.MeshStandardMaterial({ map: this.concreteTexture('#55666a', 3), roughness: 0.8, metalness: 0.05 }),
      standard(0x27353a, 0.85), standard(0x27353a, 0.85), standard(0x27353a, 0.85),
    ]);
    deck.position.set((x0 + x1) / 2, PLATFORM_HEIGHT / 2, (z0 + z1) / 2);
    deck.receiveShadow = true;
    deck.castShadow = true;
    deck.userData.keep = true;
    this.platformDeck = deck;
    scene.add(deck);

    // Safety-yellow nosing along every drop-off edge, bright enough to read in the dark.
    const nosing = new THREE.MeshStandardMaterial({ color: PALETTE.safety, emissive: PALETTE.safety, emissiveIntensity: 0.4, roughness: 0.5 });
    const edge = (x: number, z: number, w: number, d: number): void => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), nosing);
      strip.position.set(x, PLATFORM_HEIGHT + 0.02, z);
      scene.add(strip);
    };
    for (const x of [x0 + 0.06, x1 - 0.06]) edge(x, (z0 + z1) / 2, 0.12, z1 - z0);
    edge((x0 + x1) / 2, z1 - 0.06, x1 - x0, 0.12);
    // Guard rails leave the side stair entrances open.
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0xe0b23c, roughness: 0.4, metalness: 0.3, emissive: 0x3a2a08, emissiveIntensity: 0.4 });
    const railRun = (ax: number, az: number, bx: number, bz: number): void => {
      const length = Math.hypot(bx - ax, bz - az);
      for (const h of [0.55, 1.05]) {
        // A cylinder laid along local Z, turned to run from a to b.
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, length, 8), railMaterial);
        bar.rotation.x = Math.PI / 2;
        const pivot = new THREE.Group();
        pivot.position.set((ax + bx) / 2, PLATFORM_HEIGHT + h, (az + bz) / 2);
        pivot.rotation.y = Math.atan2(bx - ax, bz - az);
        pivot.add(bar);
        scene.add(pivot);
      }
      const posts = Math.max(1, Math.round(length / 1.6));
      for (let i = 0; i <= posts; i += 1) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 8), railMaterial);
        post.position.set(ax + (bx - ax) * i / posts, PLATFORM_HEIGHT + 0.525, az + (bz - az) * i / posts);
        scene.add(post);
      }
    };
    // Worker bounds allow their shoulders to reach the deck edge. Mount these
    // rails just outside it, as with the stair handrails, to keep that space clear.
    for (const x of [x0 - 0.06, x1 + 0.06]) railRun(x, toWorldZ(-200), x, toWorldZ(100));
    // The east bay beside bulk holds the fish tank; the west one is Ralph's dock.
    railRun(x1 + 0.06, toWorldZ(SHIFT_LAYOUT.fishTank.y - 40), x1 + 0.06, toWorldZ(SHIFT_LAYOUT.fishTank.y + 40));

    // Each flight runs outward from a side of the deck. Its solid treads use
    // exactly the shared model's discrete heights; the last interval is floor.
    const steps = stairs.steps;
    const rise = PLATFORM_HEIGHT / steps;
    const tread = standard(0x5d6d70, 0.6, 0.3);
    const nose = new THREE.MeshStandardMaterial({ color: PALETTE.safety, emissive: PALETTE.safety, emissiveIntensity: 0.3 });
    const flightDepth = (stairs.maxY - stairs.minY) * WORLD_SCALE;
    const centerZ = toWorldZ((stairs.minY + stairs.maxY) / 2);
    for (const side of ['left', 'right'] as const) {
      const flight = stairs[side];
      const startX = toWorldX(flight.topX);
      const endX = toWorldX(flight.bottomX);
      const direction = Math.sign(endX - startX);
      const length = Math.abs(endX - startX);
      const run = length / steps;
      for (let i = 0; i < steps - 1; i += 1) {
        const height = PLATFORM_HEIGHT - rise * (i + 1);
        const step = new THREE.Mesh(new THREE.BoxGeometry(run, height, flightDepth), tread);
        step.position.set(startX + direction * run * (i + 0.5), height / 2, centerZ);
        step.receiveShadow = true;
        step.userData.keep = true;
        this.stairTreads.push({ side, index: i, mesh: step });
        const lip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, flightDepth), nose);
        lip.position.set(startX + direction * (run * i + 0.03), height + 0.012, centerZ);
        scene.add(step, lip);
      }
      // Rails sit outside the full physical flight width, clear of shoulders.
      for (const edgeY of [stairs.minY - 2, stairs.maxY + 0.5]) {
        const railZ = toWorldZ(edgeY);
        const hand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(length, PLATFORM_HEIGHT), 8), railMaterial);
        hand.position.set((startX + endX) / 2, PLATFORM_HEIGHT / 2 + 0.9, railZ);
        hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(endX - startX, -PLATFORM_HEIGHT, 0).normalize());
        hand.userData.keep = true;
        this.stairRails.push(hand);
        scene.add(hand);
        for (const t of [0.05, 0.5, 0.95]) {
          const ground = PLATFORM_HEIGHT * (1 - t);
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), railMaterial);
          post.position.set(startX + (endX - startX) * t, ground + 0.45, railZ);
          post.userData.keep = true;
          this.stairRails.push(post);
          scene.add(post);
        }
      }
      const sign = textPlane([side === 'left' ? '◀ STAIRS' : 'STAIRS ▶', streetRange(side === 'left' ? 'T' : 'S')], 1.6, 0.5, {
        width: 190, height: 60, background: '#13252ce6', color: '#e8c04a', radius: 6,
      });
      sign.position.set(startX - direction * 0.6, PLATFORM_HEIGHT + 1.55, toWorldZ(stairs.minY) - 0.15);
      scene.add(sign);
    }

    // Short crew steps in the aisles between parked trucks: the outer-bay crew
    // climb them to reach the belt and their trucks' rear doors.
    for (const y of [196, 292, 388, 484]) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i += 1) {
          const height = PLATFORM_HEIGHT * (i + 1) / 3;
          const width = 20 * WORLD_SCALE / 3;
          const distance = (2.5 - i) * width;
          const step = new THREE.Mesh(new THREE.BoxGeometry(width, height, 24 * WORLD_SCALE), tread);
          step.position.set(side < 0 ? x0 - distance : x1 + distance, height / 2, toWorldZ(y));
          scene.add(step);
        }
      }
    }

  }

  private addBelt(): THREE.Texture {
    const scene = this.scene;
    const top = toWorldZ(SHIFT_LAYOUT.beltTop);
    const bottom = toWorldZ(SHIFT_LAYOUT.beltBottom);
    const length = bottom - top;
    const center = (top + bottom) / 2;
    const x = toWorldX(SHIFT_LAYOUT.beltX);
    const deck = PLATFORM_HEIGHT;

    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1f2427';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = '#2c3338';
      ctx.fillRect(0, i * 32 + 2, 128, 26);
      ctx.fillStyle = '#3a4248';
      ctx.fillRect(0, i * 32 + 2, 128, 3);
      ctx.fillStyle = '#121618';
      ctx.fillRect(0, i * 32 + 28, 128, 4);
      ctx.fillStyle = '#4b555b';
      for (const bolt of [10, 118]) ctx.fillRect(bolt - 2, i * 32 + 13, 4, 4);
    }
    const tread = new THREE.CanvasTexture(canvas);
    tread.colorSpace = THREE.SRGBColorSpace;
    tread.wrapS = tread.wrapT = THREE.RepeatWrapping;
    tread.repeat.set(1, length / 1.0);
    tread.anisotropy = 8;
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(BELT_WIDTH, length), new THREE.MeshStandardMaterial({ map: tread, roughness: 0.7, metalness: 0.15 }));
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(x, BELT_HEIGHT, center);
    surface.receiveShadow = true;
    scene.add(surface);

    const rail = standard(PALETTE.metal, 0.38, 0.75);
    const railDark = standard(PALETTE.metalDark, 0.5, 0.6);
    for (const side of [-1, 1]) {
      const sideRail = rounded(0.14, 0.34, length + 0.5, rail, 0.04);
      sideRail.position.set(x + side * (BELT_WIDTH / 2 + 0.07), BELT_HEIGHT - 0.05, center);
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, length), railDark);
      skirt.position.set(x + side * (BELT_WIDTH / 2 - 0.02), BELT_HEIGHT - 0.26, center);
      // A thin safety-yellow lip, emissive enough to read in the dark.
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, length + 0.5), new THREE.MeshStandardMaterial({ color: PALETTE.safety, emissive: PALETTE.safety, emissiveIntensity: 0.35 }));
      lip.position.set(x + side * (BELT_WIDTH / 2 + 0.15), BELT_HEIGHT + 0.13, center);
      scene.add(shadowed(sideRail), skirt, lip);
      // The legs stand on the platform deck: the belt is at working height for the crew beside it.
      for (let z = top + 0.4; z < bottom; z += 1.6) {
        const leg = rounded(0.12, BELT_WORK_HEIGHT - 0.2, 0.12, railDark, 0.03);
        leg.position.set(x + side * (BELT_WIDTH / 2), deck + (BELT_WORK_HEIGHT - 0.2) / 2, z);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.26), railDark);
        foot.position.set(leg.position.x, deck + 0.02, z);
        scene.add(shadowed(leg), foot);
      }
    }
    for (const z of [top, bottom]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, BELT_WIDTH + 0.04, 18), standard(0x8d979c, 0.3, 0.85));
      roller.rotation.z = Math.PI / 2;
      roller.position.set(x, BELT_HEIGHT - 0.2, z);
      scene.add(shadowed(roller));
      this.beltRollers.push(roller);
    }
    // Head drive and nameplate at the feed end.
    const motor = rounded(BELT_WIDTH + 0.6, 0.8, 0.9, standard(0x35464d, 0.5, 0.4), 0.08);
    motor.position.set(x, BELT_HEIGHT + 0.12, top - 0.55);
    const plate = textPlane(['FEED / 01'], 1.3, 0.3, { width: 160, height: 36, background: '#e8b765', color: '#1b2226' });
    plate.position.set(x, BELT_HEIGHT + 0.3, top - 0.09);
    scene.add(shadowed(motor), plate);

    // Stop and start pedestals beside the conveyor.
    this.stopCap = this.addButton({ x: 436, y: 360 }, 'STOP', 0xc2443b);
    this.startCap = this.addButton({ x: 524, y: 360 }, 'START', 0x4aa25a);
    return tread;
  }

  private addButton(point: { x: number; y: number }, label: string, color: number): THREE.Mesh {
    const group = new THREE.Group();
    const post = rounded(0.32, 1.0, 0.32, standard(0x3f4d53, 0.5, 0.4), 0.05);
    post.position.y = 0.5;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.08, 20), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3 }));
    cap.position.y = 1.04;
    cap.userData.keep = true;
    const tag = textPlane([label], 0.34, 0.12, { width: 90, height: 30, background: '#e8e2cf', color: '#20262a', radius: 4 });
    tag.position.set(0, 0.78, 0.165);
    group.add(post, cap, tag);
    group.position.copy(toWorld(point, PLATFORM_HEIGHT));
    this.scene.add(shadowed(group));
    return cap;
  }

  /** Lights a belt button: pressed (amber), ready (its own colour) or dim. */
  public setButton(which: 'stop' | 'start', state: 'ready' | 'pressed' | 'lit'): void {
    const cap = which === 'stop' ? this.stopCap : this.startCap;
    const material = cap.material as THREE.MeshStandardMaterial;
    const color = state === 'pressed' ? 0xefb574 : which === 'stop' ? 0xc2443b : state === 'lit' ? 0x7ee08a : 0x4aa25a;
    material.color.setHex(color);
    material.emissive.setHex(color);
    material.emissiveIntensity = state === 'ready' ? 0.6 : 1.8;
    cap.position.y = state === 'pressed' ? 1.0 : 1.04;
  }

  /** The shared bulk stock shows exactly the crates not yet collected by Ralph. */
  public setBulkCount(count: number): void {
    this.bulkStack.children.forEach((crate, index) => { crate.visible = index < count; });
  }

  /** Each lower-floor drop shows one box per parcel delivered there. */
  public setFloorPile(route: 'T' | 'S', count: number): void {
    this.floorPiles[route].count = Math.min(count, this.floorPiles[route].instanceMatrix.count);
  }

  /** Open the view into the currently occupied truck, restoring its roof on exit. */
  public updateTruckInterior(worker: { x: number; y: number }): void {
    const inside = truckInteriorAt(worker);
    for (const truck of this.trucks) {
      const roof = truck.group.getObjectByName('truck-roof') as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | undefined;
      if (!roof) continue;
      roof.material.opacity = truck.route === inside ? 0.12 : 1;
      roof.material.depthWrite = truck.route !== inside;
      const sign = truck.group.getObjectByName('truck-roof-sign');
      if (sign) sign.visible = truck.route !== inside;
    }
  }

  /** Inside the open rear door of a player truck, at deck height. */
  public truckRear(route: PlayerTruckRoute): THREE.Vector3 {
    const truck = SHIFT_LAYOUT.playerTrucks[route];
    const inward = truck.x < 480 ? -1 : 1;
    return toWorld({ x: truck.x + inward * -50, y: truck.y }, PLATFORM_HEIGHT + 0.5);
  }

  private addBulkCrates(): void {
    for (let index = 0; index < 12; index += 1) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.5), standard(index % 2 ? 0xb8875a : 0xa47650, 0.9));
      crate.castShadow = crate.receiveShadow = true;
      crate.position.set(-0.6 + (index % 3) * 0.6, 0.21 + Math.floor(index / 6) * 0.43, -0.3 + (Math.floor(index / 3) % 2) * 0.6);
      crate.rotation.y = (index * 0.37) % 0.3 - 0.15;
      crate.visible = false;
      this.bulkStack.add(crate);
    }
  }

  /** RALPH 5 TON: a grey/yellow flatbed with five visible cargo slots. Its bed is at deck height. */
  private addRalphTruck(): void {
    const truck = this.ralphTruck;
    const length = 148 * WORLD_SCALE;
    const depth = SHIFT_LAYOUT.truckDepth * WORLD_SCALE;
    const lift = PLATFORM_HEIGHT - 0.975;
    const body = standard(0x69777b, 0.5, 0.3);
    const trim = standard(0xa2b0a7, 0.5, 0.3);
    const accent = standard(0xc6ad62, 0.45, 0.2);
    const cab = rounded(1.2, 1.8, depth - 0.1, body, 0.18);
    cab.position.set(length / 2 - 0.6, 1.25 + lift / 2, 0);
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(depth - 0.4, 0.62), standard(0x9cc8dc, 0.05, 0.6));
    windshield.position.set(length / 2 + 0.003, 1.6 + lift / 2, 0);
    windshield.rotation.y = Math.PI / 2;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.16, depth - 0.06), accent);
    stripe.position.set(length / 2 - 0.6, 0.9 + lift / 2, 0);
    const bed = rounded(length - 1.3, 0.25, depth, trim, 0.05);
    bed.position.set(-0.65, 0.85 + lift, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(length - 1.4, lift + 0.2, depth - 0.4), standard(0x2a2f33, 0.6, 0.4));
    frame.position.set(-0.65, 0.62 + lift / 2, 0);
    truck.add(cab, windshield, stripe, bed, frame);
    for (const sz of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length - 1.3, 0.3, 0.08), accent);
      rail.position.set(-0.65, 1.12 + lift, sz * (depth / 2 - 0.04));
      truck.add(rail);
      for (const along of [length / 2 - 0.6, -length / 2 + 0.7, -length / 2 + 1.6]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 18), standard(0x161819, 0.9));
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(along, 0.38, sz * (depth / 2 - 0.08));
        truck.add(wheel);
      }
    }
    // Five painted slots, each filled by one crate Ralph carries from bulk.
    for (let slot = 0; slot < 5; slot += 1) {
      const x = -length / 2 + 0.55 + slot * 0.66;
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.56, depth - 0.5), new THREE.MeshStandardMaterial({ color: 0xc6ad62, transparent: true, opacity: 0.35 }));
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(x, 0.985 + lift, 0);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.5), standard(slot % 2 ? 0xb8875a : 0xa47650, 0.9));
      crate.position.set(x, 1.2 + lift, 0);
      crate.castShadow = true;
      crate.visible = false;
      crate.userData.keep = true;
      truck.add(mark, crate);
      this.ralphLoad.push(crate);
    }
    const plate = textPlane(['RALPH 5 TON'], 1.1, 0.3, { width: 160, height: 40, background: '#c6ad62', color: '#1d2328' });
    plate.position.set(length / 2 - 0.6, 1.55 + lift / 2, depth / 2 - 0.04);
    const roofPlate = textPlane(['RALPH', '5 TON'], 1.0, 0.7, { width: 140, height: 100, background: '#1d2328', color: '#e7d39a' });
    roofPlate.rotation.x = -Math.PI / 2;
    roofPlate.position.set(length / 2 - 0.6, 2.16 + lift / 2, 0);
    truck.add(plate, roofPlate);
    shadowed(truck);
    // The cab faces west, out of the bay; the flatbed backs up to the platform.
    truck.rotation.y = Math.PI;
    truck.position.copy(toWorld({ x: RALPH_BAY.from, y: RALPH_BAY.y }));
    truck.visible = false;
    this.scene.add(truck);
  }

  public setRalphLoad(count: number): void {
    this.ralphLoad.forEach((crate, index) => { crate.visible = index < count; });
  }

  private addReceiving(): void {
    const scene = this.scene;
    const backZ = toWorldZ(SHIFT_LAYOUT.worldTop);
    // Dock doors in the back wall with lit frames, at deck height.
    for (const x of [372, 588]) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.4), standard(0x0c1418, 0.9));
      door.position.set(toWorldX(x), PLATFORM_HEIGHT + 1.7, backZ - 0.19);
      const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.safety, emissive: PALETTE.safety, emissiveIntensity: 0.25 });
      for (const sx of [-1, 1]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.6, 0.1), frameMat);
        jamb.position.set(toWorldX(x) + sx * 1.9, PLATFORM_HEIGHT + 1.8, backZ - 0.15);
        scene.add(jamb);
      }
      scene.add(door);
    }
    // Two articulated trailers backed into the doors, being unloaded at deck height.
    for (const [x, tilt] of [[372, 0.06], [588, -0.06]] as const) {
      const trailer = new THREE.Group();
      const box = rounded(3.1, 3.0, 6.2, standard(0xd9dcd6, 0.55, 0.15), 0.08);
      box.position.set(0, 1.85, -3.1);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.12, 0.3, 6.0), standard(x < 480 ? 0x2d6f9b : 0xb5432f, 0.5));
      stripe.position.set(0, 1.0, -3.1);
      const deck = rounded(3.0, 0.15, 1.1, standard(0x575f63, 0.5, 0.6), 0.03);
      deck.position.set(0, 0.35, 0.4);
      trailer.add(box, stripe, deck);
      for (let i = 0; i < 6; i += 1) {
        const cargo = rounded(0.6, 0.5, 0.5, standard(i % 2 ? PALETTE.cardboard : 0xa47650, 0.9), 0.03);
        cargo.position.set(-0.8 + (i % 3) * 0.8, 0.6 + Math.floor(i / 3) * 0.52, -0.6 - (i % 2) * 0.6);
        trailer.add(cargo);
      }
      trailer.position.set(toWorldX(x), PLATFORM_HEIGHT - 0.35, backZ + 0.6);
      trailer.rotation.y = tilt;
      scene.add(shadowed(trailer));
    }
    // Two angled feeder conveyors merge into the head of the main belt.
    const target = toWorld({ x: SHIFT_LAYOUT.beltX, y: 112 }, 0);
    for (const x of [372, 588]) {
      const start = toWorld({ x, y: -150 }, 0);
      const span = target.clone().sub(start);
      const length = span.length();
      const feeder = new THREE.Group();
      const bed = rounded(1.2, 0.12, length, standard(0x2b3236, 0.6, 0.3), 0.03);
      bed.position.y = BELT_HEIGHT - 0.06;
      feeder.add(bed);
      for (let z = -length / 2 + 0.2; z < length / 2; z += 0.32) {
        const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 10), standard(0x9aa3a8, 0.35, 0.8));
        roller.rotation.z = Math.PI / 2;
        roller.position.set(0, BELT_HEIGHT + 0.03, z);
        feeder.add(roller);
      }
      for (const side of [-1, 1]) {
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, length), standard(PALETTE.safety, 0.5));
        guard.position.set(side * 0.62, BELT_HEIGHT + 0.12, 0);
        feeder.add(guard);
        for (let z = -length / 2 + 0.3; z < length / 2; z += 1.4) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, BELT_WORK_HEIGHT, 0.08), standard(PALETTE.metalDark, 0.5));
          leg.position.set(side * 0.5, PLATFORM_HEIGHT + BELT_WORK_HEIGHT / 2, z);
          feeder.add(leg);
        }
      }
      feeder.position.copy(start.clone().add(target).multiplyScalar(0.5));
      feeder.rotation.y = Math.atan2(span.x, span.z);
      scene.add(shadowed(feeder));
    }
    const receivingTag = textPlane(['RECEIVING / NIGHT FREIGHT'], 4.2, 0.45, { width: 360, height: 40, background: '#13252cdd', color: '#d8c79a' });
    receivingTag.position.set(0, 5.6, backZ - 0.18);
    scene.add(receivingTag);
  }

  private addDocks(): void {
    const scene = this.scene;
    const deck = PLATFORM_HEIGHT;

    // Permanent street lettering is a readable clue, without safe-zone outlines.
    for (const route of ['A', 'B', 'D', 'E'] as const) {
      const truck = SHIFT_LAYOUT.playerTrucks[route];
      const street = textPlane([streetRange(route)], 2.0, 0.62, { width: 320, height: 90, color: '#f2e6c8', font: '900 SIZEpx "Segoe UI", Arial, sans-serif' });
      street.rotation.x = -Math.PI / 2;
      street.position.copy(toWorld({ x: truck.x < 480 ? 365 : 595, y: truck.y }, deck + 0.012));
      street.name = 'floor-street-range'; street.userData.keep = true;
      scene.add(street);
    }
    // Shared bulk cage beyond the belt end, on the deck.
    const bulk = toWorld(SHIFT_LAYOUT.bulkPile);
    const pallet = rounded(2.0, 0.16, 1.5, standard(0x8c6a42, 0.9), 0.02);
    pallet.position.set(bulk.x, deck + 0.08, bulk.z);
    const cageMat = standard(0x6b7a80, 0.4, 0.7);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6), cageMat);
      post.position.set(bulk.x + sx * 0.98, deck + 0.65, bulk.z + sz * 0.73);
      scene.add(post);
    }
    const bulkSign = textPlane(['BULK'], 1.0, 0.3, { width: 120, height: 36, background: ROUTE_COLORS.C, color: '#1b1f22' });
    bulkSign.position.set(bulk.x, deck + 1.45, bulk.z - 0.74);
    scene.add(shadowed(pallet), bulkSign);
    this.bulkStack.position.set(bulk.x, deck + 0.16, bulk.z);

    // Recovery tray for missed freight, hazard-striped.
    const tray = toWorld(SHIFT_LAYOUT.recoveryPile);
    const stripes = document.createElement('canvas');
    stripes.width = 128; stripes.height = 16;
    const sctx = stripes.getContext('2d')!;
    sctx.fillStyle = '#e8c04a'; sctx.fillRect(0, 0, 128, 16);
    sctx.fillStyle = '#1c1c1c';
    for (let i = -16; i < 128; i += 16) { sctx.beginPath(); sctx.moveTo(i, 16); sctx.lineTo(i + 8, 0); sctx.lineTo(i + 16, 0); sctx.lineTo(i + 8, 16); sctx.fill(); }
    const stripeTex = new THREE.CanvasTexture(stripes);
    stripeTex.colorSpace = THREE.SRGBColorSpace;
    stripeTex.wrapS = THREE.RepeatWrapping;
    stripeTex.repeat.set(3, 1);
    const trayBase = rounded(3.4, 0.12, 1.2, standard(0x2c3a40, 0.8), 0.03);
    trayBase.position.set(tray.x, deck + 0.06, tray.z);
    scene.add(shadowed(trayBase, false, true));
    for (const [w, d, ox, oz] of [[3.4, 0.08, 0, -0.6], [3.4, 0.08, 0, 0.6], [0.08, 1.2, -1.7, 0], [0.08, 1.2, 1.7, 0]] as const) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 }));
      lip.position.set(tray.x + ox, deck + 0.15, tray.z + oz);
      scene.add(lip);
    }
    const trayTag = textPlane(['RECOVERY'], 1.2, 0.26, { width: 140, height: 30, background: '#e05c4bdd', color: '#fff6e8' });
    trayTag.rotation.x = -Math.PI / 2;
    trayTag.position.set(tray.x, deck + 0.13, tray.z + 0.3);
    scene.add(trayTag);
  }

  /** The two lower-floor drops: street numbers, pallets, tall signs and tidy piles. */
  private addLowerFloor(): void {
    for (const route of ['T', 'S'] as const) {
      const area = SHIFT_LAYOUT.dropAreas[route];
      const storage = SHIFT_LAYOUT.floorStorage[route];
      const pad = new THREE.Mesh(new THREE.BoxGeometry(storage.width / 32 + 0.2, 0.035, storage.height / 32 + 0.06), standard(0x68777a, 0.9));
      pad.position.copy(toWorld(storage, 0.0175));
      this.scene.add(pad);
      const wood = standard(0xa78155, 0.9);
      for (const offset of [-16, 0, 16]) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, storage.height / 32 - 0.08), wood);
        slat.position.copy(toWorld({ x: storage.x + offset, y: storage.y }, 0.08));
        this.scene.add(shadowed(slat));
      }
      const street = textPlane([streetRange(route), ROUTE_INFO[route].name], 1.5, 0.9, { width: 300, height: 160, color: '#f2e6c8' });
      street.rotation.x = -Math.PI / 2;
      street.position.copy(toWorld(area, 0.012));
      street.name = 'floor-street-range'; street.userData.keep = true;
      this.scene.add(street);
      // A tall sign post keeps the letter and name readable above the pile.
      const center = toWorld(area);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), standard(0x3f4d53, 0.5, 0.4));
      post.position.set(center.x + (route === 'T' ? -3.125 : 3.125), 1.2, center.z + 1.0);
      const sign = textPlane([ROUTE_INFO[route].name, streetRange(route), 'FLOOR DROP'], 2.1, 0.9, {
        width: 300, height: 120, background: '#d9ccab', color: '#14232a', radius: 8,
      });
      sign.position.set(post.position.x, 2.3, post.position.z);
      sign.rotation.y = route === 'T' ? 0.3 : -0.3;
      this.scene.add(shadowed(post), sign);
      // Up to 36 parcels show as a growing, orderly pile.
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
      const pile = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.42, 0.5), material, 36);
      const matrix = new THREE.Matrix4();
      const tint = new THREE.Color();
      for (let index = 0; index < 36; index += 1) {
        const slot = floorPileSlot(route, index);
        const position = toWorld(slot, 0.335 + slot.layer * 0.43);
        matrix.makeRotationY(((index * 0.37) % 0.3) - 0.15).setPosition(position);
        pile.setMatrixAt(index, matrix);
        pile.setColorAt(index, tint.setHex(index % 3 === 0 ? 0xb8875a : index % 3 === 1 ? 0xa47650 : 0xc39f6b));
      }
      pile.count = 0;
      pile.castShadow = pile.receiveShadow = true;
      pile.userData.keep = true;
      this.floorPiles[route] = pile;
      this.scene.add(pile);
    }
  }

  private addTrucks(): void {
    const crew: [string, number, number, 'left' | 'right', number, number?][] = [
      ['HUSSAN', 244, 148, 'left', 0xa9875b], ['AJ', 244, 244, 'left', 0xb59a6e],
      ['PAULA ABDUL', 244, 340, 'left', 0x7d4d9c, 0x6a3f86], ['BANNERMAN', 244, 436, 'left', 0xa58457],
      ['FRUIT LOOP', 716, 148, 'right', 0xb08b5d], ['DORIS', 716, 244, 'right', 0xa98a63],
      ['BRIAN', 716, 340, 'right', 0x9f7e52], ['DONNA', 716, 436, 'right', 0xb1916a],
    ];
    for (const [name, x, y, side, color, cabColor] of crew) this.placeTruck(name, x, y, side, color, cabColor ?? 0xd4cbb4);
    // Termite's and Skanky's four trucks back flush against the platform edge.
    for (const { route } of PLAYER_TRUCKS) {
      const { x, y } = SHIFT_LAYOUT.playerTrucks[route];
      this.placeTruck(ROUTE_INFO[route].name, x, y, x < 480 ? 'left' : 'right', 0x827a67, 0xc2bba4, route);
    }
  }

  private placeTruck(name: string, x: number, y: number, side: 'left' | 'right', color: number, cabColor: number, route?: PlayerTruckRoute): void {
    const truck = createTruck(name, color, cabColor, side, route);
    truck.position.copy(toWorld({ x, y }));
    this.scene.add(truck);
    this.trucks.push({
      name, group: truck, homeX: truck.position.x, direction: side === 'left' ? -1 : 1,
      stack: truck.getObjectByName('stack-top')!,
      cabDoor: { x: x + (side === 'left' ? -88 : 88), y }, route,
    });
  }

  /** Clock-out: every named truck drives forward out through its dock bay. */
  public departTrucks(progress: number): void {
    const eased = progress * progress;
    for (const truck of this.trucks) {
      const distance = eased * 16;
      truck.group.position.x = truck.homeX + truck.direction * distance;
    }
  }

  private addResidents(): void {
    for (const [id, x, y, spec] of RESIDENTS) {
      const character = createCharacter(spec);
      const home = toWorld({ x, y });
      character.root.position.copy(home);
      character.root.rotation.y = x < 480 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5;
      this.scene.add(character.root);
      this.residents.set(id, { id, character, home });
      this.addSignatureProp(id, character);
    }
  }

  /** Per-person props named in the original cast inventory. */
  private addSignatureProp(id: string, character: Character): void {
    const at = (x: number, y: number): THREE.Vector3 => toWorld({ x, y });
    if (id === 'hussan') {
      const phone = rounded(0.07, 0.14, 0.02, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x5aa0ff, emissiveIntensity: 0.6 }), 0.01);
      phone.position.set(0, -0.08, 0.03);
      character.rightHand.add(phone);
      character.rightArm.rotation.set(-1.65, -0.5, 0.3);
      character.rightForearm.rotation.x = -2.3;
      character.leftArm.rotation.set(-0.9, 0, 0.4);
    } else if (id === 'aj') {
      const table = new THREE.Group();
      const top = rounded(0.8, 0.14, 2.0, standard(0x2f6f73, 0.6), 0.06);
      top.position.y = 0.78;
      const face = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 14), standard(0x245457, 0.7));
      face.rotation.x = Math.PI / 2;
      face.position.set(0, 0.86, 0.85);
      table.add(top, face);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), standard(0xb0b6b8, 0.3, 0.8));
        leg.position.set(sx * 0.32, 0.37, sz * 0.85);
        table.add(leg);
      }
      table.position.copy(at(100, 300));
      this.scene.add(shadowed(table));
    } else if (id === 'ben') {
      // Ben's literal small purple shoulder demon.
      const demon = new THREE.Group();
      const purple = new THREE.MeshStandardMaterial({ color: 0x8a4fb8, roughness: 0.5, emissive: 0x3a1450, emissiveIntensity: 0.4 });
      const torso = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), purple);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), purple);
      head.position.y = 0.12;
      demon.add(torso, head);
      for (const sx of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 6), standard(0xe8d8a8, 0.5));
        horn.position.set(sx * 0.04, 0.2, 0);
        horn.rotation.z = -sx * 0.4;
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 3), purple);
        wing.position.set(sx * 0.1, 0.05, -0.04);
        wing.rotation.z = sx * 1.2;
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshStandardMaterial({ color: 0xff5040, emissive: 0xff3020, emissiveIntensity: 2 }));
        eye.position.set(sx * 0.025, 0.13, 0.06);
        demon.add(horn, wing, eye);
      }
      demon.position.set(0.3, 1.5, 0);
      character.body.add(demon);
    } else if (id === 'bannerman') {
      const colors = [0xd8352a, 0x2b6fd0, 0xf2c230, 0x3aa04a, 0xf2f2f2];
      for (let i = 0; i < 9; i += 1) {
        const brick = new THREE.Group();
        const material = standard(colors[i % colors.length], 0.35);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.16), material);
        brick.add(base);
        for (let s = 0; s < 4; s += 1) {
          const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), material);
          stud.position.set(-0.12 + s * 0.08, 0.075, 0);
          brick.add(stud);
        }
        brick.position.copy(at(108 + (i % 3) * 12, 470 + Math.floor(i / 3) * 8)).add(new THREE.Vector3(0, 0.06 + Math.floor(i / 4) * 0.12, 0));
        brick.rotation.y = i * 0.7;
        this.scene.add(shadowed(brick));
      }
    } else if (id === 'doris') {
      const cigarette = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), standard(0xf3efe6, 0.6));
      cigarette.rotation.x = Math.PI / 2;
      cigarette.position.set(0.06, 0.15, 0.24);
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), new THREE.MeshStandardMaterial({ color: 0xff6a20, emissive: 0xff5010, emissiveIntensity: 4 }));
      ember.position.set(0.06, 0.15, 0.3);
      ember.userData.keep = true;
      character.head.add(cigarette, ember);
      this.emitters.push({ anchor: ember, kind: 'smoke', timer: 0 });
    } else if (id === 'brian') {
      this.emitters.push({ anchor: character.body, kind: 'stink', timer: 0 });
    }
  }

  private addDonnaHusband(): THREE.CanvasTexture {
    // Donna's husband at the computer, playing Warcraft.
    const desk = new THREE.Group();
    const top = rounded(1.3, 0.08, 0.7, standard(0x5b4636, 0.7), 0.02);
    top.position.y = 0.74;
    desk.add(top);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.6), standard(0x463528, 0.8));
      leg.position.set(sx * 0.6, 0.37, 0);
      desk.add(leg);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 160;
    const screenTexture = new THREE.CanvasTexture(canvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    const monitor = rounded(0.72, 0.48, 0.06, standard(0x1a1c1e, 0.4), 0.02);
    monitor.position.set(0, 1.08, -0.2);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.41), new THREE.MeshStandardMaterial({ map: screenTexture, emissive: 0xffffff, emissiveMap: screenTexture, emissiveIntensity: 1.1 }));
    screen.position.set(0, 1.08, -0.165);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), standard(0x1a1c1e, 0.4));
    stand.position.set(0, 0.86, -0.2);
    desk.add(monitor, screen, stand);
    const husband = createCharacter({ name: "DONNA'S HUSBAND", skin: SKIN.light, shirt: 0x40444c, pants: 0x2b2e33, hair: 0x4a3a2a, hairStyle: 'short', beard: true });
    husband.root.position.set(0, 0, 0.62);
    husband.root.rotation.y = Math.PI;
    // Seated at the desk, hands on the keyboard.
    husband.leftArm.rotation.set(-0.4, 0, 0.15);
    husband.rightArm.rotation.set(-0.4, 0, -0.15);
    bendElbows(husband, -1.1);
    husband.leftLeg.rotation.x = husband.rightLeg.rotation.x = -1.4;
    bendKnees(husband, 1.4);
    husband.body.position.y = 0.42 - BODY.hipY;
    husband.nameTag.position.y = 1.8;
    const chair = rounded(0.5, 0.08, 0.5, standard(0x2c2f34, 0.6), 0.03);
    chair.position.set(0, 0.42, 0.68);
    desk.add(chair, husband.root);
    desk.position.copy(toWorld({ x: 905, y: 520 }));
    desk.rotation.y = -0.5;
    this.scene.add(shadowed(desk));
    return screenTexture;
  }

  private drawWarcraft(time: number): void {
    const canvas = this.warcraft.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#3f6b2c';
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = '#5a8a3a';
    for (let i = 0; i < 18; i += 1) ctx.fillRect((i * 53) % 256, (i * 37) % 120, 30, 18);
    ctx.fillStyle = '#2d5a8a';
    ctx.fillRect(170, 0, 86, 50);
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(30, 30, 40, 34);
    ctx.fillStyle = '#c8a050';
    ctx.fillRect(38, 22, 24, 12);
    for (let i = 0; i < 7; i += 1) {
      const x = 90 + Math.sin(time * 0.8 + i) * 40 + i * 12;
      const y = 80 + Math.cos(time * 0.6 + i * 2) * 22;
      ctx.fillStyle = i < 4 ? '#3a6fd8' : '#d84a3a';
      ctx.fillRect(x, y, 6, 6);
    }
    ctx.fillStyle = '#1c1a16';
    ctx.fillRect(0, 128, 256, 32);
    ctx.fillStyle = '#d8b860';
    ctx.font = 'bold 13px Arial';
    ctx.fillText('GOLD 1250   LUMBER 600', 10, 148);
    this.warcraft.needsUpdate = true;
  }

  private addPaytmanTank(): void {
    const tank = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.5), new THREE.MeshPhysicalMaterial({
      color: 0x8fd4ff, roughness: 0.05, transmission: 0.6, thickness: 0.2, transparent: true, opacity: 0.45,
    }));
    glass.position.y = 0.9;
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.5, 0.44), new THREE.MeshStandardMaterial({ color: 0x2f8ac8, emissive: 0x135a8a, emissiveIntensity: 0.8, transparent: true, opacity: 0.55 }));
    water.position.y = 0.86;
    const stand = rounded(1.2, 0.6, 0.55, standard(0x2b2f33, 0.6), 0.03);
    stand.position.y = 0.3;
    tank.add(stand, water, glass);
    for (let i = 0; i < 4; i += 1) {
      const fish = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffa030 : 0xff5a5a, emissive: 0x552000, emissiveIntensity: 0.6 }));
      fish.rotation.z = Math.PI / 2;
      tank.add(fish);
      this.fish.push(fish);
    }
    // In the empty bay beside Paytman's truck, where no truck drives through.
    tank.position.copy(toWorld(SHIFT_LAYOUT.fishTank));
    this.scene.add(shadowed(tank));
  }

  public update(dt: number, time: number, beltTravel: number, reducedMotion: boolean): void {
    // One texture repeat spans one world unit of belt.
    this.tread.offset.y = beltTravel * WORLD_SCALE;
    for (const roller of this.beltRollers) roller.rotation.x = -beltTravel * WORLD_SCALE / 0.2;
    this.fish.forEach((fish, index) => {
      const t = time * (0.5 + index * 0.13) + index * 1.7;
      fish.position.set(Math.sin(t) * 0.4, 0.8 + Math.sin(t * 1.7) * 0.12, Math.cos(t * 0.8) * 0.12);
      fish.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI;
    });
    this.warcraftClock += dt;
    if (this.warcraftClock > 0.12) {
      this.warcraftClock = 0;
      this.drawWarcraft(time);
    }
    const position = new THREE.Vector3();
    for (const emitter of this.emitters) {
      emitter.timer -= dt;
      if (emitter.timer > 0) continue;
      emitter.anchor.getWorldPosition(position);
      if (emitter.kind === 'smoke') {
        emitter.timer = 0.22;
        this.puffs.emit(position, { color: 0xc9ccd0, size: 0.12, life: 2.6, velocity: new THREE.Vector3(0.05, 0.35, 0), opacity: 0.35, grow: 4 });
      } else {
        // Brian's much larger curling green stink trails.
        emitter.timer = 0.16;
        const swirl = reducedMotion ? 0 : Math.sin(time * 3) * 0.25;
        position.y += 0.6 + Math.random() * 0.8;
        position.x += (Math.random() - 0.5) * 0.7;
        this.puffs.emit(position, { color: 0x8fcf4a, size: 0.32, life: 2.4, velocity: new THREE.Vector3(swirl, 0.42, 0.1), opacity: 0.32, grow: 3, spread: 0.5 });
      }
    }
    this.puffs.update(dt);
  }
}

/**
 * A box truck parked against the platform. The cargo box's floor is at deck
 * height and its roll-up rear door is open onto the platform, so freight is
 * loaded straight through the back.
 */
export function createTruck(name: string, color: number, cabColor: number, side: 'left' | 'right', route?: PlayerTruckRoute, cutaway = false): THREE.Group {
  const truck = new THREE.Group();
  const length = 148 * WORLD_SCALE;
  const depth = (route ? SHIFT_LAYOUT.playerTruckDepth : SHIFT_LAYOUT.truckDepth) * WORLD_SCALE;
  const cabLength = 1.15;
  const boxLength = length - cabLength - 0.1;
  const boxHeight = route ? 2.8 : 2.3;
  const floor = PLATFORM_HEIGHT;
  const facing = side === 'left' ? 1 : -1; // the rear door faces the platform
  const body = standard(color, 0.62, 0.1);
  const boxX = facing * (length / 2 - boxLength / 2);
  // The box is an open-backed shell so its rear opening reads as real depth.
  const wall = 0.08;
  const shell: [number, number, number, number, number, number][] = [
    ...(cutaway || route ? [] : [[boxX, floor + boxHeight - wall / 2, 0, boxLength, wall, depth] as [number, number, number, number, number, number]]),
    [boxX, floor + wall / 2, 0, boxLength, wall, depth],
    [boxX, floor + boxHeight / 2, depth / 2 - wall / 2, boxLength, boxHeight, wall],
    [boxX, floor + boxHeight / 2, -depth / 2 + wall / 2, boxLength, boxHeight, wall],
    [facing * (length / 2 - boxLength) + facing * wall / 2, floor + boxHeight / 2, 0, wall, boxHeight, depth],
  ];
  for (const [x, y, z, w, h, d] of shell) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), body);
    panel.position.set(x, y, z);
    truck.add(panel);
  }
  if (route) {
    const roofMaterial = body.clone();
    roofMaterial.transparent = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(boxLength, wall, depth), roofMaterial);
    roof.name = 'truck-roof'; roof.userData.keep = true;
    roof.position.set(boxX, floor + boxHeight - wall / 2, 0);
    truck.add(roof);
    const shelves = new THREE.Group();
    shelves.name = 'truck-shelves'; shelves.userData.keep = true;
    const shelfMaterial = standard(0x9a7651, 0.8);
    const frameMaterial = standard(0x77888d, 0.45, 0.4);
    for (const row of [-1, 1]) {
      for (let tier = 0; tier < 3; tier++) {
        const board = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 0.72), shelfMaterial);
        board.position.set(facing * 0.5, floor + 0.06 + tier * 0.875, row * 0.875);
        shelves.add(board);
      }
      for (const x of [-1, 2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 2.65, 0.045), frameMaterial);
        post.position.set(facing * x, floor + 1.325, row * 1.18);
        shelves.add(post);
      }
    }
    truck.add(shelves);
  }
  // Dark interior and the cargo floor at deck height.
  const interior = standard(0x161c1f, 0.95);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(depth - wall * 2, boxHeight - wall * 2), interior);
  back.position.set(facing * (length / 2 - boxLength) + facing * (wall + 0.01), floor + boxHeight / 2, 0);
  back.rotation.y = facing * Math.PI / 2;
  const cargoFloor = new THREE.Mesh(new THREE.PlaneGeometry(boxLength - wall, depth - wall * 2), standard(0x4a4f52, 0.7, 0.3));
  cargoFloor.name = 'cargo-floor';
  cargoFloor.userData.keep = true;
  cargoFloor.rotation.x = -Math.PI / 2;
  cargoFloor.position.set(boxX, floor + wall + 0.005, 0);
  truck.add(back, cargoFloor);
  for (const z of [depth / 2 - wall - 0.005, -depth / 2 + wall + 0.005]) {
    const lining = new THREE.Mesh(new THREE.PlaneGeometry(boxLength, boxHeight - wall * 2), interior);
    lining.position.set(boxX, floor + boxHeight / 2, z);
    lining.rotation.y = z > 0 ? Math.PI : 0;
    truck.add(lining);
  }
  // The rolled-up door at the top of the rear opening, and a bright door frame.
  const rolled = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, depth - 0.04), standard(0xb7bcbf, 0.4, 0.6));
  rolled.position.set(facing * (length / 2 - 0.08), floor + boxHeight - 0.2, 0);
  const frame = new THREE.MeshStandardMaterial({ color: PALETTE.safety, emissive: PALETTE.safety, emissiveIntensity: 0.25, roughness: 0.5 });
  for (const z of [depth / 2 - 0.03, -depth / 2 + 0.03]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.06, boxHeight, 0.06), frame);
    jamb.position.set(facing * (length / 2 + 0.01), floor + boxHeight / 2, z);
    truck.add(jamb);
  }
  truck.add(rolled);
  // Exterior ribs leave the cargo aisle open.
  for (let i = 1; i < 9; i += 1) for (const sideZ of [-1, 1]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, boxHeight - 0.2, 0.04), standard(new THREE.Color(color).multiplyScalar(0.82), 0.7));
    rib.position.set(facing * (length / 2 - boxLength) + facing * boxLength * i / 9, floor + boxHeight / 2, sideZ * (depth / 2 + 0.02));
    truck.add(rib);
  }
  // The chassis rails carry the raised box over the wheels.
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(length - 0.3, floor - 0.45, depth - 0.5), standard(0x24292c, 0.6, 0.4));
  chassis.position.set(0, 0.45 + (floor - 0.45) / 2, 0);
  truck.add(chassis);
  // Rubber dock bumpers where the truck meets the platform.
  for (const z of [depth / 2 - 0.25, -depth / 2 + 0.25]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.3), standard(0x111315, 0.9));
    bumper.position.set(facing * (length / 2 + 0.06), floor - 0.2, z);
    truck.add(bumper);
  }
  const cabMaterial = standard(cabColor, 0.45, 0.25);
  const cab = rounded(cabLength, 1.7, depth - 0.1, cabMaterial, 0.18);
  cab.position.set(-facing * (length / 2 - cabLength / 2), 1.2, 0);
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(depth - 0.4, 0.62), new THREE.MeshStandardMaterial({ color: 0x9cc8dc, roughness: 0.05, metalness: 0.6, emissive: 0x16303c, emissiveIntensity: 0.6 }));
  windshield.position.set(-facing * (length / 2 + 0.003), 1.55, 0);
  windshield.rotation.y = -facing * Math.PI / 2;
  const sideWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), windshield.material);
  sideWindow.position.set(-facing * (length / 2 - cabLength / 2 - 0.05), 1.58, depth / 2 - 0.045);
  truck.add(cab, windshield, sideWindow);
  for (const sz of [-1, 1]) {
    const headlight = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshStandardMaterial({ color: 0xfff3c8, emissive: 0xfff0c0, emissiveIntensity: 2.4 }));
    headlight.position.set(-facing * (length / 2 + 0.004), 0.7, sz * (depth / 2 - 0.3));
    headlight.rotation.y = -facing * Math.PI / 2;
    truck.add(headlight);
  }
  // Chrome exhaust stack behind the cab; the drivers' gag fills it with smoke.
  const chrome = standard(0xc8ced2, 0.2, 0.9);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 10), chrome);
  stack.position.set(-facing * (length / 2 - cabLength - 0.02), 2.0, -(depth / 2 - 0.25));
  const stackTop = new THREE.Object3D();
  stackTop.name = 'stack-top';
  stackTop.position.set(stack.position.x, 2.8, stack.position.z);
  truck.add(stack, stackTop);
  const frontBumper = rounded(0.18, 0.2, depth, standard(0x30363a, 0.5, 0.5), 0.05);
  frontBumper.position.set(-facing * (length / 2 + 0.02), 0.45, 0);
  truck.add(frontBumper);
  const tyre = standard(0x161819, 0.9);
  const hub = standard(0x9aa2a6, 0.3, 0.8);
  for (const along of [-facing * (length / 2 - 0.55), facing * (length / 2 - 0.7), facing * (length / 2 - 1.5)]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(along, 0.38, sz * (depth / 2 - 0.08));
      const tyreMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 18), tyre);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 12), hub);
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.24), hub);
      wheel.add(tyreMesh, cap, lug);
      truck.add(wheel);
    }
  }
  // District names and street ranges identify each player's open rear door.
  if (route) {
    const doorSign = textPlane([ROUTE_INFO[route].name, streetRange(route)], 2.1, 0.65, { width: 320, height: 100, background: '#d9ccab', color: '#12232a', radius: 6 });
    doorSign.position.set(facing * (length / 2 + 0.04), floor + boxHeight + 0.3, 0);
    doorSign.rotation.y = facing * Math.PI / 2;
    truck.add(doorSign);
  }
  // Nameplates on the roof (overview) and the south side (follow camera).
  const words = name.split(' ');
  const lines = route ? [name, streetRange(route)] : name.length > 10 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [name];
  const plateOptions = { width: 300, height: 120, background: '#14262d', color: '#d9ccab', border: route ? ROUTE_COLORS[route] : '#a8946a', radius: 10 };
  const roof = textPlane(lines, boxLength * 0.84, depth * 0.62, plateOptions);
  if (route) { roof.name = 'truck-roof-sign'; roof.userData.keep = true; }
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(boxX, floor + boxHeight + 0.011, 0);
  // An open-topped cutaway keeps the freight inside readable from above.
  roof.visible = !cutaway;
  const sideplate = textPlane(lines, boxLength * 0.7, 0.9, { ...plateOptions, height: 110 });
  sideplate.position.set(boxX, floor + boxHeight * 0.55, depth / 2 + 0.045);
  truck.add(roof, sideplate);
  return shadowed(truck);
}

export const crewTruckLength = 148 * WORLD_SCALE;
