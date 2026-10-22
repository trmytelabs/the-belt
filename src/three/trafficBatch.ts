import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

/**
 * The 28 traffic sedans on the road as four batched draws (the 3D depot
 * only). Each car used to be its own detailed model: a merged body, four
 * wheel pivots, a lit interior and a contract, ten or so draw calls apiece.
 * Traffic is only ever seen from the chase camera, so it is baked once per
 * sedan variant into four batches, one per material class:
 *
 * - paint, tinted per instance, which also holds an 1,800-triangle shell each
 *   car switches to beyond `LOD_DISTANCE` (most of the way into the fog);
 * - trim: glass, black plastic and chrome by vertex colour, and the four
 *   wheels as their own instances so they roll;
 * - lights: unlit headlamps, so they glow at night;
 * - tails: the unlit tail lamps, tinted per instance so they brighten while
 *   the car brakes (at a red light, or queuing behind a car or the truck).
 *
 * The player's own car and the lot's cars keep their full models. Until the
 * sedans have downloaded, and on renderers without the batch, the road keeps
 * its procedural cars.
 */
export interface TrafficPose { x: number; z: number; heading: number; braking?: boolean }

export type TrafficVariant = 'sedan' | 'sedan-wide';
export const TRAFFIC_VARIANTS: TrafficVariant[] = ['sedan', 'sedan-wide'];
export const TRAFFIC_COLOURS = [0xa74132, 0x7a7a70, 0xc6b58c, 0x467b91, 0x698560, 0xd8d4c8];
/**
 * Beyond this many metres from the camera a car draws its shell with no trim; its lights stay on. At 45 m the
 * switch showed in plain view (the owner saw cars look low-poly until they came close); the fog starts at 75 m.
 */
export const LOD_DISTANCE = 110;
/** Triangles the shell keeps. */
const SHELL_TRIANGLES = 1800;
/** The fitted size every sedan takes, as the full models do. */
const FIT = { length: 4.2, height: 1.5, width: 1.8 };
const TRIM_COLOURS: [RegExp, number][] = [[/windows/i, 0x1b2430], [/grey/i, 0x9aa0a4], [/black/i, 0x14161a]];
const LIGHT_COLOURS: [RegExp, number][] = [[/headlights/i, 0xfff1cc], [/taillights/i, 0xff3a2a]];
/**
 * The tail lamps' tint over their red: dimmed while running, and braking several times brighter in the red alone
 * (brightening all three channels washed the lamps out to peach once tone-mapped).
 */
export const TAIL_RUNNING = new THREE.Color(0.55, 0.45, 0.45);
export const TAIL_BRAKING = new THREE.Color(1.7, 0.3, 0.3);

/** One sedan variant baked into geometries in the car's frame: nose +x, y up, wheels on y 0. */
export interface VehicleParts {
  paint: THREE.BufferGeometry;
  shell: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  lights: THREE.BufferGeometry;
  tails: THREE.BufferGeometry;
  /** Each wheel's geometry centred on its own axle, and where that centre sits in the car. */
  wheels: { geometry: THREE.BufferGeometry; centre: THREE.Vector3 }[];
  wheelRadius: number;
}

function colourAttribute(geometry: THREE.BufferGeometry, hex: number): void {
  const colour = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) { colours[i * 3] = colour.r; colours[i * 3 + 1] = colour.g; colours[i * 3 + 2] = colour.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

/** Keeps only the attributes every part shares, so the parts merge. */
function plain(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
  geometry.morphAttributes = {};
  return geometry;
}

/** A mesh's geometry split by its material groups, each piece carrying its material's name. */
function pieces(mesh: THREE.Mesh): { geometry: THREE.BufferGeometry; material: string }[] {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const source = mesh.geometry.index ? mesh.geometry : mesh.geometry;
  const groups = source.groups.length ? source.groups : [{ start: 0, count: source.index ? source.index.count : source.attributes.position.count, materialIndex: 0 }];
  return groups.map((group) => {
    const geometry = source.clone();
    if (geometry.index) {
      const index = geometry.index.array.slice(group.start, group.start + group.count);
      geometry.setIndex(new THREE.BufferAttribute(index, 1));
    } else geometry.setDrawRange(group.start, group.count);
    geometry.clearGroups();
    const indexed = geometry.index ? geometry : geometry;
    const whole = indexed.toNonIndexed();
    whole.applyMatrix4(mesh.matrixWorld);
    return { geometry: plain(whole), material: materials[group.materialIndex ?? 0]?.name ?? '' };
  });
}

/** Splits a non-indexed geometry's triangles by the sign of their centroid's z, for a mesh holding both rear wheels. */
function splitByZ(geometry: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const position = geometry.attributes.position, normal = geometry.attributes.normal, colour = geometry.attributes.color;
  const sides: { p: number[]; n: number[]; c: number[] }[] = [{ p: [], n: [], c: [] }, { p: [], n: [], c: [] }];
  for (let i = 0; i < position.count; i += 3) {
    const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
    const side = sides[z < 0 ? 0 : 1];
    for (let k = 0; k < 3; k += 1) {
      side.p.push(position.getX(i + k), position.getY(i + k), position.getZ(i + k));
      if (normal) side.n.push(normal.getX(i + k), normal.getY(i + k), normal.getZ(i + k));
      if (colour) side.c.push(colour.getX(i + k), colour.getY(i + k), colour.getZ(i + k));
    }
  }
  return sides.filter((side) => side.p.length).map((side) => {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(side.p, 3));
    if (side.n.length) out.setAttribute('normal', new THREE.Float32BufferAttribute(side.n, 3));
    else out.computeVertexNormals();
    if (side.c.length) out.setAttribute('color', new THREE.Float32BufferAttribute(side.c, 3));
    return out;
  });
}

/** Moves a wheel's geometry so its bounds centre is the origin, and reports that centre. */
function recentre(geometry: THREE.BufferGeometry): { geometry: THREE.BufferGeometry; centre: THREE.Vector3; radius: number } {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const centre = box.getCenter(new THREE.Vector3());
  geometry.translate(-centre.x, -centre.y, -centre.z);
  return { geometry, centre, radius: (box.max.y - box.min.y) / 2 };
}

/** An 1,800-triangle shell of the body for distant cars, in the paint's colour. */
function shellOf(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const whole = mergeVertices(mergeGeometries(parts.map((part) => { const copy = part.clone(); copy.deleteAttribute('color'); copy.deleteAttribute('normal'); return copy; }), false), 1e-3);
  const triangles = (whole.index ? whole.index.count : whole.attributes.position.count) / 3;
  const vertices = whole.attributes.position.count;
  const remove = Math.max(0, Math.round(vertices * (1 - SHELL_TRIANGLES / Math.max(triangles, 1))));
  // The batches take every geometry the same way: non-indexed, like the baked parts.
  try {
    const shell = (remove > 0 ? new SimplifyModifier().modify(whole, remove) : whole).toNonIndexed();
    shell.computeVertexNormals();
    return shell;
  } catch {
    const plainShell = whole.toNonIndexed();
    plainShell.computeVertexNormals();
    return plainShell;
  }
}

/**
 * Bakes a sedan's loaded scene into the batch's parts. The source nose is +z;
 * it is turned to +x and fitted to the same box as the full models, so a
 * batched car stands where its procedural stand-in stood.
 */
export function bakeVehicleParts(source: THREE.Object3D): VehicleParts {
  const model = source.clone(true);
  model.rotation.y = Math.PI / 2;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  model.scale.set(FIT.width / size.z, FIT.height / size.y, FIT.length / size.x);
  model.position.y = -bounds.min.y * model.scale.y;
  model.updateMatrixWorld(true);
  const paint: THREE.BufferGeometry[] = [], trim: THREE.BufferGeometry[] = [], lights: THREE.BufferGeometry[] = [], tails: THREE.BufferGeometry[] = [];
  const wheels: VehicleParts['wheels'] = [];
  const radii: number[] = [];
  // A wheel is a node (the loader splits a multi-material wheel into a tyre mesh and a rim mesh under it).
  const wheelNodes: THREE.Object3D[] = [];
  const underWheel = (object: THREE.Object3D): boolean => { for (let node: THREE.Object3D | null = object; node; node = node.parent) if (wheelNodes.includes(node)) return true; return false; };
  model.traverse((object) => { if (/wheel/i.test(object.name) && !underWheel(object)) wheelNodes.push(object); });
  const classify = (piece: { geometry: THREE.BufferGeometry; material: string }, into: { paint: boolean }): void => {
    const light = LIGHT_COLOURS.find(([pattern]) => pattern.test(piece.material));
    const dark = TRIM_COLOURS.find(([pattern]) => pattern.test(piece.material));
    if (light) { colourAttribute(piece.geometry, light[1]); (light === LIGHT_COLOURS[1] ? tails : lights).push(piece.geometry); }
    else if (dark) { colourAttribute(piece.geometry, dark[1]); trim.push(piece.geometry); }
    else if (into.paint && /blue|red|paint|light/i.test(piece.material)) paint.push(piece.geometry);
    else { colourAttribute(piece.geometry, 0x5f666c); trim.push(piece.geometry); }
  };
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || underWheel(mesh)) return;
    for (const piece of pieces(mesh)) classify(piece, { paint: true });
  });
  for (const node of wheelNodes) {
    const parts: THREE.BufferGeometry[] = [];
    node.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const piece of pieces(mesh)) {
        const dark = TRIM_COLOURS.find(([pattern]) => pattern.test(piece.material));
        colourAttribute(piece.geometry, dark ? dark[1] : 0x14161a);
        parts.push(piece.geometry);
      }
    });
    if (!parts.length) continue;
    const whole = mergeGeometries(parts, false);
    whole.computeBoundingBox();
    const width = whole.boundingBox!.max.z - whole.boundingBox!.min.z;
    // A single node holding both rear wheels spans the car's width.
    for (const piece of width > FIT.width * 0.6 ? splitByZ(whole) : [whole]) {
      const wheel = recentre(piece);
      wheels.push({ geometry: wheel.geometry, centre: wheel.centre });
      radii.push(wheel.radius);
    }
  }
  const merged = (list: THREE.BufferGeometry[]): THREE.BufferGeometry => list.length ? mergeGeometries(list, false) : new THREE.BufferGeometry();
  const body = merged(paint);
  return {
    paint: body,
    shell: shellOf([body, ...trim]),
    trim: merged(trim),
    lights: merged(lights),
    tails: merged(tails),
    wheels,
    wheelRadius: radii.length ? radii.reduce((sum, r) => sum + r, 0) / radii.length : 0.33,
  };
}

interface Slot {
  variant: number;
  body: number;
  trimBody: number;
  lights: number;
  tails: number;
  braking: boolean;
  wheels: number[];
  spin: number;
  last: THREE.Vector3 | null;
  far: boolean;
}

interface VariantIds { full: number; shell: number; trim: number; lights: number; tails: number; wheels: number[] }

const carMatrix = new THREE.Matrix4();
const wheelMatrix = new THREE.Matrix4();
const spinMatrix = new THREE.Matrix4();
const offset = new THREE.Matrix4();
const position = new THREE.Vector3();
const AXLE = new THREE.Vector3(0, 0, 1);

export class TrafficBatch {
  public readonly root = new THREE.Group();
  /** Resolves true once the sedans have downloaded and the batches are built. */
  public readonly ready: Promise<boolean>;
  private paint: THREE.BatchedMesh | null = null;
  private trim: THREE.BatchedMesh | null = null;
  private lights: THREE.BatchedMesh | null = null;
  private tails: THREE.BatchedMesh | null = null;
  private variants: { parts: VehicleParts; ids: VariantIds }[] = [];
  private readonly slots = new Map<string, Slot>();
  private disposed = false;
  private readonly capacity: number;
  public lodDistance = LOD_DISTANCE;

  constructor(capacity: number, loader: () => Promise<THREE.Object3D[]>) {
    this.capacity = capacity;
    this.root.name = 'traffic-batch';
    this.root.userData.keep = true;
    this.ready = loader().then((scenes) => {
      if (this.disposed || !scenes.length) return false;
      this.build(scenes.map((scene) => bakeVehicleParts(scene)));
      return true;
    }).catch((error: unknown) => { console.warn('Traffic sedans unavailable; keeping the procedural cars', error); return false; });
  }

  /** Builds the three batches from the baked parts; exposed for checks that bake without a download. */
  public build(parts: VehicleParts[]): void {
    const count = (list: THREE.BufferGeometry[], key: 'position' | 'index'): number =>
      list.reduce((sum, g) => sum + (key === 'index' ? (g.index ? g.index.count : g.attributes.position.count) : g.attributes.position.count), 0);
    const paintGeometries = parts.flatMap((p) => [p.paint, p.shell]);
    const trimGeometries = parts.flatMap((p) => [p.trim, ...p.wheels.map((w) => w.geometry)]);
    const lightGeometries = parts.map((p) => p.lights);
    const tailGeometries = parts.map((p) => p.tails);
    const n = this.capacity;
    const mostWheels = Math.max(0, ...parts.map((p) => p.wheels.length));
    this.paint = new THREE.BatchedMesh(n, count(paintGeometries, 'position'), count(paintGeometries, 'index'),
      new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.1 }));
    this.trim = new THREE.BatchedMesh(n * (1 + mostWheels), count(trimGeometries, 'position'), count(trimGeometries, 'index'),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }));
    this.lights = new THREE.BatchedMesh(n, count(lightGeometries, 'position'), count(lightGeometries, 'index'),
      new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.tails = new THREE.BatchedMesh(n, count(tailGeometries, 'position'), count(tailGeometries, 'index'),
      new THREE.MeshBasicMaterial({ vertexColors: true }));
    for (const mesh of [this.paint, this.trim, this.lights, this.tails]) {
      mesh.name = 'traffic-batch-' + (mesh === this.paint ? 'paint' : mesh === this.trim ? 'trim' : mesh === this.lights ? 'lights' : 'tails');
      mesh.userData.keep = true;
      mesh.sortObjects = false;
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
    this.paint.castShadow = true;
    this.trim.castShadow = true;
    this.variants = parts.map((p) => ({ parts: p, ids: {
      full: this.paint!.addGeometry(p.paint), shell: this.paint!.addGeometry(p.shell),
      trim: this.trim!.addGeometry(p.trim), lights: this.lights!.addGeometry(p.lights), tails: this.tails!.addGeometry(p.tails),
      wheels: p.wheels.map((w) => this.trim!.addGeometry(w.geometry)),
    } }));
  }

  /** True once the batches exist. */
  public get built(): boolean { return this.paint !== null; }

  /** The number of cars placed. */
  public get size(): number { return this.slots.size; }

  /** Gives a car its instances, in a colour from the road's set. */
  private slot(id: string, index: number): Slot {
    let slot = this.slots.get(id);
    if (slot) return slot;
    const variant = index % this.variants.length, ids = this.variants[variant].ids;
    slot = {
      variant,
      body: this.paint!.addInstance(ids.full),
      trimBody: this.trim!.addInstance(ids.trim),
      lights: this.lights!.addInstance(ids.lights),
      tails: this.tails!.addInstance(ids.tails), braking: false,
      wheels: ids.wheels.map((wheel) => this.trim!.addInstance(wheel)),
      spin: 0, last: null, far: false,
    };
    this.paint!.setColorAt(slot.body, new THREE.Color(TRAFFIC_COLOURS[index % TRAFFIC_COLOURS.length]));
    this.tails!.setColorAt(slot.tails, TAIL_RUNNING);
    this.slots.set(id, slot);
    return slot;
  }

  /**
   * Puts car `id` at `pose`, rolling its wheels by how far it moved, and
   * picks its level of detail from its distance to `camera`.
   */
  public place(id: string, index: number, pose: TrafficPose, camera: THREE.Object3D): void {
    if (!this.paint || !this.trim || !this.lights || !this.tails) return;
    const slot = this.slot(id, index), variant = this.variants[slot.variant];
    carMatrix.makeRotationY(pose.heading).setPosition(pose.x, 0, pose.z);
    position.set(pose.x, 0, pose.z);
    if (slot.last) {
      const moved = position.distanceTo(slot.last);
      // A jump is a reset, not travel. Rolling forward spins the wheels back about the car's lateral axis.
      if (moved < 6) slot.spin -= moved / variant.parts.wheelRadius;
      slot.last.copy(position);
    } else slot.last = position.clone();
    const far = camera.position.distanceTo(position) > this.lodDistance * (slot.far ? 0.9 : 1);
    if (far !== slot.far) {
      slot.far = far;
      this.paint.setGeometryIdAt(slot.body, far ? variant.ids.shell : variant.ids.full);
      this.trim.setVisibleAt(slot.trimBody, !far);
      for (const wheel of slot.wheels) this.trim.setVisibleAt(wheel, !far);
    }
    this.paint.setMatrixAt(slot.body, carMatrix);
    this.trim.setMatrixAt(slot.trimBody, carMatrix);
    this.lights.setMatrixAt(slot.lights, carMatrix);
    this.tails.setMatrixAt(slot.tails, carMatrix);
    const braking = pose.braking === true;
    if (braking !== slot.braking) { slot.braking = braking; this.tails.setColorAt(slot.tails, braking ? TAIL_BRAKING : TAIL_RUNNING); }
    if (!far) {
      spinMatrix.makeRotationAxis(AXLE, slot.spin);
      slot.wheels.forEach((instance, i) => {
        const centre = variant.parts.wheels[i].centre;
        wheelMatrix.copy(carMatrix).multiply(offset.makeTranslation(centre.x, centre.y, centre.z)).multiply(spinMatrix);
        this.trim!.setMatrixAt(instance, wheelMatrix);
      });
    }
  }

  /** Which detail each car draws, for checks. */
  public report(): { id: string; far: boolean; variant: number; braking: boolean }[] {
    return [...this.slots.entries()].map(([id, slot]) => ({ id, far: slot.far, variant: slot.variant, braking: slot.braking }));
  }

  public dispose(): void {
    this.disposed = true;
    for (const mesh of [this.paint, this.trim, this.lights, this.tails]) {
      if (!mesh) continue;
      mesh.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    for (const { parts } of this.variants) {
      for (const geometry of [parts.paint, parts.shell, parts.trim, parts.lights, parts.tails, ...parts.wheels.map((w) => w.geometry)]) geometry.dispose();
    }
    this.root.removeFromParent();
    this.slots.clear();
  }
}
