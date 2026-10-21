import * as THREE from 'three';

/**
 * The 3D night is Christmas: snow covers everything outdoors and keeps
 * falling. Flakes are one Points cloud per region, wrapped inside their box
 * so they never run out; a region can follow a moving camera. Ground cover,
 * plowed banks and roof caps share one canvas snow texture.
 */
export const SNOW_COLOR = 0xe9eff5;

let flakeTexture: THREE.CanvasTexture | null = null;
let groundTexture: THREE.CanvasTexture | null = null;
/** One material per tiling, so same-sized banks and caps share a texture upload and merge into one draw. */
const materials = new Map<string, THREE.MeshStandardMaterial>();

/** A soft round flake. */
function flake(): THREE.CanvasTexture {
  if (flakeTexture) return flakeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  flakeTexture = new THREE.CanvasTexture(canvas);
  flakeTexture.colorSpace = THREE.SRGBColorSpace;
  return flakeTexture;
}

/** Fresh snow: bright, with faint blue-grey drifts so a large field is not flat white. */
function snowTexture(): THREE.CanvasTexture {
  if (groundTexture) return groundTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#eef2f6';
  ctx.fillRect(0, 0, 128, 128);
  let seed = 11;
  const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i += 1) {
    const x = random() * 128, y = random() * 128, r = 6 + random() * 18;
    const drift = ctx.createRadialGradient(x, y, 0, x, y, r);
    drift.addColorStop(0, random() < 0.5 ? 'rgba(196,210,226,0.35)' : 'rgba(255,255,255,0.5)');
    drift.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = drift;
    for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) {
      ctx.save(); ctx.translate(dx, dy); ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
    }
  }
  groundTexture = new THREE.CanvasTexture(canvas);
  groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.colorSpace = THREE.SRGBColorSpace;
  return groundTexture;
}

/** Snow ground cover; `tile` is the metres one drift texture spans. */
export function snowMaterial(width: number, depth: number, tile = 6): THREE.MeshStandardMaterial {
  const repeatX = Math.max(1, Math.round(width / tile)), repeatY = Math.max(1, Math.round(depth / tile));
  const key = `${repeatX}x${repeatY}`;
  let material = materials.get(key);
  if (!material) {
    const map = snowTexture().clone();
    map.repeat.set(repeatX, repeatY);
    map.needsUpdate = true;
    // Shared by every stage that shows snow; disposing one stage leaves it loaded (see resources.ts).
    map.userData.shared = true;
    material = new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.92 });
    materials.set(key, material);
  }
  return material;
}

/** A flat snow field lying on the ground at `y`. */
export function snowField(width: number, depth: number, x = 0, z = 0, y = 0): THREE.Mesh {
  const field = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), snowMaterial(width, depth));
  field.rotation.x = -Math.PI / 2;
  field.position.set(x, y, z);
  field.receiveShadow = true;
  return field;
}

/** A plowed bank: a low mound `length` long along local X. */
export function snowBank(length: number, depth = 1.2, height = 0.5): THREE.Mesh {
  const bank = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2), snowMaterial(length, depth, 3));
  bank.scale.set(length / 2, height, depth / 2);
  bank.receiveShadow = true;
  bank.userData.solid = false;
  return bank;
}

/** A snow layer resting on a flat roof or ledge, `thickness` deep. */
export function snowCap(width: number, depth: number, thickness = 0.12): THREE.Mesh {
  const cap = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth), snowMaterial(width, depth, 3));
  cap.receiveShadow = true;
  cap.userData.solid = false;
  return cap;
}

export interface SnowfallOptions {
  /** Flakes in the region. */
  count: number;
  /** Flake size in metres. */
  size?: number;
  /** Fall speed in metres per second. */
  fall?: number;
  /** The flakes' colour and opacity; brighter for snow caught in a headlight beam. */
  color?: THREE.ColorRepresentation;
  opacity?: number;
}

/**
 * Flakes falling through a box. Each flake wraps back into the box on every
 * axis, so a region that follows the camera keeps every flake in place in
 * the world until it leaves one side and reappears on the other.
 */
export class Snowfall {
  public readonly points: THREE.Points;
  private readonly box: THREE.Box3;
  private readonly size = new THREE.Vector3();
  private readonly speeds: Float32Array;
  private readonly phases: Float32Array;
  private readonly fall: number;
  private clock = 0;

  constructor(box: THREE.Box3, options: SnowfallOptions) {
    this.box = box.clone();
    this.box.getSize(this.size);
    this.fall = options.fall ?? 0.9;
    const count = options.count;
    const positions = new Float32Array(count * 3);
    this.speeds = new Float32Array(count);
    this.phases = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = this.box.min.x + Math.random() * this.size.x;
      positions[i * 3 + 1] = this.box.min.y + Math.random() * this.size.y;
      positions[i * 3 + 2] = this.box.min.z + Math.random() * this.size.z;
      this.speeds[i] = 0.7 + Math.random() * 0.6;
      this.phases[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: options.color ?? 0xf4f8ff, size: options.size ?? 0.09, map: flake(), transparent: true, opacity: options.opacity ?? 0.9,
      depthWrite: false, sizeAttenuation: true, fog: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'snowfall';
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.points.userData.keep = true;
    this.points.userData.solid = false;
  }

  /** Recentres the region on `center` (x and z); flakes stay where they are in the world. */
  public follow(center: THREE.Vector3): void {
    const x = center.x - this.size.x / 2, z = center.z - this.size.z / 2;
    this.box.min.x = x; this.box.max.x = x + this.size.x;
    this.box.min.z = z; this.box.max.z = z + this.size.z;
  }

  /** Flakes fall and sway, carried along x and z by the wind in m/s; with reduced motion they stay still. */
  public update(dt: number, reducedMotion = false, windX = 0, windZ = 0): void {
    if (dt <= 0) return;
    const attribute = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    const { min } = this.box;
    const wrap = (value: number, from: number, span: number): number => from + ((((value - from) % span) + span) % span);
    const still = reducedMotion;
    if (!still) this.clock += dt;
    for (let i = 0; i < this.speeds.length; i += 1) {
      const sway = this.clock * 0.9 + this.phases[i];
      let x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      if (!still) {
        y -= this.fall * this.speeds[i] * dt;
        x += (Math.sin(sway) * 0.25 + windX) * dt;
        z += (Math.cos(sway * 0.8) * 0.18 + windZ) * dt;
      }
      positions[i * 3] = wrap(x, min.x, this.size.x);
      positions[i * 3 + 1] = wrap(y, min.y, this.size.y);
      positions[i * 3 + 2] = wrap(z, min.z, this.size.z);
    }
    attribute.needsUpdate = true;
  }

  public dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** A snowfall region from corner coordinates. */
export function snowfall(min: [number, number, number], max: [number, number, number], options: SnowfallOptions): Snowfall {
  return new Snowfall(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), options);
}
