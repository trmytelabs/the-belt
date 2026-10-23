import * as THREE from 'three';

import { MALL_LAYOUT } from '../game/slice/MallModel';
import { MALL_STORES } from '../game/slice/StoryScript';
import { mergeStatic } from './merge';
import { placeProp } from './propModels';
import { standard, textTexture } from './space';
import { SURFACE_TILE, boxUVs, scaleUVs, surfaceMaterial } from './textures';

/**
 * Skanky's mall, built in code as an original approximation of a south
 * Edmonton enclosed mall in the spirit of Southgate Centre (111 Street and
 * 51 Avenue, by Whitemud Drive): a skylit barrel-vault concourse over two
 * levels, a food court gallery upstairs, stone-clad columns and terrazzo-style
 * floors, a railed centre-court atrium over lower-level bleacher seating, a
 * shuttered anchor wing, and an exterior receiving dock where the five-ton
 * backs in, with the LRT station and its pedestrian overpass across 111 Street.
 * No real logos, store branding or downloaded assets: every name is the
 * game's own and every surface is generated here.
 *
 * Readability: the gameplay camera looks down from the south, so everything
 * tall on the south side (walls, upper level, roofs, door headers) lives in
 * `full`, shown only in the establishing shots. During play it is cut away to
 * 1.1 m stubs with dark caps, the usual cutaway convention, so Skanky, the
 * cart and every doorway stay in view. Ceilings and the skylight face down
 * only, so they vanish when seen from above.
 */
export interface SouthgateMall {
  /** Tall south-side structure, roofs, headers and the exterior skin: establishing shots only. */
  full: THREE.Group;
  /** Gameplay-only signs on the cut-away south storefronts. */
  cut: THREE.Group;
  /** Updates a store's lit status board (doors in MALL_LAYOUT order). */
  setStatus(index: number, text: string, background: string): void;
}

/** Model pixels (32 px = 1 m) to mall metres; the concourse centre is the origin. */
export const mallX = (x: number): number => (x - 640) / 32;
export const mallZ = (y: number): number => (y - 400) / 32;

const CUT = 1.1;
const LOWER = 4.1;
const UPPER = 4.4;
const CLERESTORY = 8.0;
const SPRING = 8.8;
const ROOF = 9.0;
const WING = 5.6;
const DOOR_HALF = 1.75;

const west = mallX(280);
const east = mallX(1260);
const front = mallZ(520);
const back = 10;
const dockWest = mallX(MALL_LAYOUT.walk[0].x);
const dockEast = mallX(MALL_LAYOUT.walk[0].x + MALL_LAYOUT.walk[0].w);
const dockNorth = mallZ(MALL_LAYOUT.walk[0].y);
const dockSouth = mallZ(MALL_LAYOUT.walk[0].y + MALL_LAYOUT.walk[0].h);
const passageHalf = MALL_LAYOUT.walk[1].h / 64;
const dockDoorHalf = (MALL_LAYOUT.tailgate.h - 20) / 64;

type Box = [x0: number, y0: number, z0: number, x1: number, y1: number, z1: number];

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
}

/** A seeded scatter, so the floors look the same every night. */
function speckle(ctx: CanvasRenderingContext2D, width: number, height: number, colors: string[], count: number, seed: number, size = 1.6): void {
  let s = seed;
  const next = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[Math.floor(next() * colors.length)];
    ctx.fillRect(next() * width, next() * height, size * (0.5 + next()), size * (0.5 + next()));
  }
}

const textures = {
  /** Cream porcelain/terrazzo, 1.2 m tiles (one canvas = 2.4 m). */
  concourse: () => canvasTexture(256, 256, (ctx) => {
    const tints = ['#ddd5c6', '#d6cebf', '#dbd2c1', '#d3cbbb'];
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = tints[i];
      ctx.fillRect((i % 2) * 128, Math.floor(i / 2) * 128, 128, 128);
    }
    speckle(ctx, 256, 256, ['#b8ab96', '#efe8dc', '#a89a86', '#c9b9a0'], 900, 7);
    ctx.strokeStyle = '#a99f8f';
    ctx.lineWidth = 2;
    for (const p of [0, 128, 256]) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 256); ctx.moveTo(0, p); ctx.lineTo(256, p); ctx.stroke();
    }
  }, [1 / 2.4, 1 / 2.4]),
  /** The darker centre runner, 0.6 m tiles laid on the diagonal. */
  runner: () => canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#8d8274'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#7b7064';
    ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(128, 64); ctx.lineTo(64, 128); ctx.lineTo(0, 64); ctx.closePath(); ctx.fill();
    speckle(ctx, 128, 128, ['#a39784', '#6c6256', '#988c7c'], 260, 11);
    ctx.strokeStyle = '#a69a88'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(128, 64); ctx.lineTo(64, 128); ctx.lineTo(0, 64); ctx.closePath(); ctx.stroke();
  }, [1 / 1.2, 1 / 1.2]),
  /** Sealed concrete with saw-cut joints every 2 m. */
  concrete: () => canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#8c8f8e'; ctx.fillRect(0, 0, 128, 128);
    speckle(ctx, 128, 128, ['#7e8281', '#9a9d9b', '#868988', '#a3a5a2'], 700, 3, 2.4);
    ctx.strokeStyle = '#6a6e6d'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, 128, 128);
  }, [1 / 2, 1 / 2]),
  /** Back-of-house vinyl tile. */
  vinyl: () => canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#b4bcbf'; ctx.fillRect(0, 0, 64, 64);
    speckle(ctx, 64, 64, ['#9aa3a7', '#c8cecf'], 120, 5);
    ctx.strokeStyle = '#9aa2a5'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, 64, 64);
  }, [1 / 0.6, 1 / 0.6]),
  /** Upper-level gallery tile. */
  gallery: () => canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#cfc7b8'; ctx.fillRect(0, 0, 64, 64);
    speckle(ctx, 64, 64, ['#bdb3a2', '#ddd6c8'], 140, 13);
    ctx.strokeStyle = '#b0a694'; ctx.lineWidth = 1.5; ctx.strokeRect(0, 0, 64, 64);
  }, [1 / 0.9, 1 / 0.9]),
  /** 1970s precast panels over a brick base, for the outside walls. */
  precast: () => canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#b39c7d'; ctx.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 16) { ctx.fillStyle = x % 32 ? '#a58f71' : '#bea888'; ctx.fillRect(x + 6, 0, 4, 128); }
    speckle(ctx, 128, 128, ['#9c8668', '#c4b090'], 300, 17);
    ctx.fillStyle = '#5e3a2a'; ctx.fillRect(0, 104, 128, 24);
    ctx.strokeStyle = '#4a2c20'; ctx.lineWidth = 1;
    for (let y = 106; y < 128; y += 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke(); }
    ctx.strokeStyle = '#7d6a52'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(127, 0); ctx.lineTo(127, 104); ctx.stroke();
  }),
  /** Night sky through the skylight's glazing bars (u across the arch, v along the concourse). */
  skylight: () => canvasTexture(64, 64, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 64, 64);
    sky.addColorStop(0, '#101c2e'); sky.addColorStop(1, '#16253a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(160,190,220,0.08)'; ctx.fillRect(6, 6, 20, 52);
    ctx.fillStyle = '#c9ced2'; ctx.fillRect(0, 0, 64, 3); ctx.fillRect(0, 0, 3, 64);
  }, [10, 20]),
  /** A rolling security grille: see-through links. */
  grille: () => canvasTexture(32, 32, (ctx) => {
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = 'rgba(190,198,204,0.95)';
    ctx.fillRect(0, 0, 32, 3); ctx.fillRect(0, 16, 32, 2);
    for (let x = 0; x < 32; x += 8) ctx.fillRect(x, 0, 2, 32);
  }),
  /** Yellow-and-black hatching for the tailgate work zone. */
  hatch: () => canvasTexture(64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(232,192,74,0.85)';
    ctx.lineWidth = 9;
    for (let i = -64; i < 128; i += 26) { ctx.beginPath(); ctx.moveTo(i, 64); ctx.lineTo(i + 64, 0); ctx.stroke(); }
  }, [1, 2]),
  asphalt: () => canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#25292b'; ctx.fillRect(0, 0, 128, 128);
    speckle(ctx, 128, 128, ['#1c1f21', '#30353a', '#2a2e31'], 900, 23, 2);
  }, [1 / 4, 1 / 4]),
};

/** A lit sign: a metal backer with an emissive printed face. */
function lightbox(lines: string[], w: number, h: number, options: { background: string; color: string; border?: string; glow?: number; depth?: number; frame?: number; font?: string; both?: boolean }): { group: THREE.Group; face: THREE.Mesh } {
  const group = new THREE.Group();
  const depth = options.depth ?? 0.12;
  const backer = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, depth), standard(options.frame ?? 0x2a2f33, 0.5, 0.5));
  group.add(backer);
  const texture = textTexture(lines, { width: Math.round(Math.max(160, w * 90)), height: Math.round(Math.max(40, h * 90)), background: options.background, color: options.color, border: options.border, radius: 4, font: options.font });
  const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: options.glow ?? 0.85, roughness: 0.55 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  face.position.z = depth / 2 + 0.005;
  group.add(face);
  if (options.both) {
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    rear.position.z = -depth / 2 - 0.005;
    rear.rotation.y = Math.PI;
    group.add(rear);
  }
  return { group, face };
}

const STORE_LOOK = [
  { floor: 0x7d5434, wall: 0xe9dcc6, light: 0xffd2a0 },
  { floor: 0x2e3238, wall: 0x3a3d42, light: 0xd0dcff },
  { floor: 0xc0a07a, wall: 0xf0ebe2, light: 0xfff0dc },
  { floor: 0xd8e4cc, wall: 0xe8f0dc, light: 0xe8ffd8 },
  { floor: 0xead8dc, wall: 0xf6e8ec, light: 0xffe0ec },
  { floor: 0xa65a3a, wall: 0xe8d8bc, light: 0xffd8a8 },
];

export function buildSouthgateMall(scene: THREE.Scene, quality: 'high' | 'low', createCar: (color: number) => THREE.Group): SouthgateMall {
  const full = new THREE.Group();
  full.name = 'mall-full';
  const cut = new THREE.Group();
  cut.name = 'mall-cut';
  const boards: THREE.Mesh[] = [];

  // ---------------------------------------------------------------- materials
  // Photo surfaces (plaster, concrete block, wood) and the size of one tile of each: boxes and panels size their UVs
  // to it, so the photos keep their real scale on walls of any length.
  const photoTile = new Map<THREE.Material, number>();
  const photo = (material: THREE.MeshStandardMaterial, tile: number): THREE.MeshStandardMaterial => { photoTile.set(material, tile); return material; };
  const m = {
    stone: standard(0xb9ab95, 0.55),
    stoneDark: standard(0x8c8070, 0.6),
    plaster: photo(surfaceMaterial('plaster', { color: 0xe8e2d8, roughness: 0.85 }), SURFACE_TILE.plaster),
    paint: photo(surfaceMaterial('plaster', { color: 0xd2d4d0, roughness: 0.85 }), SURFACE_TILE.plaster),
    block: photo(surfaceMaterial('concrete', { color: 0xa4abae, roughness: 0.9 }), 3),
    blockBand: standard(0x4f5f68, 0.8),
    bronze: standard(0x4a3a2c, 0.4, 0.5),
    steel: standard(0x9aa2a8, 0.35, 0.7),
    white: standard(0xf2f2ee, 0.5),
    cap: standard(0x23282c, 0.9),
    rubber: standard(0x151718, 0.95),
    wood: photo(surfaceMaterial('wood', { color: 0x9a6a40, roughness: 0.6 }), SURFACE_TILE.wood),
    darkWood: photo(surfaceMaterial('wood', { color: 0x5e3e26, roughness: 0.6 }), SURFACE_TILE.wood),
    yellow: standard(0xe0b23c, 0.6),
    green: standard(0x3c6e3a, 0.9),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f7a3c, roughness: 0.9, flatShading: true }),
    leafDark: new THREE.MeshStandardMaterial({ color: 0x2c5a30, roughness: 0.9, flatShading: true }),
    spruce: new THREE.MeshStandardMaterial({ color: 0x1f3d2c, roughness: 0.95, flatShading: true }),
    soil: standard(0x3a2a1e, 1),
    glass: new THREE.MeshStandardMaterial({ color: 0xa8d0e0, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.22, depthWrite: false }),
    glassLit: new THREE.MeshStandardMaterial({ color: 0xf0d9a8, emissive: 0xffcf80, emissiveIntensity: 0.55, roughness: 0.2, transparent: true, opacity: 0.7, depthWrite: false }),
    led: new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xfff0d8, emissiveIntensity: 1.6 }),
    sodium: new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xffa040, emissiveIntensity: 2.2 }),
    exit: new THREE.MeshStandardMaterial({ color: 0x2ea05a, emissive: 0x20c060, emissiveIntensity: 1.4 }),
    precast: new THREE.MeshStandardMaterial({ map: textures.precast(), roughness: 0.9 }),
    grille: new THREE.MeshStandardMaterial({ map: textures.grille(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }),
  };
  m.grille.map!.wrapS = m.grille.map!.wrapT = THREE.RepeatWrapping;
  const grilleFor = (w: number, h: number): THREE.MeshStandardMaterial => {
    const material = m.grille.clone();
    material.map = m.grille.map!.clone();
    material.map.repeat.set(w / 0.22, h / 0.22);
    material.map.needsUpdate = true;
    return material;
  };

  // ---------------------------------------------------------------- helpers
  const box = (parent: THREE.Object3D, material: THREE.Material, [x0, y0, z0, x1, y1, z1]: Box): THREE.Mesh => {
    const geometry = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    const tile = photoTile.get(material);
    const mesh = new THREE.Mesh(tile ? boxUVs(geometry, tile) : geometry, material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parent.add(mesh);
    return mesh;
  };
  /** A flat panel; `facing` is the side it can be seen from. */
  const panel = (parent: THREE.Object3D, material: THREE.Material, w: number, h: number, x: number, y: number, z: number, facing: '+x' | '-x' | '+z' | '-z' | 'up' | 'down'): THREE.Mesh => {
    const tile = photoTile.get(material);
    const plane = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(tile ? scaleUVs(plane, w / tile, h / tile) : plane, material);
    mesh.position.set(x, y, z);
    if (facing === '-z') mesh.rotation.y = Math.PI;
    else if (facing === '+x') mesh.rotation.y = Math.PI / 2;
    else if (facing === '-x') mesh.rotation.y = -Math.PI / 2;
    else if (facing === 'up') mesh.rotation.x = -Math.PI / 2;
    else if (facing === 'down') mesh.rotation.x = Math.PI / 2;
    parent.add(mesh);
    return mesh;
  };
  /**
   * A wall. Cut walls are low stubs with a dark cap for play; their full height
   * goes in `full`, shown only in the establishing shots.
   */
  const wall = (material: THREE.Material, [x0, y0, z0, x1, y1, z1]: Box, cutaway = false): void => {
    if (!cutaway || y1 <= CUT) {
      box(scene, material, [x0, y0, z0, x1, y1, z1]);
      return;
    }
    if (y0 < CUT) {
      box(scene, material, [x0, y0, z0, x1, CUT, z1]);
      panel(scene, m.cap, Math.abs(x1 - x0), Math.abs(z1 - z0), (x0 + x1) / 2, CUT + 0.003, (z0 + z1) / 2, 'up');
    }
    box(full, material, [x0, Math.max(y0, CUT), z0, x1, y1, z1]);
  };
  const ceiling = (parent: THREE.Object3D, material: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number): void => {
    panel(parent, material, x1 - x0, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, 'down');
  };
  const floor = (material: THREE.Material, x0: number, z0: number, x1: number, z1: number, y = 0): THREE.Mesh => {
    const mesh = panel(scene, material, x1 - x0, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, 'up');
    mesh.receiveShadow = true;
    return mesh;
  };
  /** World-space UVs, so tiled textures keep their real size on any shape. */
  const shapeFloor = (material: THREE.Material, outline: [number, number][], holes: [number, number][][], y: number): THREE.Mesh => {
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const rect = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const sign = (parent: THREE.Object3D, lines: string[], w: number, h: number, x: number, y: number, z: number, rotationY: number, options: Parameters<typeof lightbox>[3], tilt = 0): THREE.Mesh => {
    const { group, face } = lightbox(lines, w, h, options);
    group.position.set(x, y, z);
    group.rotation.set(tilt, rotationY, 0, 'YXZ');
    parent.add(group);
    return face;
  };
  const plant = (parent: THREE.Object3D, x: number, y: number, z: number, size: number, dark = false): void => {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), dark ? m.leafDark : m.leaf);
    blob.position.set(x, y + size * 0.7, z);
    blob.scale.y = 0.8;
    parent.add(blob);
  };

  // ---------------------------------------------------------------- light and air
  scene.background = new THREE.Color(0x0b1520);
  scene.fog = new THREE.Fog(0x0b1520, 34, 120);
  scene.add(new THREE.HemisphereLight(0xe8eef8, 0x403830, 0.95));
  const moon = new THREE.DirectionalLight(0xc8d8ff, 0.45);
  moon.position.set(-6, 18, 8);
  scene.add(moon);
  const strong = quality === 'high' ? 1 : 0.7;
  for (const x of [-4, 11]) {
    const light = new THREE.PointLight(0xfff0d8, 26 * strong, 18, 1.4);
    light.position.set(x, 6.5, 0);
    scene.add(light);
  }
  const yardLight = new THREE.PointLight(0xffa040, 22 * strong, 18, 1.5);
  yardLight.position.set(dockWest - 2.2, 4.6, -3.6);
  scene.add(yardLight);

  // ---------------------------------------------------------------- ground and floors
  const pit: Box = [mallX(800) + 0.25, -4.2, mallZ(350) + 0.25, mallX(960) - 0.25, 0, mallZ(450) - 0.25];
  const pitHole = rect(pit[0], pit[2], pit[3], pit[5]);
  const asphalt = new THREE.MeshStandardMaterial({ map: textures.asphalt(), roughness: 0.95 });
  shapeFloor(asphalt, rect(-90, -90, 60, 60), [pitHole], -0.03);
  // Inside the building's footprint the slab is plain back-of-house concrete.
  shapeFloor(standard(0x3a3d3f, 0.95), rect(dockWest, -16, 30, back + 0.2), [pitHole], -0.015);
  const concourse = new THREE.MeshStandardMaterial({ map: textures.concourse(), roughness: 0.28, metalness: 0.05 });
  shapeFloor(concourse, rect(west, -front, east, front), [pitHole], 0);
  const runnerZ = 1.9;
  const runner = new THREE.MeshStandardMaterial({ map: textures.runner(), roughness: 0.3, metalness: 0.05 });
  shapeFloor(runner, rect(west + 0.6, -runnerZ, east - 0.6, runnerZ), [pitHole], 0.004);
  const brass = standard(0xc8a050, 0.3, 0.8);
  for (const z of [-runnerZ, runnerZ]) box(scene, brass, [west + 0.6, 0.004, z - 0.035, east - 0.6, 0.009, z + 0.035]);
  // A dark stone border rings the atrium opening.
  const atrium = MALL_LAYOUT.obstacles.find((item) => item.label === 'ATRIUM')!;
  const [ax0, az0, ax1, az1] = [mallX(atrium.x), mallZ(atrium.y), mallX(atrium.x + atrium.w), mallZ(atrium.y + atrium.h)];
  shapeFloor(standard(0x3a3632, 0.4), rect(ax0 - 0.3, az0 - 0.3, ax1 + 0.3, az1 + 0.3), [pitHole], 0.007);
  // The receiving dock, the service corridor and the work zone at the tailgate.
  const concrete = new THREE.MeshStandardMaterial({ map: textures.concrete(), roughness: 0.85 });
  shapeFloor(concrete, rect(dockWest, dockNorth, dockEast, dockSouth), [], 0);
  const passage = MALL_LAYOUT.walk[1];
  shapeFloor(new THREE.MeshStandardMaterial({ map: textures.vinyl(), roughness: 0.6 }), rect(mallX(passage.x), mallZ(passage.y), mallX(passage.x + passage.w), mallZ(passage.y + passage.h)), [], 0.002);
  const tail = MALL_LAYOUT.tailgate;
  const hatch = new THREE.MeshStandardMaterial({ map: textures.hatch(), transparent: true, depthWrite: false, roughness: 0.8 });
  floor(hatch, mallX(tail.x), mallZ(tail.y) + 0.1, mallX(tail.x + tail.w), mallZ(tail.y + tail.h) - 0.1, 0.004);
  for (const [x0, z0, x1, z1] of [[mallX(tail.x), mallZ(tail.y), mallX(tail.x + tail.w), mallZ(tail.y) + 0.1], [mallX(tail.x), mallZ(tail.y + tail.h) - 0.1, mallX(tail.x + tail.w), mallZ(tail.y + tail.h)], [mallX(tail.x + tail.w) - 0.1, mallZ(tail.y), mallX(tail.x + tail.w), mallZ(tail.y + tail.h)]]) {
    floor(m.yellow, x0, z0, x1, z1, 0.005);
  }

  // ---------------------------------------------------------------- the atrium: bleachers to the lower level
  const [px0, , pz0, px1, , pz1] = pit;
  const pitWall = standard(0xb7aa96, 0.7);
  panel(scene, standard(0x5b524a, 0.4), px1 - px0, pz1 - pz0, (px0 + px1) / 2, -4.2, (pz0 + pz1) / 2, 'up');
  panel(scene, pitWall, px1 - px0, 4.2, (px0 + px1) / 2, -2.1, pz0, '+z');
  panel(scene, pitWall, px1 - px0, 4.2, (px0 + px1) / 2, -2.1, pz1, '-z');
  panel(scene, pitWall, pz1 - pz0, 4.2, px0, -2.1, (pz0 + pz1) / 2, '+x');
  panel(scene, pitWall, pz1 - pz0, 4.2, px1, -2.1, (pz0 + pz1) / 2, '-x');
  const steps = 5;
  const tread = (pz1 - pz0 - 0.7) / steps;
  for (let i = 0; i < steps; i += 1) {
    const top = -0.7 * (i + 1);
    const z0 = pz0 + i * tread;
    box(scene, standard(0x4a4440, 0.7), [px0, -4.2, z0, px1, top - 0.08, z0 + tread]);
    box(scene, m.wood, [px0, top - 0.08, z0, px1, top, z0 + tread + 0.03]);
    box(scene, m.led, [px0 + 0.1, top - 0.13, z0 + tread + 0.02, px1 - 0.1, top - 0.09, z0 + tread + 0.04]);
    // Cushions where people sit for lunch-hour concerts.
    for (const x of [px0 + 0.9 + (i % 2) * 0.6, px1 - 1.2 - (i % 2) * 0.4]) box(scene, standard([0xc8553a, 0x2f6d8a, 0xd8a03a][i % 3], 0.9), [x, top, z0 + 0.06, x + 0.45, top + 0.08, z0 + tread - 0.04]);
  }
  sign(scene, ['LOWER LEVEL'], 1.6, 0.3, px1 - 0.02, -1.0, (pz0 + pz1) / 2, -Math.PI / 2, { background: '#1b2a33', color: '#f0e6d0', depth: 0.04 });
  // Glass balustrade around the opening.
  const railY = 1.0;
  // Inset so the curb stays inside the atrium's collision rectangle: a cart pushed against it never clips.
  const [rx0, rz0, rx1, rz1] = [ax0 + 0.1, az0 + 0.1, ax1 - 0.1, az1 - 0.1];
  const railSides: [number, number, number, number][] = [[rx0, rz0, rx1, rz0], [rx0, rz1, rx1, rz1], [rx0, rz0, rx0, rz1], [rx1, rz0, rx1, rz1]];
  for (const [x0, z0, x1, z1] of railSides) {
    const horizontal = z0 === z1;
    const length = horizontal ? x1 - x0 : z1 - z0;
    const g = horizontal ? [x0, 0.12, z0 - 0.015, x1, railY - 0.06, z0 + 0.015] : [x0 - 0.015, 0.12, z0, x0 + 0.015, railY - 0.06, z1];
    box(scene, m.glass, g as Box);
    box(scene, m.stoneDark, horizontal ? [x0 - 0.05, 0, z0 - 0.08, x1 + 0.05, 0.12, z0 + 0.08] : [x0 - 0.08, 0, z0, x0 + 0.08, 0.12, z1]);
    box(scene, m.steel, horizontal ? [x0 - 0.05, railY - 0.06, z0 - 0.04, x1 + 0.05, railY, z0 + 0.04] : [x0 - 0.04, railY - 0.06, z0, x0 + 0.04, railY, z1]);
    for (let i = 0; i <= Math.round(length / 1.25); i += 1) {
      const t = i / Math.round(length / 1.25);
      const px = horizontal ? x0 + (x1 - x0) * t : x0;
      const pz = horizontal ? z0 : z0 + (z1 - z0) * t;
      box(scene, m.steel, [px - 0.03, 0.12, pz - 0.03, px + 0.03, railY, pz + 0.03]);
    }
  }

  // ---------------------------------------------------------------- planter island with bench seats
  const planter = MALL_LAYOUT.obstacles.find((item) => item.label === 'PLANTER')!;
  const [qx0, qz0, qx1, qz1] = [mallX(planter.x), mallZ(planter.y), mallX(planter.x + planter.w), mallZ(planter.y + planter.h)];
  const terrazzo = standard(0xcfc6b6, 0.45);
  box(scene, terrazzo, [qx0 + 0.15, 0, qz0 + 0.42, qx1 - 0.15, 0.72, qz1 - 0.42]);
  box(scene, m.stoneDark, [qx0 + 0.1, 0.72, qz0 + 0.37, qx1 - 0.1, 0.78, qz0 + 0.47]);
  box(scene, m.stoneDark, [qx0 + 0.1, 0.72, qz1 - 0.47, qx1 - 0.1, 0.78, qz1 - 0.37]);
  box(scene, m.stoneDark, [qx0 + 0.1, 0.72, qz0 + 0.37, qx0 + 0.2, 0.78, qz1 - 0.37]);
  box(scene, m.stoneDark, [qx1 - 0.2, 0.72, qz0 + 0.37, qx1 - 0.1, 0.78, qz1 - 0.37]);
  panel(scene, m.soil, qx1 - qx0 - 0.4, qz1 - qz0 - 0.94, (qx0 + qx1) / 2, 0.7, (qz0 + qz1) / 2, 'up');
  for (let i = 0; i < 5; i += 1) plant(scene, qx0 + 0.5 + i * (qx1 - qx0 - 1) / 4, 0.7, (qz0 + qz1) / 2 + (i % 2 ? 0.2 : -0.2), 0.32 + (i % 3) * 0.06, i % 2 === 0);
  for (const [x, z, color] of [[qx0 + 0.9, (qz0 + qz1) / 2 + 0.3, 0xd84a4a], [qx1 - 0.9, (qz0 + qz1) / 2 - 0.3, 0xf2c14e]] as const) {
    const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), standard(color, 0.8));
    flower.position.set(x, 1.15, z);
    scene.add(flower);
  }
  for (const side of [-1, 1]) {
    const z = side < 0 ? qz0 + 0.05 : qz1 - 0.05;
    const inner = side < 0 ? qz0 + 0.42 : qz1 - 0.42;
    for (let s = 0; s < 4; s += 1) {
      const zz = inner + (z - inner) * (s + 0.5) / 4;
      box(scene, m.wood, [qx0 + 0.25, 0.42, zz - 0.04, qx1 - 0.25, 0.47, zz + 0.04]);
    }
    for (const x of [qx0 + 0.4, qx1 - 0.4]) box(scene, m.bronze, [x - 0.04, 0, Math.min(z, inner), x + 0.04, 0.42, Math.max(z, inner)]);
  }

  // ---------------------------------------------------------------- bench pod and the mall directory
  const bench = MALL_LAYOUT.obstacles.find((item) => item.label === 'BENCH')!;
  const [bx0, bz0, bx1, bz1] = [mallX(bench.x), mallZ(bench.y), mallX(bench.x + bench.w), mallZ(bench.y + bench.h)];
  box(scene, m.stoneDark, [bx0 + 0.05, 0, bz0 + 0.05, bx1 - 0.05, 0.06, bz1 - 0.05]);
  for (const side of [-1, 1]) {
    const seatZ = side < 0 ? bz0 + 0.35 : bz1 - 0.35;
    box(scene, m.wood, [bx0 + 0.15, 0.42, seatZ - 0.24, bx1 - 1.05, 0.48, seatZ + 0.24]);
    box(scene, m.wood, [bx0 + 0.15, 0.55, seatZ - side * 0.3 - 0.03, bx1 - 1.05, 0.95, seatZ - side * 0.3 + 0.03]);
    for (const x of [bx0 + 0.35, bx1 - 1.3]) box(scene, m.bronze, [x - 0.05, 0.06, seatZ - 0.2, x + 0.05, 0.42, seatZ + 0.2]);
  }
  const directory = canvasTexture(256, 512, (ctx) => {
    ctx.fillStyle = '#1b2a33'; ctx.fillRect(0, 0, 256, 512);
    ctx.fillStyle = '#f0e6d0'; ctx.font = '800 30px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('DIRECTORY', 128, 46);
    ctx.font = '600 16px "Segoe UI", Arial, sans-serif'; ctx.fillStyle = '#9fb3bd';
    ctx.fillText('LEVEL 1 · LEVEL 2 FOOD COURT', 128, 72);
    // A little plan of this very concourse, stores in their doors' order.
    const sx = (x: number): number => 20 + (x - 40) / 1220 * 216;
    const sy = (y: number): number => 110 + (y - 80) / 640 * 300;
    ctx.fillStyle = '#d9d1c2'; ctx.fillRect(sx(280), sy(280), sx(1260) - sx(280), sy(520) - sy(280));
    ctx.fillStyle = '#8c8f8e'; ctx.fillRect(sx(40), sy(300), sx(260) - sx(40), sy(500) - sy(300));
    const swatch = ['#c8553a', '#2f6d8a', '#d8a03a', '#5a9a4a', '#c06a9a', '#a65a3a'];
    MALL_LAYOUT.doors.forEach((door, index) => {
      const north = door.side === 'north';
      ctx.fillStyle = swatch[index];
      ctx.fillRect(sx(door.x - 146), north ? sy(80) : sy(520), sx(door.x + 146) - sx(door.x - 146), sy(280) - sy(80));
      ctx.fillStyle = '#ffffff'; ctx.font = '700 11px "Segoe UI", Arial, sans-serif';
      ctx.fillText(MALL_STORES[index].name.split(' ')[0], sx(door.x), north ? sy(180) : sy(620));
    });
    ctx.fillStyle = '#e8463a'; ctx.beginPath(); ctx.arc(sx(1150), sy(400), 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0e6d0'; ctx.font = '700 15px "Segoe UI", Arial, sans-serif';
    ctx.fillText('YOU ARE HERE', 128, 452);
    ctx.fillStyle = '#9fb3bd'; ctx.font = '600 14px "Segoe UI", Arial, sans-serif';
    ctx.fillText('LRT ↑ LEVEL 2 · 111 ST', 128, 484);
  });
  const directoryFace = new THREE.MeshStandardMaterial({ map: directory, emissiveMap: directory, emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 0.5 });
  const totemX = bx1 - 0.55;
  box(scene, m.bronze, [totemX - 0.45, 0, -0.16, totemX + 0.45, 2.1, 0.16]);
  panel(scene, directoryFace, 0.8, 1.6, totemX, 1.15, 0.165, '+z');
  panel(scene, directoryFace, 0.8, 1.6, totemX, 1.15, -0.165, '-z');
  if (quality === 'high') {
    // A steel bin between the benches, inside the pod, so the cart never meets it.
    const bin = new THREE.Group();
    bin.position.set(bx0 + 0.55, 0.06, (bz0 + bz1) / 2);
    bin.rotation.y = Math.PI / 2;
    void placeProp(bin, 'trash-can');
    scene.add(bin);
  }

  // ---------------------------------------------------------------- the skylit barrel vault
  const span = front;
  const rise = 2.2;
  const radius = (span * span + rise * rise) / (2 * rise);
  const half = Math.asin(span / radius);
  const length = east - west;
  const vaultAt = (r: number, material: THREE.Material, len = length, x = (west + east) / 2): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24, 1, true, Math.PI / 2 - half, half * 2), material);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, SPRING + rise - radius, 0);
    return mesh;
  };
  const skylightTexture = textures.skylight();
  skylightTexture.repeat.set(10, Math.round(length / 1.5));
  full.add(vaultAt(radius + 0.02, new THREE.MeshStandardMaterial({ color: 0x2a3a4c, roughness: 0.15, metalness: 0.6 })));
  scene.add(vaultAt(radius, new THREE.MeshStandardMaterial({ map: skylightTexture, emissive: 0x0a1426, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2, side: THREE.BackSide })));
  for (let x = west + 1.5; x < east - 1; x += 3.06) scene.add(vaultAt(radius - 0.08, new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.4, metalness: 0.5, side: THREE.BackSide }), 0.18, x));
  // Gable ends of the vault.
  const gable = new THREE.Shape();
  gable.moveTo(-span, 0);
  for (let i = 0; i <= 16; i += 1) {
    const a = -half + (2 * half * i) / 16;
    gable.lineTo(radius * Math.sin(a), radius * Math.cos(a) - (radius - rise));
  }
  gable.lineTo(span, 0);
  for (const [x, rotation] of [[west, Math.PI / 2], [east, -Math.PI / 2]] as const) {
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(gable), m.plaster);
    mesh.position.set(x, SPRING, 0);
    mesh.rotation.y = rotation;
    full.add(mesh);
  }

  // ---------------------------------------------------------------- the two levels on each side
  const storeEdges = [280, 580, 880, 1180].map(mallX);
  for (const north of [true, false]) {
    const s = north ? -1 : 1;
    const zf = front * s;
    const zb = back * s;
    const cutaway = !north;
    const into = (d: number): number => zf + s * d;
    const span2 = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);
    const [fz0, fz1] = span2(zf, into(0.35));
    // Columns: stone-clad below, round steel above the gallery.
    for (const x of [...storeEdges, east - 0.35]) {
      // Flush with the concourse edge, so a cart pushed against a storefront never clips a column.
      wall(m.stone, [x - 0.35, 0, Math.min(zf, into(0.5)), x + 0.35, UPPER, Math.max(zf, into(0.5))], cutaway);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, SPRING - UPPER, 12), m.white);
      column.position.set(x, (UPPER + SPRING) / 2, zf - 0.05 * s);
      (north ? scene : full).add(column);
    }
    // Store partitions, back walls and the outside wall.
    const [rz0, rz1] = span2(zf, zb);
    for (const x of storeEdges.slice(1)) wall(m.paint, [x - 0.1, 0, rz0, x + 0.1, LOWER, rz1], cutaway);
    wall(m.paint, [west - 0.2, 0, Math.min(zf, zb), west, ROOF, Math.max(zf, zb)], cutaway);
    wall(m.precast, [west - 0.2, 0, Math.min(zb, zb + 0.2 * s), east + 0.2, ROOF, Math.max(zb, zb + 0.2 * s)], cutaway);
    // The east corner: a corridor to the washrooms and guest services.
    wall(m.stone, [storeEdges[3] + 0.35, 0, fz0, east - 0.7, LOWER, fz1], cutaway);
    // Gallery slab with its lit edge, the glass balustrade, and the clerestory band.
    const slab = north ? scene : full;
    const [gz0, gz1] = span2(zf, into(3.0));
    box(slab, m.white, [west, LOWER, gz0, east, UPPER, gz1]);
    box(slab, m.led, [west, LOWER - 0.04, zf - 0.02 * s, east, LOWER, zf + 0.01 * s]);
    box(slab, m.glass, [west, UPPER, zf + 0.03 * s - 0.015, east, UPPER + 1.0, zf + 0.03 * s + 0.015]);
    box(slab, m.steel, [west, UPPER + 1.0, zf + 0.03 * s - 0.04, east, UPPER + 1.06, zf + 0.03 * s + 0.04]);
    const [cz0, cz1] = span2(zf, into(0.3));
    box(slab, m.plaster, [west, CLERESTORY, cz0, east, SPRING, cz1]);
    box(slab, m.led, [west, CLERESTORY - 0.05, zf - 0.01 * s, east, CLERESTORY, zf + 0.02 * s]);
    ceiling(slab, m.white, west, Math.min(zf, zb), east, Math.max(zf, zb), CLERESTORY);
    // Upper floor finish over the stores and the gallery.
    const galleryTexture = textures.gallery();
    galleryTexture.repeat.set((east - west) / 0.9, (back - front) / 0.9);
    const galleryFloor = new THREE.MeshStandardMaterial({ map: galleryTexture, roughness: 0.35 });
    panel(slab, galleryFloor, east - west, back - front, (west + east) / 2, UPPER + 0.003, (zf + zb) / 2, 'up');
    // Roofs, seen only from outside.
    panel(full, standard(0x4a4c4e, 0.95), east - west + 0.4, back - front + 0.2, (west + east) / 2, ROOF, (zf + zb) / 2 + 0.1 * s, 'up');
  }

  // Upstairs, north: the food court along the gallery.
  const stalls = [['DONAIR DEPOT', '#c8553a'], ['PEROGY PALACE', '#d8a03a'], ['GREEN ONION CAKES', '#4f8a3a'], ['NOODLE NOOK', '#2f6d8a']] as const;
  const stallZ = -front - 3.0;
  const stallWidth = (storeEdges[3] - west) / stalls.length;
  stalls.forEach(([name, color], index) => {
    const x0 = west + index * stallWidth;
    const x1 = x0 + stallWidth;
    const cx = (x0 + x1) / 2;
    if (index > 0) box(scene, m.paint, [x0 - 0.1, UPPER, -back, x0 + 0.1, CLERESTORY, stallZ]);
    box(scene, m.paint, [x0 + 0.1, 7.3, stallZ - 0.2, x1 - 0.1, CLERESTORY, stallZ]);
    box(scene, standard(0x8a8f92, 0.35, 0.7), [x0 + 0.1, UPPER, -back + 0.2, x1 - 0.1, 6.6, -back + 0.3]);
    box(scene, standard(0x3a3f44, 0.5), [x0 + 0.1, UPPER, -back, x1 - 0.1, CLERESTORY, -back + 0.2]);
    box(scene, standard(0xd8d0c0, 0.5), [x0 + 0.6, UPPER, stallZ - 0.7, x1 - 0.6, UPPER + 1.05, stallZ - 0.1]);
    box(scene, m.steel, [x0 + 0.6, UPPER + 1.05, stallZ - 0.75, x1 - 0.6, UPPER + 1.09, stallZ - 0.05]);
    for (let k = 0; k < 3; k += 1) box(scene, m.steel, [x0 + 1.2 + k * 1.6, UPPER + 1.09, stallZ - 0.6, x0 + 1.8 + k * 1.6, UPPER + 1.45, stallZ - 0.25]);
    sign(scene, [name], stallWidth - 1.6, 0.62, cx, 6.95, stallZ + 0.07, 0, { background: color, color: '#fff8ea' }, -0.15);
    // Closed for the night: the grille is half down.
    panel(scene, grilleFor(stallWidth - 1.2, 0.9), stallWidth - 1.2, 0.9, cx, 6.15, stallZ - 0.02, '+z');
    for (const tx of [cx - stallWidth / 4, cx + stallWidth / 4]) {
      const tz = -front - 1.6;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 16), m.white);
      top.position.set(tx, UPPER + 0.74, tz);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 8), m.steel);
      stem.position.set(tx, UPPER + 0.37, tz);
      scene.add(top, stem);
      for (let c = 0; c < 4; c += 1) {
        const a = c * Math.PI / 2 + Math.PI / 4;
        box(scene, standard(color, 0.7), [tx + Math.cos(a) * 0.68 - 0.2, UPPER + 0.44, tz + Math.sin(a) * 0.68 - 0.2, tx + Math.cos(a) * 0.68 + 0.2, UPPER + 0.48, tz + Math.sin(a) * 0.68 + 0.2]);
      }
    }
  });
  sign(scene, ['FOOD COURT · LEVEL 2'], 6, 0.6, (west + storeEdges[3]) / 2, (CLERESTORY + SPRING) / 2, -front + 0.02, 0, { background: '#1b2a33', color: '#f2c14e' });
  // Upstairs, south: shops with their grilles down (establishing shots only).
  ['NAILS & BROWS', 'PHONE REPAIR', 'OPTICAL', 'SHOE REPAIR'].forEach((name, index) => {
    const x0 = west + index * stallWidth;
    const x1 = x0 + stallWidth;
    if (index > 0) box(full, m.paint, [x0 - 0.1, UPPER, front + 3.0, x0 + 0.1, CLERESTORY, back]);
    box(full, standard(0xe6ddd0, 0.8), [x0 + 0.1, UPPER, back - 0.2, x1 - 0.1, CLERESTORY, back]);
    box(full, m.plaster, [x0 + 0.1, 6.9, front + 3.0, x1 - 0.1, CLERESTORY, front + 3.2]);
    panel(full, grilleFor(stallWidth - 0.4, 2.5), stallWidth - 0.4, 2.5, (x0 + x1) / 2, UPPER + 1.25, front + 3.05, '-z');
    sign(full, [name], stallWidth - 2.2, 0.5, (x0 + x1) / 2, 7.4, front + 2.97, Math.PI, { background: '#f4efe6', color: '#2b2f33' });
  });

  // ---------------------------------------------------------------- the six stores
  MALL_LAYOUT.doors.forEach((door, index) => {
    const north = door.side === 'north';
    const s = north ? -1 : 1;
    const cx = mallX(door.x);
    const zf = mallZ(door.y);
    const zb = back * s;
    const look = STORE_LOOK[index];
    const name = MALL_STORES[index].name;
    const x0 = cx - 4.6875 + 0.35;
    const x1 = cx + 4.6875 - 0.35;
    const into = (d: number): number => zf + s * d;
    const z = (a: number, b: number): [number, number] => [Math.min(into(a), into(b)), Math.max(into(a), into(b))];
    const room = north ? scene : full;
    floor(standard(look.floor, 0.55), cx - 4.6875, Math.min(zf, zb), cx + 4.6875, Math.max(zf, zb), 0.003);
    const [wz0, wz1] = z(6.05, 6.25);
    wall(standard(look.wall, 0.85), [x0, 0, wz0, x1, LOWER, wz1], !north);
    ceiling(room, m.white, cx - 4.6875, Math.min(zf, zb), cx + 4.6875, Math.max(zf, zb), LOWER);
    for (const dx of [-2.6, 0, 2.6]) for (const d of [2, 4.4]) panel(room, m.led, 0.5, 0.5, cx + dx, LOWER - 0.01, into(d), 'down');
    const light = new THREE.PointLight(look.light, (north ? 11 : 9) * strong, 9, 1.6);
    light.position.set(cx, 3.0, into(2.8));
    scene.add(light);
    // The storefront: kick plates, glazing and mullions, stone door jambs, a fascia and the lit name.
    for (const [g0, g1] of [[x0, cx - DOOR_HALF - 0.3], [cx + DOOR_HALF + 0.3, x1]]) {
      // Everything below the fascia sits behind the concourse edge.
      const [kz0, kz1] = z(0, 0.1);
      box(scene, m.bronze, [g0, 0, kz0, g1, 0.35, kz1]);
      const [gz0, gz1] = z(0.035, 0.065);
      wall(m.glass, [g0, 0.35, gz0, g1, 2.95, gz1], !north);
      const bays = Math.max(1, Math.round((g1 - g0) / 1.5));
      for (let i = 0; i <= bays; i += 1) {
        const mx = g0 + (g1 - g0) * i / bays;
        wall(m.bronze, [mx - 0.035, 0.35, kz0, mx + 0.035, 2.95, kz1], !north);
      }
      wall(m.bronze, [g0, 2.85, kz0, g1, 2.95, kz1], !north);
    }
    for (const side of [-1, 1]) {
      const jx = cx + side * (DOOR_HALF + 0.15);
      const [jz0, jz1] = z(0, 0.37);
      wall(m.stone, [jx - 0.15, 0, jz0, jx + 0.15, 2.95, jz1], !north);
    }
    const [fz0, fz1] = z(-0.12, 0.3);
    wall(m.plaster, [cx - 4.6875 + 0.35, 2.95, fz0, cx + 4.6875 - 0.35, LOWER, fz1], !north);
    // The rolling grille, rolled up for the delivery.
    const [hz0, hz1] = z(0.05, 0.45);
    box(room, standard(0x6a7278, 0.5, 0.5), [cx - DOOR_HALF, 2.6, hz0, cx + DOOR_HALF, 2.95, hz1]);
    const signWidth = Math.min(6.2, name.length * 0.36 + 1.2);
    const signOptions = { background: '#14181c', color: '#fff4dc', border: '#d8b46a', glow: 1.0 };
    if (north) {
      sign(scene, [name], signWidth, 0.6, cx, 3.78, zf + 0.22, 0, signOptions, -0.3);
      const status = sign(scene, ['—'], 3.6, 0.46, cx, 3.2, zf + 0.26, 0, { background: '#9aa4a8', color: '#14232a', glow: 0.7, depth: 0.08 }, -0.3);
      status.userData.keep = true;
      boards[index] = status;
    } else {
      sign(full, [name], signWidth, 0.6, cx, 3.6, zf - 0.08, Math.PI, signOptions, -0.15);
      // For play, a window plaque behind the cut storefront carries the name
      // and the status, angled up to the camera like a lectern.
      const plaque = new THREE.Group();
      plaque.position.set(cx - 3.25, CUT + 0.55, zf + 0.6);
      plaque.rotation.x = -0.75;
      cut.add(plaque);
      sign(plaque, [name], 2.8, 0.42, 0, 0.22, 0, 0, signOptions);
      const status = sign(plaque, ['—'], 2.8, 0.34, 0, -0.2, 0, 0, { background: '#9aa4a8', color: '#14232a', glow: 0.7, depth: 0.08 });
      status.userData.keep = true;
      boards[index] = status;
      for (const dx of [-1.2, 1.2]) box(cut, m.bronze, [cx - 3.25 + dx - 0.03, 0, zf + 0.78, cx - 3.25 + dx + 0.03, CUT + 0.3, zf + 0.84]);
    }
    // The cash wrap the clerk comes out from.
    const [cz0, cz1] = z(3.35, 4.15);
    box(scene, standard(0x8a6a4a, 0.6), [cx - 1.5, 0, cz0, cx + 1.5, 1.0, cz1]);
    box(scene, standard(0xe8e0d0, 0.4), [cx - 1.55, 1.0, cz0 - 0.03, cx + 1.55, 1.05, cz1 + 0.03]);
    storeFixtures(index, cx, into, z, scene, north);
  });

  /** Each store's own furniture, kept low near the front of the cut-away south stores. */
  function storeFixtures(index: number, cx: number, into: (d: number) => number, z: (a: number, b: number) => [number, number], parent: THREE.Object3D, north: boolean): void {
    const backWall = (d0: number, d1: number): [number, number] => z(d0, d1);
    if (index === 0) {
      // TIMMY HORTANS: coffee bar, a donut case and menu boards.
      const [z0, z1] = backWall(5.2, 5.9);
      box(parent, standard(0x5a2e22, 0.6), [cx - 3.8, 0, z0, cx + 3.8, 1.05, z1]);
      for (let i = 0; i < 4; i += 1) box(parent, m.steel, [cx - 3.4 + i * 1.9, 1.05, z0 + 0.1, cx - 2.8 + i * 1.9, 1.6, z1 - 0.1]);
      const [dz0, dz1] = backWall(3.35, 4.15);
      box(parent, m.glass, [cx + 1.55, 1.0, dz0, cx + 3.1, 1.5, dz1]);
      for (let i = 0; i < 6; i += 1) {
        const donut = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.035, 6, 10), standard([0xc8884a, 0xe8a0b8, 0x6a3a22][i % 3], 0.8));
        donut.rotation.x = -Math.PI / 2;
        donut.position.set(cx + 1.75 + (i % 3) * 0.45, 1.1, (dz0 + dz1) / 2 + (i < 3 ? -0.15 : 0.15));
        parent.add(donut);
      }
      ['COFFEE', 'DONUTS', 'SOUP'].forEach((label, k) => sign(parent, [label], 1.8, 0.7, cx - 2.4 + k * 2.4, 2.9, into(6.03), north ? 0 : Math.PI, { background: '#3a1c14', color: '#f6e6c8', glow: 0.7, depth: 0.05 }));
    } else if (index === 1) {
      // MESA MUSIC: guitars on the wall, amp stacks and a drum kit.
      for (let i = 0; i < 7; i += 1) {
        const gx = cx - 3.6 + i * 1.2;
        const color = [0xb8442c, 0x1a1a1a, 0xd89a3a, 0x2f6d8a][i % 4];
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.07, 14), standard(color, 0.35, 0.2));
        body.rotation.x = Math.PI / 2;
        body.position.set(gx, 1.5, into(5.98));
        const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.04), m.darkWood);
        neck.position.set(gx, 2.05, into(5.99));
        parent.add(body, neck);
      }
      for (const ax of [cx - 3.4, cx - 2.5, cx + 2.6]) {
        const height = ax > cx ? 1.6 : 0.8;
        const [az0, az1] = backWall(4.6, 5.3);
        const [gz0, gz1] = backWall(4.58, 4.6);
        box(parent, standard(0x161616, 0.8), [ax - 0.4, 0, az0, ax + 0.4, height, az1]);
        box(parent, standard(0x3a3530, 0.95), [ax - 0.34, 0.1, gz0, ax + 0.34, height - 0.1, gz1]);
      }
      for (const [dx, dd, r, h] of [[0, 5.0, 0.32, 0.55], [-0.55, 4.7, 0.2, 0.65], [0.55, 4.7, 0.2, 0.65]] as const) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 14), standard(0xb8442c, 0.4, 0.3));
        drum.position.set(cx + 1.2 + dx, h, into(dd));
        parent.add(drum);
      }
    } else if (index === 2) {
      // LE DUCK: clothing racks, wall shelves and the duck itself on a plinth.
      for (const rx of [cx - 3.0, cx + 3.0]) {
        const [rz0, rz1] = backWall(2.4, 4.2);
        box(parent, m.steel, [rx - 0.03, 1.4, rz0, rx + 0.03, 1.45, rz1]);
        for (let k = 0; k < 9; k += 1) {
          const kz = rz0 + 0.1 + k * (rz1 - rz0 - 0.2) / 8;
          box(parent, standard([0x2f4a6a, 0xc8553a, 0xe8e0d0, 0x3a3a3a][k % 4], 0.9), [rx - 0.28, 0.6, kz - 0.04, rx + 0.28, 1.4, kz + 0.04]);
        }
      }
      for (let shelf = 0; shelf < 3; shelf += 1) {
        const [sz0, sz1] = backWall(5.65, 6.05);
        box(parent, standard(0xd8c8a8, 0.6), [cx - 4, 0.6 + shelf * 0.6, sz0, cx + 4, 0.64 + shelf * 0.6, sz1]);
      }
      const [pz0, pz1] = backWall(4.6, 5.4);
      box(parent, m.white, [cx - 0.5, 0, pz0, cx + 0.5, 0.7, pz1]);
      const duckYellow = standard(0xf2c632, 0.5);
      const duckBody = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), duckYellow);
      duckBody.scale.set(1.25, 0.85, 1);
      duckBody.position.set(cx, 1.05, (pz0 + pz1) / 2);
      const duckHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), duckYellow);
      duckHead.position.set(cx + 0.32, 1.5, (pz0 + pz1) / 2);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 8), standard(0xe8742a, 0.5));
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(cx + 0.6, 1.47, (pz0 + pz1) / 2);
      parent.add(duckBody, duckHead, beak);
    } else if (index === 3) {
      // GOJI HUT: a smoothie bar with blenders and crates of berries.
      const [bz0, bz1] = backWall(5.2, 5.9);
      box(parent, standard(0x4f8a3a, 0.6), [cx - 3.8, 0, bz0, cx + 3.8, 1.0, bz1]);
      for (let i = 0; i < 5; i += 1) {
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.32, 10), standard([0xb8243a, 0x8a2a6a, 0xe86a2a][i % 3], 0.3));
        jar.position.set(cx - 3 + i * 1.5, 1.18, (bz0 + bz1) / 2);
        parent.add(jar);
      }
      for (const fx of [cx - 3.4, cx + 3.0]) {
        const [fz0, fz1] = backWall(2.6, 3.3);
        box(parent, m.wood, [fx - 0.45, 0, fz0, fx + 0.45, 0.55, fz1]);
        for (let k = 0; k < 7; k += 1) {
          const berry = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), standard(0xc0202e, 0.6));
          berry.position.set(fx - 0.3 + (k % 4) * 0.2, 0.6, (fz0 + fz1) / 2 + (k < 4 ? -0.12 : 0.12));
          parent.add(berry);
        }
      }
    } else if (index === 4) {
      // GLAMOUR LOTION: round tiered tables of bottles and a mirrored back wall.
      for (const tx of [cx - 2.8, cx + 2.8]) {
        const [tz0, tz1] = backWall(2.8, 3.6);
        const tz = (tz0 + tz1) / 2;
        for (let tier = 0; tier < 2; tier += 1) {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6 - tier * 0.25, 0.6 - tier * 0.25, 0.4, 18), m.white);
          t.position.set(tx, 0.2 + tier * 0.4, tz);
          parent.add(t);
        }
        for (let k = 0; k < 8; k += 1) {
          const a = k * Math.PI / 4;
          const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 8), standard([0xf2b8c8, 0xc8e0f2, 0xf6e6b0][k % 3], 0.3));
          bottle.position.set(tx + Math.cos(a) * 0.45, 0.51, tz + Math.sin(a) * 0.45);
          parent.add(bottle);
        }
      }
      const [mz0, mz1] = backWall(6.0, 6.04);
      box(parent, standard(0xb8c8d0, 0.05, 0.9), [cx - 3.8, 0.4, mz0, cx + 3.8, 2.2, mz1]);
    } else {
      // PANCHETTERS: a deli case and cured meats hanging behind it.
      const [dz0, dz1] = backWall(4.9, 5.6);
      box(parent, standard(0xe8e0d0, 0.5), [cx - 3.6, 0, dz0, cx + 3.6, 0.95, dz1]);
      box(parent, m.glass, [cx - 3.6, 0.95, dz0, cx + 3.6, 1.35, dz1]);
      for (let k = 0; k < 9; k += 1) {
        const meat = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 8), standard(0x8a3a2a, 0.7));
        meat.position.set(cx - 3.2 + k * 0.8, 1.9, into(5.85));
        parent.add(meat);
      }
      const [sz0, sz1] = backWall(5.8, 5.95);
      box(parent, m.darkWood, [cx - 3.6, 2.15, sz0, cx + 3.6, 2.2, sz1]);
    }
  }

  // ---------------------------------------------------------------- west end: the service corridor
  const passageWall = (cutaway: boolean, z0: number, z1: number): void => wall(m.stone, [dockEast, 0, z0, west, SPRING, z1], cutaway);
  passageWall(false, -front, -passageHalf);
  passageWall(true, passageHalf, front);
  box(full, m.stone, [dockEast, 2.8, -passageHalf, west, SPRING, passageHalf]);
  sign(full, ['SERVICE CORRIDOR · STAFF ONLY'], 3.0, 0.32, west + 0.02, 3.2, 0, Math.PI / 2, { background: '#f4efe6', color: '#2b2f33', depth: 0.04 });
  sign(scene, ['EXIT'], 0.7, 0.28, west + 0.03, 2.55, -passageHalf - 0.6, Math.PI / 2, { background: '#1e8a4a', color: '#ffffff', glow: 1.3, depth: 0.06 });
  sign(scene, ['LRT · 111 ST', '↑ LEVEL 2'], 2.0, 0.7, west + 0.03, 6.2, -2.6, Math.PI / 2, { background: '#1b2a33', color: '#f0e6d0', depth: 0.05 });
  // East end: the old anchor's portal, closed behind a rolling grille.
  const portalHalf = 3.0;
  wall(m.stone, [east, 0, -front, east + 0.4, SPRING, -portalHalf], false);
  wall(m.stone, [east, 0, portalHalf, east + 0.4, SPRING, front], true);
  box(scene, m.stone, [east, 6.5, -portalHalf, east + 0.4, SPRING, portalHalf]);
  panel(scene, grilleFor(portalHalf * 2, 6.5), portalHalf * 2, 6.5, east + 0.2, 3.25, 0, '-x');
  sign(scene, ['ANCHOR SPACE · OPENING SOON'], 4.6, 0.55, east - 0.02, 7.4, 0, -Math.PI / 2, { background: '#f4efe6', color: '#2b2f33', glow: 0.6 });
  sign(scene, ['WASHROOMS · GUEST SERVICES'], 1.6, 0.34, 17.9, 3.4, -front + 0.08, 0, { background: '#1b2a33', color: '#f0e6d0', depth: 0.05 });
  floor(standard(0x2a2c30, 0.25), east + 0.4, -8, 30, 8, 0.002);
  for (const [fx, fz] of [[22.5, -3.5], [24.5, 2.0], [27, -1.0]]) box(scene, standard(0x50565a, 0.6), [fx - 0.8, 0, fz - 0.3, fx + 0.8, 1.3, fz + 0.3]);
  for (const fz of [-5, 5]) box(scene, m.exit, [29.6, 3.0, fz - 0.3, 29.8, 3.3, fz + 0.3]);

  // ---------------------------------------------------------------- the receiving dock
  const block = m.block;
  const dockHeight = WING;
  box(scene, block, [dockWest, 0, dockNorth - 0.2, dockEast, dockHeight, dockNorth]);
  box(scene, m.blockBand, [dockWest, 0, dockNorth - 0.01, dockEast, 1.2, dockNorth + 0.01]);
  wall(block, [dockWest, 0, dockSouth, dockEast, dockHeight, dockSouth + 0.2], true);
  // The outside wall with the dock door, then the rest of the service wing.
  const outside = (cutaway: boolean, z0: number, z1: number): void => wall(m.precast, [dockWest - 0.25, 0, z0, dockWest, dockHeight, z1], cutaway);
  outside(false, -16, -dockDoorHalf);
  outside(true, dockDoorHalf, back + 0.2);
  box(full, m.precast, [dockWest - 0.25, 4.0, -dockDoorHalf, dockWest, dockHeight, dockDoorHalf]);
  box(full, standard(0x6a7278, 0.5, 0.5), [dockWest + 0.05, 4.0, -dockDoorHalf, dockWest + 0.65, 4.6, dockDoorHalf]);
  wall(m.precast, [dockWest - 0.25, 0, -16.2, west, dockHeight, -16], false);
  wall(m.precast, [dockWest - 0.25, 0, back, west, dockHeight, back + 0.2], true);
  panel(full, standard(0x4a4c4e, 0.95), west - dockWest + 0.25, back + 16.2, (dockWest + west) / 2 - 0.12, dockHeight, (back - 16) / 2, 'up');
  ceiling(full, standard(0x2b3034, 0.9), dockWest - 4, -3.2, dockWest - 0.25, 3.2, 5.0);
  box(full, m.steel, [dockWest - 4, 5.0, -3.2, dockWest - 0.25, 5.15, 3.2]);
  // Inside: racking with stock in the room north of the dock, signs and a dock light.
  for (let i = 0; i < 3; i += 1) {
    const rz = -5.5 - i * 3.2;
    box(scene, standard(0x2f5f9a, 0.5, 0.4), [dockWest + 0.6, 0, rz - 0.05, dockEast - 0.8, 3.2, rz + 0.05]);
    for (let level = 0; level < 3; level += 1) {
      box(scene, standard(0xd06a2a, 0.5, 0.4), [dockWest + 0.6, 0.9 + level * 1.05, rz - 0.55, dockEast - 0.8, 0.98 + level * 1.05, rz + 0.55]);
      for (let k = 0; k < 4; k += 1) box(scene, standard(k % 2 ? 0xb8875a : 0xa47650, 0.9), [dockWest + 0.9 + k * 1.35, 0.98 + level * 1.05, rz - 0.4, dockWest + 2.0 + k * 1.35, 1.6 + level * 1.05, rz + 0.4]);
    }
  }
  sign(scene, ['RECEIVING · DOCK 3'], 3.0, 0.42, (dockWest + dockEast) / 2, 3.6, dockNorth + 0.03, 0, { background: '#13252c', color: '#e8c04a', glow: 0.9, depth: 0.05 });
  sign(scene, ['ALL DELIVERIES SIGN IN'], 2.4, 0.3, (dockWest + dockEast) / 2, 2.9, dockNorth + 0.03, 0, { background: '#f4efe6', color: '#2b2f33', glow: 0.5, depth: 0.04 });
  sign(scene, ['RECEIVING'], 2.6, 0.5, dockWest - 0.27, 4.6, -5.6, -Math.PI / 2, { background: '#13252c', color: '#e8c04a', glow: 0.9 });
  box(scene, standard(0x8a949a, 0.4, 0.6), [dockWest - 0.05, 0.002, -1.6, dockWest + 1.1, 0.03, 1.6]);
  for (const bz of [-1.75, 1.75]) box(scene, m.rubber, [dockWest - 0.4, 0.35, bz - 0.15, dockWest - 0.25, 0.75, bz + 0.15]);
  box(scene, m.rubber, [dockWest - 0.65, 0.8, -dockDoorHalf - 0.35, dockWest - 0.25, 3.8, -dockDoorHalf]);
  box(full, m.rubber, [dockWest - 0.65, 0.8, dockDoorHalf, dockWest - 0.25, 3.8, dockDoorHalf + 0.35]);
  box(scene, m.steel, [dockWest + 0.05, 2.8, -dockDoorHalf - 0.2, dockWest + 0.9, 2.86, -dockDoorHalf - 0.14]);
  box(scene, m.sodium, [dockWest + 0.8, 2.6, -dockDoorHalf - 0.3, dockWest + 1.0, 2.82, -dockDoorHalf - 0.04]);
  for (const bz of [-dockDoorHalf - 0.75, dockDoorHalf + 0.75]) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 10), m.yellow);
    bollard.position.set(dockWest - 0.7, 0.55, bz);
    scene.add(bollard);
  }

  // ---------------------------------------------------------------- outside: the yard, 111 Street and the LRT
  for (const z of [-1.9, 1.9]) floor(m.yellow, -31, z - 0.06, dockWest - 0.3, z + 0.06, -0.02);
  box(scene, standard(0x2f4a3a, 0.7, 0.2), [dockWest - 3.2, 0, -9.4, dockWest - 1.2, 1.5, -7.0]);
  box(scene, standard(0x8a9096, 0.6, 0.4), [dockWest - 3.6, 0, -13.2, dockWest - 0.3, 2.4, -10.4]);
  box(scene, m.yellow, [dockWest - 3.62, 1.9, -13.2, dockWest - 3.58, 2.1, -10.4]);
  for (const wz of [-6.5, -12.5]) box(scene, m.sodium, [dockWest - 0.45, 4.4, wz - 0.25, dockWest - 0.25, 4.7, wz + 0.25]);
  [[-26, -8.5, 0x7a1e22], [-26, -12.2, 0x2a3a4a]].forEach(([x, cz, color]) => {
    const car = createCar(color);
    car.position.set(x, 0, cz);
    scene.add(car);
  });
  // The grass berm with spruce, the sidewalk and both carriageways of 111 Street.
  floor(standard(0x2b3a26, 1), -31.5, -90, -28.5, 60, -0.02);
  floor(standard(0x6e6c68, 0.9), -33.5, -90, -31.5, 60, -0.01);
  for (let i = 0; i < 6; i += 1) {
    const tz = -22 + i * 7.5 + (i % 2) * 1.5;
    // The dock stays in view from 111 Street.
    if (Math.abs(tz) < 5) continue;
    const spruce = new THREE.Mesh(new THREE.ConeGeometry(1.5, 6.5, 7), m.spruce);
    spruce.position.set(-30, 3.6, tz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 6), m.darkWood);
    trunk.position.set(-30, 0.3, tz);
    scene.add(spruce, trunk);
  }
  const roadPaint = standard(0xe8e4d8, 0.8);
  for (const [r0, r1] of [[-41.5, -33.5], [-59.5, -51.5]]) {
    for (let z = -88; z < 58; z += 6) floor(roadPaint, (r0 + r1) / 2 - 0.07, z, (r0 + r1) / 2 + 0.07, z + 3, -0.015);
    box(scene, standard(0x8a8884, 0.8), [r1, -0.03, -90, r1 + 0.25, 0.15, 60]);
    box(scene, standard(0x8a8884, 0.8), [r0 - 0.25, -0.03, -90, r0, 0.15, 60]);
  }
  // The median: two tracks and the station platform between them.
  floor(standard(0x3a3632, 1), -51.5, -90, -41.5, 60, -0.012);
  for (const tx of [-49.5, -43.5]) for (const rail of [-0.72, 0.72]) box(scene, m.steel, [tx + rail - 0.04, -0.02, -90, tx + rail + 0.04, 0.14, 60]);
  box(scene, standard(0x9a9690, 0.8), [-48.0, 0, -34, -45.0, 0.9, 6]);
  box(scene, m.yellow, [-48.0, 0.9, -34, -47.7, 0.905, 6]);
  box(scene, m.yellow, [-45.3, 0.9, -34, -45.0, 0.905, 6]);
  for (let z = -32; z <= 4; z += 6) box(scene, m.steel, [-46.6, 0.9, z - 0.1, -46.4, 4.0, z + 0.1]);
  box(scene, standard(0x5a6670, 0.5, 0.4), [-48.4, 4.0, -33, -44.6, 4.25, 4]);
  box(scene, m.led, [-47.5, 3.94, -32, -45.5, 4.0, 3]);
  for (let z = -88; z < 58; z += 12) {
    box(scene, m.steel, [-46.6, 0, z - 0.1, -46.4, 6.4, z + 0.1]);
    box(scene, m.steel, [-50.2, 6.2, z - 0.05, -42.8, 6.3, z + 0.05]);
  }
  for (const tx of [-49.5, -43.5]) box(scene, standard(0x2a2a2a, 0.5, 0.6), [tx - 0.02, 5.6, -90, tx + 0.02, 5.64, 60]);
  // A two-car light-rail train waiting for the first run of the morning.
  for (const [z0, z1] of [[-30, -6.5], [-6, 17.5]]) {
    box(scene, standard(0xd8dcde, 0.45, 0.3), [-50.8, 0.6, z0, -48.2, 3.7, z1]);
    box(scene, m.glassLit, [-50.82, 1.7, z0 + 1.2, -48.18, 2.6, z1 - 1.2]);
    box(scene, standard(0x2a3238, 0.6), [-50.82, 0.6, z0, -48.18, 1.0, z1]);
    box(scene, standard(0x3a3f44, 0.5, 0.5), [-49.9, 3.7, (z0 + z1) / 2 - 1, -49.1, 4.3, (z0 + z1) / 2 + 1]);
  }
  for (const hz of [-30.05, 17.55]) for (const hx of [-50.3, -48.7]) box(scene, m.led, [hx - 0.2, 1.1, hz - 0.03, hx + 0.2, 1.3, hz + 0.03]);
  // The pedestrian overpass from the station over 111 Street into the mall's upper level.
  const [bridgeZ0, bridgeZ1] = [-9.8, -6.2];
  const bridgeX0 = -47.5;
  box(scene, standard(0x8e8a84, 0.8), [bridgeX0, 5.8, bridgeZ0, west, 6.2, bridgeZ1]);
  box(scene, standard(0x6a6e72, 0.6, 0.3), [bridgeX0, 8.6, bridgeZ0 - 0.15, west, 8.9, bridgeZ1 + 0.15]);
  for (const bz of [bridgeZ0, bridgeZ1]) box(scene, m.glassLit, [bridgeX0, 6.2, bz - 0.03, west, 8.6, bz + 0.03]);
  for (let x = bridgeX0; x <= west; x += 2.4) for (const bz of [bridgeZ0, bridgeZ1]) box(scene, m.steel, [x - 0.06, 6.2, bz - 0.08, x + 0.06, 8.6, bz + 0.08]);
  for (const x of [-38, -26]) for (const bz of [bridgeZ0 + 0.5, bridgeZ1 - 0.5]) box(scene, standard(0x9a968e, 0.8), [x - 0.35, 0, bz - 0.35, x + 0.35, 5.8, bz + 0.35]);
  box(scene, standard(0x8e8a84, 0.8), [-48.4, 0, -11.6, -44.6, 9.4, -8.6]);
  box(scene, m.glassLit, [-48.42, 1.2, -11.2, -44.58, 8.6, -9.0]);
  sign(scene, ['111 ST · TO TRAINS'], 3.4, 0.5, -36, 9.25, -8.0, 0, { background: '#1b2a33', color: '#f0e6d0', both: true });
  // Streetlights down both sides of 111 Street.
  for (let z = -84; z < 56; z += 18) for (const [x, arm] of [[-33.0, -1.6], [-59.9, 1.6]] as const) {
    box(scene, m.steel, [x - 0.08, 0, z - 0.08, x + 0.08, 9.0, z + 0.08]);
    box(scene, m.steel, [Math.min(x, x + arm), 8.9, z - 0.05, Math.max(x, x + arm), 9.0, z + 0.05]);
    box(scene, m.sodium, [x + arm - 0.35, 8.75, z - 0.18, x + arm + 0.35, 8.9, z + 0.18]);
  }
  // 51 Avenue crosses to the south; Whitemud Drive runs past to the north.
  floor(standard(0x2c3034, 0.95), -90, 24, 60, 32, -0.014);
  for (let x = -88; x < 58; x += 6) floor(roadPaint, x, 27.93, x + 3, 28.07, -0.012);
  for (let k = 0; k < 8; k += 1) floor(roadPaint, -41 + k * 1.0, 22.6, -40.5 + k * 1.0, 23.8, -0.011);
  box(scene, m.steel, [-32.6, 0, 22.4, -32.4, 3.6, 22.6]);
  sign(scene, ['111 ST'], 1.5, 0.32, -32.5, 3.75, 22.5, Math.PI / 2, { background: '#1f6a3a', color: '#ffffff', both: true, depth: 0.04 });
  sign(scene, ['51 AVE'], 1.5, 0.32, -32.5, 3.35, 22.5, 0, { background: '#1f6a3a', color: '#ffffff', both: true, depth: 0.04 });
  box(scene, standard(0x8a8884, 0.85), [-90, 0, -66, 60, 3.0, -58]);
  box(scene, standard(0x2c3034, 0.95), [-90, 3.0, -66, 60, 3.05, -58]);
  for (let x = -86; x < 58; x += 20) {
    box(scene, m.steel, [x - 0.08, 3.0, -62.1, x + 0.08, 12, -61.9]);
    box(scene, m.sodium, [x - 0.4, 11.8, -62.3, x + 0.4, 12, -61.7]);
  }

  // ---------------------------------------------------------------- finish
  mergeStatic(full);
  mergeStatic(cut, (object) => object.userData.keep === true);
  scene.add(full, cut);

  const setStatus = (index: number, text: string, background: string): void => {
    const face = boards[index];
    if (!face) return;
    const material = face.material as THREE.MeshStandardMaterial;
    const old = material.map;
    const texture = textTexture([text], { width: 360, height: 48, background, color: '#14232a', radius: 6 });
    material.map = texture;
    material.emissiveMap = texture;
    material.needsUpdate = true;
    old?.dispose();
  };
  return { full, cut, setStatus };
}
