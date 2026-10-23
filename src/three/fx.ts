import * as THREE from 'three';

interface Puff {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  age: number;
  life: number;
  size: number;
  grow: number;
  baseOpacity: number;
  /** The puff's turn in the view, so neighbouring clouds do not repeat one shape. */
  spin: number;
  /** 0: the soft dot; 1: the lumpy cloud (exhaust and smoke). */
  cell: 0 | 1;
}

/** Puffs one field draws at once; past it, the oldest give way to new ones. */
const CAPACITY = 3072;

/**
 * The puffs' two looks side by side: a soft round dot (sparks, dust, stink, breath) and a lumpy cloud, several soft
 * blobs in one (exhaust and smoke). A fixed scatter, the same on every run.
 */
function puffAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const blob = (x: number, y: number, r: number, alpha: number): void => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.45, `rgba(255,255,255,${alpha * 0.45})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  blob(64, 64, 64, 1);
  let seed = 7;
  const next = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 14; i += 1) {
    const angle = next() * Math.PI * 2, reach = next() * 30;
    blob(192 + Math.cos(angle) * reach, 64 + Math.sin(angle) * reach, 22 + next() * 16, 0.32 + next() * 0.3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const VERTEX = /* glsl */ `
attribute vec3 offset;
attribute vec4 tint;
attribute vec3 shape;
varying vec2 vUv;
varying vec4 vTint;
#include <common>
#include <fog_pars_vertex>
void main() {
  // shape: size, spin, atlas cell.
  vUv = vec2((uv.x + shape.z) * 0.5, uv.y);
  vTint = tint;
  float c = cos(shape.y), s = sin(shape.y);
  vec4 mvPosition = modelViewMatrix * vec4(offset, 1.0);
  mvPosition.xy += mat2(c, s, -s, c) * position.xy * shape.x;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vTint;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec4 texel = texture2D(map, vUv);
  gl_FragColor = vec4(vTint.rgb * texel.rgb, vTint.a * texel.a);
  if (gl_FragColor.a < 0.003) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/**
 * Pooled billboard particles for smoke, exhaust, stink and fumes, drawn together: one instanced draw however many
 * puffs are up, so the trucks can fill the dock with exhaust without a draw for every puff.
 */
export class PuffField {
  /** The live puffs, oldest first. */
  public readonly puffs: Puff[] = [];
  private readonly free: Puff[] = [];
  private readonly texture = puffAtlas();
  private readonly offsets = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
  private readonly tints = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
  private readonly shapes = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
  private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor(parent: THREE.Object3D) {
    const geometry = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('uv', quad.getAttribute('uv'));
    for (const [name, attribute] of [['offset', this.offsets], ['tint', this.tints], ['shape', this.shapes]] as const) {
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
    }
    geometry.instanceCount = 0;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    uniforms.map = { value: this.texture };
    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, fog: true, transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'puffs';
    // The puffs are anywhere in the scene, and drawn last among the see-through things.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.mesh.userData.keep = true;
    parent.add(this.mesh);
  }

  public emit(position: THREE.Vector3, options: {
    color: THREE.ColorRepresentation; size: number; life: number; velocity: THREE.Vector3;
    opacity?: number; grow?: number; spread?: number;
    /** `cloud`: a lumpy cloud rather than a soft dot, for exhaust and smoke. */
    look?: 'dot' | 'cloud';
  }): void {
    if (this.puffs.length >= CAPACITY) this.free.push(this.puffs.shift()!);
    const puff = this.free.pop() ?? {
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), color: new THREE.Color(),
      age: 0, life: 1, size: 1, grow: 1, baseOpacity: 1, spin: 0, cell: 0,
    };
    const spread = options.spread ?? 0.05;
    puff.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread));
    puff.velocity.copy(options.velocity);
    puff.color.set(options.color);
    puff.age = 0;
    puff.life = options.life;
    puff.size = options.size;
    puff.grow = options.grow ?? 1.2;
    puff.baseOpacity = options.opacity ?? 0.5;
    puff.spin = Math.random() * Math.PI * 2;
    puff.cell = options.look === 'cloud' ? 1 : 0;
    this.puffs.push(puff);
  }

  public update(dt: number): void {
    let live = 0;
    for (let i = 0; i < this.puffs.length; i += 1) {
      const puff = this.puffs[i];
      puff.age += dt;
      const t = puff.age / puff.life;
      if (t >= 1) { this.free.push(puff); continue; }
      puff.position.addScaledVector(puff.velocity, dt);
      puff.size *= 1 + (puff.grow - 1) * dt / puff.life;
      // Clouds turn slowly as they rise.
      if (puff.cell === 1) puff.spin += dt * 0.25;
      const opacity = puff.baseOpacity * Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t * 0.4);
      this.offsets.setXYZ(live, puff.position.x, puff.position.y, puff.position.z);
      this.tints.setXYZW(live, puff.color.r, puff.color.g, puff.color.b, opacity);
      this.shapes.setXYZ(live, puff.size, puff.spin, puff.cell);
      this.puffs[live] = puff;
      live += 1;
    }
    this.puffs.length = live;
    this.mesh.geometry.instanceCount = live;
    this.mesh.visible = live > 0;
    if (live > 0) {
      for (const attribute of [this.offsets, this.tints, this.shapes]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, live * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    }
  }

  /** Replays must not inherit the previous shift's smoke or stink. */
  public clear(): void {
    this.free.push(...this.puffs);
    this.puffs.length = 0;
    this.mesh.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  public dispose(): void {
    this.clear();
    this.free.length = 0;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}
