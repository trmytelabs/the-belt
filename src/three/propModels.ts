import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeStatic } from './merge';

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
