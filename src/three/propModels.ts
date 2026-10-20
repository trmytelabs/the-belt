import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeStatic } from './merge.ts';

const loads = new Map<string, Promise<GLTF>>();
function load(url: string): Promise<GLTF> {
  let promise = loads.get(url);
  if (!promise) {
    promise = import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url));
    loads.set(url, promise);
  }
  return promise;
}

/** Keep the existing car root, lights and driving paths while upgrading its art. */
export async function upgradeCar(car: THREE.Group, color: number): Promise<boolean> {
  car.userData.keep = true;
  const variant = [0x7d4d9c, 0xd8d4c8, 0x6d5534, 0x7a7a70].includes(color) ? 'sedan-wide' : 'sedan';
  try {
    const source = await load(`/models/vehicles/${variant}.glb`);
    const model = source.scene.clone(true);
    model.name = 'vehicle-model'; model.userData.keep = true;
    model.rotation.y = Math.PI / 2; // The source nose is +Z; the story drives along +X.
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    model.scale.set(1.8 / size.z, 1.5 / size.y, 4.2 / size.x);
    model.position.y = -bounds.min.y * model.scale.y;
    const headlight = car.children.find(child => child.name === 'headlight') as THREE.Mesh | undefined;
    const headMaterial = headlight?.material as THREE.MeshStandardMaterial | undefined;
    model.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      const prepare = (sourceMaterial: THREE.Material): THREE.Material => {
        if (/headlights/i.test(sourceMaterial.name) && headMaterial) {
          mesh.name = 'model-headlight'; return headMaterial;
        }
        const material = sourceMaterial.clone() as THREE.MeshStandardMaterial;
        if (material.isMeshStandardMaterial) {
          material.roughness = 0.65; material.metalness = 0.12;
          if (/blue|red|paint/i.test(material.name)) material.color.setHex(color);
          if (/windows/i.test(material.name)) { material.transparent = true; material.opacity = 0.3; material.depthWrite = false; }
          if (/taillights/i.test(material.name)) { material.emissive.setHex(0xa81712); material.emissiveIntensity = 0.8; }
        }
        return material;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(prepare) : prepare(mesh.material);
    });
    mergeStatic(model, object => object.name === 'model-headlight');
    // Retain hidden light controls: Brian's authored blink drives the imported lights too.
    for (const child of car.children) child.visible = false;
    car.add(model);
    return true;
  } catch (error) {
    console.warn('Vehicle model unavailable; keeping the procedural car', error);
    return false;
  }
}

/** The authored devil root still emerges, reaches Ben, drags him and sinks. */
export class DevilModel {
  public readonly ready: Promise<boolean>;
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;

  constructor(root: THREE.Group, sizeLimit = { height:2.8, width:2.4 }) {
    this.ready = load('/models/creatures/devil.glb').then(gltf => {
      const asset = clone(gltf.scene);
      const model = new THREE.Group();
      model.name = 'devil-model'; model.userData.keep = true;
      model.add(asset);
      asset.getObjectByName('Trident')?.removeFromParent();
      this.mixer = new THREE.AnimationMixer(asset);
      for (const clip of gltf.animations) this.actions.set(clip.name.split('|').at(-1)!, this.mixer.clipAction(clip));
      this.current = this.actions.get('Idle') ?? null;
      this.current?.play(); this.mixer.update(0);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
      const scale = Math.min(sizeLimit.height / size.y, sizeLimit.width / size.x);
      model.scale.setScalar(scale); model.position.y = -bounds.min.y * scale;
      model.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        const prepare = (source: THREE.Material): THREE.Material => {
          const material = source.clone() as THREE.MeshStandardMaterial;
          if (material.isMeshStandardMaterial) {
            material.roughness = 0.8; material.metalness = 0;
            if (material.name === 'Demon_Main') material.color.setHex(0x8550ad);
          }
          return material;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(prepare) : prepare(mesh.material);
      });
      for (const child of root.children) child.visible = false;
      root.add(model);
      return true;
    }).catch(error => { console.warn('Devil model unavailable; keeping the procedural devil', error); return false; });
  }

  public update(stage: string, dt: number, still = false): void {
    if (!this.mixer) return;
    const next = this.actions.get(still ? 'Idle' : stage === 'drag' ? 'Walk' : stage === 'demon' ? 'Punch' : 'Idle');
    if (next && next !== this.current) {
      this.current?.fadeOut(0.15); next.reset().fadeIn(0.15).play(); this.current = next;
    }
    this.mixer.update(still ? 0 : dt);
  }

  public reset(): void {
    this.mixer?.stopAllAction();
    this.current = this.actions.get('Idle') ?? null;
    this.current?.reset().play(); this.mixer?.update(0);
  }
}

/**
 * Realistic props: Poly Haven models (CC0) converted by tools/polyhaven into
 * small GLBs in public/models/props/.
 *
 * Every prop that has a model is still built in code first. `placeProp` loads
 * the model once, puts a copy in the prop's place and then hides the
 * code-built version, so a slow or failed download leaves the old prop in
 * place. Callers skip it on software renderers (no GPU, as on CI runners),
 * which keep the code-built props merged into few draw calls and download
 * nothing.
 *
 * See docs/prop-models.md for the sources, licence and converting.
 */
export type PropId =
  | 'wall-lamp' | 'office-desk' | 'school-chair' | 'metal-stool'
  | 'barrel' | 'wet-floor-sign' | 'fire-extinguisher' | 'hand-truck' | 'tool-chest' | 'storage-cart' | 'trash-can'
  | 'cardboard-box' | 'metal-rack' | 'chainlink-panel' | 'chainlink-post' | 'street-lamp'
  | 'sofa' | 'armchair' | 'coffee-table' | 'bookshelf' | 'wall-clock' | 'side-table';

export interface PropModelSource {
  /** The Poly Haven asset id; its 1k glTF is the conversion source. */
  polyHaven: string;
  /** Longest edge, in pixels, of each texture in the converted file. */
  textureSize: number;
  /** Normal maps are kept unless this is false. */
  normalMaps?: boolean;
  /** Only nodes whose names match are kept (the asset may hold several variants). */
  nodes?: RegExp;
}

/** Props the game uses; each converts to `public/models/props/<id>.glb`. */
export const PROP_MODELS: Record<PropId, PropModelSource> = {
  'wall-lamp': { polyHaven: 'industrial_wall_lamp', textureSize: 256 },
  'office-desk': { polyHaven: 'metal_office_desk', textureSize: 512 },
  'school-chair': { polyHaven: 'SchoolChair_01', textureSize: 512 },
  'metal-stool': { polyHaven: 'metal_stool_02', textureSize: 512 },
  barrel: { polyHaven: 'Barrel_02', textureSize: 512 },
  'wet-floor-sign': { polyHaven: 'WetFloorSign_01', textureSize: 512 },
  'fire-extinguisher': { polyHaven: 'korean_fire_extinguisher_01', textureSize: 256 },
  'hand-truck': { polyHaven: 'hand_truck', textureSize: 512 },
  'tool-chest': { polyHaven: 'metal_tool_chest', textureSize: 512 },
  'storage-cart': { polyHaven: 'industrial_storage_cart', textureSize: 512 },
  // The asset holds a clean and a rusty bin; the clean one, its handles and lid are kept.
  'trash-can': { polyHaven: 'metal_trash_can', textureSize: 512, nodes: /^metal_trash_can(_handle_left|_handle_right|_lid)?$/ },
  // A worn shipping carton: the depot's bulk stock, Ralph's load, the receiving cargo and plain parcels.
  'cardboard-box': { polyHaven: 'cardboard_box_01', textureSize: 512 },
  'metal-rack': { polyHaven: 'worn_metal_rack', textureSize: 512 },
  // The fence kit's two-metre panel and its post; the lot's run is assembled from copies.
  'chainlink-panel': { polyHaven: 'modular_chainlink_fence', textureSize: 512, nodes: /^modular_chainlink_fence_double$/ },
  'chainlink-post': { polyHaven: 'modular_chainlink_fence', textureSize: 256, nodes: /^modular_chainlink_fence_post$/ },
  'street-lamp': { polyHaven: 'street_lamp_01', textureSize: 512 },
  sofa: { polyHaven: 'sofa_02', textureSize: 512 },
  armchair: { polyHaven: 'modern_arm_chair_01', textureSize: 512 },
  'coffee-table': { polyHaven: 'modern_coffee_table_01', textureSize: 512 },
  bookshelf: { polyHaven: 'wooden_bookshelf_worn', textureSize: 512 },
  'wall-clock': { polyHaven: 'wall_clock', textureSize: 256 },
  'side-table': { polyHaven: 'side_table_01', textureSize: 512 },
};

export const PROP_MODEL_URL = (id: PropId): string => `/models/props/${id}.glb`;

const propLoads = new Map<PropId, Promise<THREE.Object3D | null>>();

function loadProp(id: PropId): Promise<THREE.Object3D | null> {
  let load = propLoads.get(id);
  if (!load) {
    load = (async () => {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(PROP_MODEL_URL(id));
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) child.castShadow = child.receiveShadow = true;
      });
      return gltf.scene;
    })().catch((error: unknown) => {
      // The code-built prop stays in place.
      console.warn(`Prop model ${id} could not be loaded`, error);
      return null;
    });
    propLoads.set(id, load);
  }
  return load;
}

export interface PropPlacement {
  /** The code-built prop, hidden once the model is in place. */
  fallback?: THREE.Object3D;
  /**
   * Target size in metres along the model's own axes (x: width, y: height,
   * z: depth). An axis without a target takes the first given axis's scale;
   * without any the model keeps its real-world size.
   */
  size?: { x?: number; y?: number; z?: number };
}

/**
 * Puts a copy of model `id` in `slot`, standing on the slot's origin and
 * centred on it, facing the slot's +Z. Resolves true once it is shown.
 */
export function placeProp(slot: THREE.Object3D, id: PropId, placement: PropPlacement = {}): Promise<boolean> {
  // Neither may be merged into static geometry: one appears and the other hides later.
  slot.userData.keep = true;
  if (placement.fallback) placement.fallback.userData.keep = true;
  return loadProp(id).then((source) => {
    if (!source) return false;
    const model = source.clone();
    model.name = `prop-${id}`;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = new THREE.Vector3(1, 1, 1);
    const target = placement.size ?? {};
    const axes = (['x', 'y', 'z'] as const).filter((axis) => target[axis] !== undefined);
    for (const axis of axes) scale[axis] = target[axis]! / Math.max(size[axis], 1e-6);
    for (const axis of ['x', 'y', 'z'] as const) if (axes.length && !axes.includes(axis)) scale[axis] = scale[axes[0]];
    model.scale.multiply(scale);
    const centre = bounds.getCenter(new THREE.Vector3());
    model.position.set(-centre.x * scale.x, -bounds.min.y * scale.y, -centre.z * scale.z);
    slot.add(model);
    if (placement.fallback) placement.fallback.visible = false;
    return true;
  });
}
