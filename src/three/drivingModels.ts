import * as THREE from 'three';
import { disposeObject3D } from './resources';
import { mergeStatic } from './merge';

export const DRIVING_ASSETS = {
  shop: 'city/building-a', apartments: 'city/building-d', offices: 'city/building-g',
  tower: 'city/building-skyscraper-a', lamp: 'roads/light-curved',
  signal: 'roads/traffic-light', truck: 'cars/delivery',
} as const;
type Asset = keyof typeof DRIVING_ASSETS;

/** One road owns its templates and clones, including late asynchronous loads. */
export class DrivingModels {
  private readonly templates = new THREE.Group();
  private readonly loads = new Map<Asset, Promise<THREE.Object3D | null>>();
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.templates.visible = false; this.templates.userData.keep = true;
    scene.add(this.templates);
  }

  public async place(slot: THREE.Object3D, id: Asset, size: { x?: number; y?: number; z?: number },
    fallback: THREE.Object3D[] = [], rotation = 0): Promise<boolean> {
    slot.userData.keep = true;
    let pending = this.loads.get(id);
    if (!pending) {
      pending = import('three/examples/jsm/loaders/GLTFLoader.js').then(async ({ GLTFLoader }) => {
        const { scene } = await new GLTFLoader().loadAsync(`/models/driving/${DRIVING_ASSETS[id]}.glb`);
        if (this.disposed) { disposeObject3D(scene); return null; }
        this.templates.add(scene);
        return scene;
      }).catch(error => { console.warn(`Driving model ${id} unavailable; keeping its fallback`, error); return null; });
      this.loads.set(id, pending);
    }
    const source = await pending;
    if (!source || this.disposed) return false;
    const oriented = new THREE.Group();
    const asset = source.clone(true);
    asset.rotation.y = rotation; oriented.add(asset); oriented.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(oriented), extent = bounds.getSize(new THREE.Vector3());
    const first = (['x', 'y', 'z'] as const).find(axis => size[axis] !== undefined);
    const scale = first ? size[first]! / extent[first] : 1;
    const fit = new THREE.Vector3(size.x ? size.x / extent.x : scale, size.y ? size.y / extent.y : scale, size.z ? size.z / extent.z : scale);
    oriented.scale.copy(fit);
    const centre = bounds.getCenter(new THREE.Vector3());
    oriented.position.set(-centre.x * fit.x, -bounds.min.y * fit.y, -centre.z * fit.z);
    oriented.name = `driving-model-${id}`;
    // Clones share template geometry and textures; all belong to this scene.
    oriented.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const prepare = (source: THREE.Material): THREE.Material => {
        const material = source.clone() as THREE.MeshStandardMaterial;
        material.roughness = 0.8; material.metalness = 0.08;
        return material;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(prepare) : prepare(mesh.material);
    });
    mergeStatic(oriented);
    for (const object of fallback) object.visible = false;
    slot.add(oriented); slot.userData.modelReady = true;
    return true;
  }

  /** Call before disposing the scene so an unfinished fetch cannot reattach art. */
  public dispose(): void { this.disposed = true; this.loads.clear(); }
}
