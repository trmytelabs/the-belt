import * as THREE from 'three';

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
  | 'barrel' | 'wet-floor-sign' | 'fire-extinguisher' | 'hand-truck' | 'tool-chest' | 'storage-cart' | 'trash-can';

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
};

export const PROP_MODEL_URL = (id: PropId): string => `/models/props/${id}.glb`;

const loads = new Map<PropId, Promise<THREE.Object3D | null>>();

function loadProp(id: PropId): Promise<THREE.Object3D | null> {
  let load = loads.get(id);
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
    loads.set(id, load);
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
