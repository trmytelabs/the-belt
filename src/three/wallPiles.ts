import * as THREE from 'three';

import { SURFACE_MEANS, boxUVs, cardboardMaterial } from './textures.ts';

/**
 * Christmas peak: unsorted cartons pile up against the depot's walls through
 * the three-minute shift. Columns grow at random rates until they reach the
 * top of the 7.4 m walls; after that every new carton tumbles off the pile's
 * open edge onto the floor in front of it. The piles fill the corners that
 * no worker, crew route, visitor or truck uses (the receiving corners and
 * the lower-floor ends beyond the storage bands), so they never block play.
 * Behind the bulk area, a narrow strip on the platform against the rear wall
 * (past the furthest a worker can reach) fills to the top without spilling.
 *
 * Everything here is in world metres. Progress runs from 0 (shift start) to
 * 1 (the end of the three minutes).
 */
export const WALL_PILE_ROOF = 7.4;
/** Seconds of shift time a stacked carton takes to drop onto its pile. */
export const WALL_PILE_DROP_MS = 450;
/** Seconds of shift time an overflowing carton takes to tumble to the floor. */
export const WALL_PILE_SPILL_MS = 1100;
/** Every column has reached the roof by this much of the shift. */
export const WALL_PILE_FULL_BY = 0.9;

export interface WallPileZone {
  name: string;
  /** The pile's footprint against the wall. */
  pile: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Where overflow lands, in front of the pile's open edge. */
  spill: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Floor height the pile stands on: the loading platform's deck is 1.1 m up. */
  base?: number;
  /** False for a pile with no free floor in front: it is stacked neatly and stops at the top. */
  overflow?: boolean;
}

/** The receiving corners (beside the side walls) and the lower-floor ends (against the side and rear walls). */
export const WALL_PILE_ZONES: readonly WallPileZone[] = [-1, 1].flatMap((side): WallPileZone[] => {
  const mirror = (box: WallPileZone['pile']): WallPileZone['pile'] => side < 0 ? box
    : { minX: -box.maxX, maxX: -box.minX, minZ: box.minZ, maxZ: box.maxZ };
  return [
    {
      name: side < 0 ? 'west-receiving' : 'east-receiving',
      pile: mirror({ minX: -15.1, maxX: -13.5, minZ: -16.5, maxZ: -8.3 }),
      spill: mirror({ minX: -13.5, maxX: -11.2, minZ: -15.7, maxZ: -8.3 }),
    },
    {
      name: side < 0 ? 'west-receiving-corner' : 'east-receiving-corner',
      pile: mirror({ minX: -15.1, maxX: -14.3, minZ: -18.2, maxZ: -16.5 }),
      spill: mirror({ minX: -14.3, maxX: -13.9, minZ: -17.0, maxZ: -16.5 }),
    },
    {
      name: side < 0 ? 'west-lower-floor' : 'east-lower-floor',
      pile: mirror({ minX: -15.1, maxX: -13.1, minZ: 24.5, maxZ: 26.45 }),
      spill: mirror({ minX: -13.1, maxX: -12.45, minZ: 24.6, maxZ: 26.45 }),
    },
    {
      // Either side of the bulk pile, on the platform deck against the rear wall.
      name: side < 0 ? 'west-bulk' : 'east-bulk',
      pile: mirror({ minX: -4.65, maxX: -2.1, minZ: 26.14, maxZ: 26.52 }),
      spill: mirror({ minX: -4.65, maxX: -2.1, minZ: 26.0, maxZ: 26.14 }),
      base: 1.1,
      overflow: false,
    },
  ];
});

export interface PileBox {
  zone: string;
  /** The column a carton is stacked in or overflowed from. */
  column: number;
  /** Resting centre. */
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  /** Turn about the vertical, and the tip of a spilled carton lying askew. */
  turn: number; tilt: number;
  /** Progress at which it lands. */
  at: number;
  /** An overflow carton tumbling off the top of a full column. */
  spill: boolean;
  /** Where a spilled carton leaves the top of its column. */
  from: { x: number; y: number; z: number } | null;
}

/** A small deterministic generator, so every night's piles are the same shape. */
function generator(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

/** Every carton in every pile, ordered by the moment it lands. */
export function buildWallPiles(seed = 25_12): PileBox[] {
  const random = generator(seed);
  const between = (a: number, b: number): number => a + (b - a) * random();
  const boxes: PileBox[] = [];
  let column = 0;
  for (const zone of WALL_PILE_ZONES) {
    const { pile, spill } = zone;
    // Which way the open edge faces: overflow falls toward the depot's centre.
    const spillX = Math.sign((spill.minX + spill.maxX) / 2 - (pile.minX + pile.maxX) / 2);
    const spillZ = Math.abs(spill.minX - pile.maxX) < 1e-6 || Math.abs(spill.maxX - pile.minX) < 1e-6 ? 0
      : Math.sign((spill.minZ + spill.maxZ) / 2 - (pile.minZ + pile.maxZ) / 2);
    const across = Math.max(1, Math.round((pile.maxX - pile.minX) / 0.8));
    const along = Math.max(1, Math.round((pile.maxZ - pile.minZ) / 0.8));
    const cellX = (pile.maxX - pile.minX) / across;
    const cellZ = (pile.maxZ - pile.minZ) / along;
    for (let i = 0; i < across; i += 1) for (let j = 0; j < along; j += 1) {
      const cx = pile.minX + cellX * (i + 0.5);
      const cz = pile.minZ + cellZ * (j + 0.5);
      column += 1;
      // Columns start and finish at their own pace, so the piles rise unevenly.
      const start = between(0, 0.3);
      const full = between(Math.max(start + 0.35, 0.55), WALL_PILE_FULL_BY);
      const curve = between(0.75, 1.35);
      const stack: Omit<PileBox, 'at'>[] = [];
      const base = zone.base ?? 0;
      const neat = zone.overflow === false;
      let top = 0;
      for (;;) {
        const h = between(0.38, 0.62);
        if (base + top + h > WALL_PILE_ROOF) break;
        const w = Math.min(cellX * 0.98, between(0.5, 0.82));
        const d = Math.min(cellZ * 0.98, between(0.5, 0.82));
        // Higher up, cartons are thrown on less carefully: turned, tipped and bulging out over the floor.
        // A neat pile has nowhere to bulge: it stays square to its wall.
        const reckless = neat ? 0 : top / WALL_PILE_ROOF;
        const bulge = reckless * reckless * between(0, 0.22);
        const jitter = neat ? 0.02 : 0.05;
        stack.push({
          zone: zone.name, column,
          x: cx + between(-jitter, jitter) + (spillZ === 0 ? spillX * bulge : 0), y: base + top + h / 2,
          z: cz + between(-jitter, jitter) + spillZ * bulge,
          w, h, d, turn: between(-1, 1) * (neat ? 0.05 : 0.1 + 0.3 * reckless), tilt: between(-1, 1) * 0.1 * reckless, spill: false, from: null,
        });
        top += h;
      }
      stack.forEach((box, k) => {
        boxes.push({ ...box, at: start + (full - start) * ((k + 1) / stack.length) ** curve });
      });
      // Once full, each column sheds cartons off its open edge until the end of the shift.
      const shed = neat ? 0 : 4 + Math.floor(random() * 5);
      for (let k = 0; k < shed; k += 1) {
        const at = between(full + 0.01, 1);
        const w = between(0.45, 0.75), h = between(0.35, 0.55), d = between(0.45, 0.75);
        // Land somewhere in front of this column, nearer the pile more often.
        const reach = random() ** 1.6;
        const edge = (value: number, size: number, min: number, max: number, toward: number): number =>
          // Keep the carton inside the overflow area on the open-floor side.
          toward > 0 ? Math.min(value, max - size / 2) : toward < 0 ? Math.max(value, min + size / 2) : THREE.MathUtils.clamp(value, min, max);
        const sx = edge(spillZ === 0
          ? (spillX > 0 ? spill.minX + reach * (spill.maxX - spill.minX) : spill.maxX - reach * (spill.maxX - spill.minX))
          : cx + between(-0.4, 0.4), w, spill.minX, spill.maxX, spillZ === 0 ? spillX : 0);
        const sz = edge(spillZ === 0
          ? cz + between(-0.6, 0.6)
          : (spillZ > 0 ? spill.minZ + reach * (spill.maxZ - spill.minZ) : spill.maxZ - reach * (spill.maxZ - spill.minZ)), d, spill.minZ, spill.maxZ, spillZ);
        boxes.push({
          zone: zone.name, column, x: sx, y: h / 2, z: sz, w, h, d,
          turn: between(-Math.PI, Math.PI), tilt: between(-0.35, 0.35), at, spill: true,
          from: { x: spillZ === 0 ? (spillX > 0 ? pile.maxX : pile.minX) : cx, y: WALL_PILE_ROOF + 0.2, z: spillZ === 0 ? cz : (spillZ > 0 ? pile.maxZ : pile.minZ) },
        });
      }
    }
  }
  boxes.sort((a, b) => a.at - b.at);
  // Overflow mounds up in the order it lands: each carton rests on those already in its patch of floor.
  const mounds = new Map<string, number>();
  for (const box of boxes) {
    if (!box.spill) continue;
    const key = `${box.zone}:${Math.round(box.x / 0.6)}:${Math.round(box.z / 0.6)}`;
    const floor = mounds.get(key) ?? 0;
    box.y = floor + box.h / 2;
    mounds.set(key, floor + box.h * 0.85);
  }
  return boxes;
}

/** Tints over the cardboard material's average brown: paler, darker and redder cartons. */
const CARTON_TINTS = [0xffffff, 0xe2d6c8, 0xfff0dc, 0xcdb8a4, 0xf0d8c0, 0xd8cfc6];

/** Draws the piles as one instanced mesh and plays each carton's arrival. */
export class WallPiles {
  public readonly mesh: THREE.InstancedMesh;
  public readonly boxes: readonly PileBox[];
  /** Cartons drawn: all that have started to arrive. */
  public visible = 0;
  private settledUpTo = 0;
  private lastProgress = -1;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3();

  constructor(boxes: readonly PileBox[] = buildWallPiles(), shadows = true) {
    this.boxes = boxes;
    const geometry = boxUVs(new THREE.BoxGeometry(1, 1, 1), 0.6);
    this.mesh = new THREE.InstancedMesh(geometry, cardboardMaterial(SURFACE_MEANS.cardboard.color, 0.92), boxes.length);
    this.mesh.name = 'wall-piles';
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = true;
    this.mesh.userData.keep = true;
    this.mesh.userData.solid = false;
    // Cartons fall in from above their resting places; culling by bounds would need refreshing every frame.
    this.mesh.frustumCulled = false;
    const color = new THREE.Color();
    boxes.forEach((box, index) => {
      this.mesh.setColorAt(index, color.setHex(CARTON_TINTS[(index * 7 + Math.round(box.h * 100)) % CARTON_TINTS.length]));
      this.place(index, 1);
    });
    this.mesh.count = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Shows the piles as they stand `progress` (0..1) of the way through the shift. */
  public update(progress: number, durationMs: number, reducedMotion: boolean): void {
    progress = Math.max(0, progress);
    if (progress === this.lastProgress) return;
    const boxes = this.boxes;
    if (progress < this.lastProgress) {
      // A new night: everything back to its resting place, nothing shown.
      for (let i = 0; i < boxes.length; i += 1) this.place(i, 1);
      this.settledUpTo = 0;
    }
    this.lastProgress = progress;
    let visible = this.visible;
    if (visible > 0 && boxes[visible - 1].at > progress) visible = 0;
    while (visible < boxes.length && boxes[visible].at <= progress) visible += 1;
    const dropSpan = WALL_PILE_DROP_MS / durationMs, spillSpan = WALL_PILE_SPILL_MS / durationMs;
    // Cartons still falling begin as soon as they are due and finish one span later.
    let settled = this.settledUpTo;
    for (let i = settled; i < visible; i += 1) {
      const box = boxes[i];
      const t = reducedMotion ? 1 : Math.min(1, (progress - box.at) / (box.spill ? spillSpan : dropSpan) + 1e-9);
      this.place(i, t);
      if (t >= 1 && i === settled) settled = i + 1;
    }
    this.settledUpTo = settled;
    if (visible !== this.visible) {
      this.visible = visible;
      this.mesh.count = visible;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Each carton is due at `at` and appears just above its place, so it lands on time. */
  private place(index: number, t: number): void {
    const box = this.boxes[index];
    const eased = t * t;
    if (!box.spill) {
      this.position.set(box.x, box.y + (1 - eased) * 1.4, box.z);
      this.euler.set(box.tilt, box.turn, -box.tilt * 0.6);
    } else {
      // An arc off the top of the column, tumbling end over end, then the bounce of the landing.
      const from = box.from!;
      const arc = Math.sin(Math.min(1, t) * Math.PI) * 0.6;
      this.position.set(
        THREE.MathUtils.lerp(from.x, box.x, t),
        THREE.MathUtils.lerp(from.y, box.y, eased) + arc * (1 - t),
        THREE.MathUtils.lerp(from.z, box.z, t),
      );
      const spin = (1 - t) * Math.PI * 1.5;
      this.euler.set(box.tilt + spin, box.turn, box.tilt * 0.5 + spin * 0.4);
    }
    this.rotation.setFromEuler(this.euler);
    this.scale.set(box.w, box.h, box.d);
    this.matrix.compose(this.position, this.rotation, this.scale);
    this.mesh.setMatrixAt(index, this.matrix);
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
