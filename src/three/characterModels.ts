import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { Character, CharacterSpec } from './characters';

/**
 * Imported character models (glTF/GLB with a humanoid skeleton).
 *
 * Every person is still built as the procedural figure, whose pivot groups
 * (`leftArm`, `rightForearm`, `head`, ...) the walk cycle, carrying, story
 * scenes and gags pose directly. When a model is listed for a character's
 * name, the figure's meshes are hidden and the model's bones copy the pivots'
 * rotations each frame, so every existing pose drives the model unchanged.
 * Props held in a hand stay on the figure's hand pivot, which is moved onto
 * the model's wrist. Without a listed model nothing is loaded.
 *
 * See docs/character-models.md for making and adding a model.
 */
export interface CharacterModelEntry {
  /** Character names (as in each `CharacterSpec`) that use this model, e.g. `['TERMITE', 'TRMYTE']`. */
  names: string[];
  /** The .glb file, normally under `public/models/characters/`. */
  url: string;
  /** Extra turn about the vertical axis if the model does not face +Z (glTF's forward). */
  rotationY?: number;
  /** Standing height in metres before the character's own scale; 1.78 like the figure by default. */
  height?: number;
}

/** Models the game uses. Add an entry per finished model; the files live in public/models/characters/. */
export const CHARACTER_MODELS: CharacterModelEntry[] = [];

const FIGURE_HEIGHT = 1.78;

type Role = 'head' | 'upperArm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot';

/**
 * Bone names per role, lower-cased with any `mixamorig` prefix and every
 * non-alphanumeric character removed. Covers Mixamo, MakeHuman/MPFB (default
 * and game-engine skeletons) and Rocketbox/3ds Max Biped rigs. Sides are taken
 * from where each bone sits, not from its name.
 */
const BONE_NAMES: Record<Role, string[]> = {
  head: ['head', 'bip01head'],
  upperArm: ['leftarm', 'rightarm', 'upperarml', 'upperarmr', 'upperarm01l', 'upperarm01r', 'bip01lupperarm', 'bip01rupperarm'],
  forearm: ['leftforearm', 'rightforearm', 'lowerarml', 'lowerarmr', 'lowerarm01l', 'lowerarm01r', 'bip01lforearm', 'bip01rforearm'],
  hand: ['lefthand', 'righthand', 'handl', 'handr', 'wristl', 'wristr', 'bip01lhand', 'bip01rhand'],
  thigh: ['leftupleg', 'rightupleg', 'thighl', 'thighr', 'upperleg01l', 'upperleg01r', 'bip01lthigh', 'bip01rthigh'],
  shin: ['leftleg', 'rightleg', 'calfl', 'calfr', 'lowerleg01l', 'lowerleg01r', 'bip01lcalf', 'bip01rcalf'],
  foot: ['leftfoot', 'rightfoot', 'footl', 'footr', 'bip01lfoot', 'bip01rfoot'],
};

const normalizeBoneName = (name: string): string => name.toLowerCase().replace(/^mixamorig\d*/, '').replace(/[^a-z0-9]/g, '');

/** One model bone driven by one figure pivot. */
interface Drive {
  pivot: THREE.Object3D;
  bone: THREE.Bone;
  /** The bone's rest rotation relative to the character root, with the limbs hanging straight down. */
  rest: THREE.Quaternion;
}

interface ModelRig {
  container: THREE.Group;
  drives: Drive[];
  hands: { pivot: THREE.Object3D; bone: THREE.Bone }[];
  skin: { material: THREE.MeshStandardMaterial; base: THREE.Color }[];
  figureSkin: THREE.Color;
}

interface Tracked {
  character: Character;
  spec: CharacterSpec;
  rig: ModelRig | null;
  /** The entry the rig was built from, so a changed list rebuilds it. */
  entry: CharacterModelEntry | null;
}

const tracked = new WeakMap<THREE.Object3D, Tracked>();
let entries: CharacterModelEntry[] = CHARACTER_MODELS;
const loads = new Map<string, Promise<GLTF | null>>();
const loaded = new Map<string, GLTF>();
/** Models currently attached, so emptying the list still restores their figures. */
let attached = 0;

/** Called by `createCharacter`; cheap, and nothing is loaded unless a model is listed. */
export function trackCharacter(character: Character, spec: CharacterSpec): void {
  tracked.set(character.root, { character, spec, rig: null, entry: null });
  const entry = entryFor(spec.name);
  if (entry) void loadModel(entry.url);
}

/** Replaces the model list (for checks and rehearsal). Characters switch on the next sync. */
export function useCharacterModels(list: CharacterModelEntry[]): Promise<void> {
  entries = list;
  return Promise.all(list.map((entry) => loadModel(entry.url))).then(() => undefined);
}

function entryFor(name: string): CharacterModelEntry | null {
  return entries.find((entry) => entry.names.includes(name)) ?? null;
}

function loadModel(url: string): Promise<GLTF | null> {
  let load = loads.get(url);
  if (!load) {
    load = (async () => {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(url);
      loaded.set(url, gltf);
      return gltf;
    })().catch((error: unknown) => {
      // The procedural figure stays in place.
      console.warn(`Character model ${url} could not be loaded`, error);
      return null;
    });
    loads.set(url, load);
  }
  return load;
}

/**
 * Attaches loaded models and poses them from their figures. Call once per
 * frame, after all animation and before rendering `scene`.
 */
export function syncCharacterModels(scene: THREE.Object3D): void {
  if (entries.length === 0 && attached === 0) return;
  scene.traverseVisible((object) => {
    const item = tracked.get(object);
    if (!item) return;
    const entry = entryFor(item.spec.name);
    if (entry !== item.entry) {
      if (item.rig) detach(item);
      const gltf = entry ? loaded.get(entry.url) : undefined;
      if (entry && gltf) {
        item.rig = attachModel(item.character, gltf.scene, entry, item.spec.skin);
        item.entry = entry;
        if (item.rig) attached += 1;
      } else if (!entry) item.entry = null;
    }
    if (item.rig) driveModel(item.character, item.rig);
  });
}

function detach(item: Tracked): void {
  item.rig?.container.removeFromParent();
  setFigureVisible(item.character, true);
  attached -= 1;
  item.rig = null;
  item.entry = null;
}

function setFigureVisible(character: Character, visible: boolean): void {
  character.body.traverse((child) => {
    if (child.userData.figure === true) child.visible = visible;
  });
}

/**
 * Puts a copy of `source` (a glTF scene) on the character and hides the
 * procedural figure. Returns null, leaving the figure, if the skeleton lacks
 * the head, arms and legs.
 */
export function attachModel(character: Character, source: THREE.Object3D, entry: Pick<CharacterModelEntry, 'rotationY' | 'height'>, figureSkin: number): ModelRig | null {
  const model = cloneSkinned(source);
  // The container follows the figure's body (bob, lean, lying down); the
  // inner turn faces the model along the figure's +Z.
  const container = new THREE.Group();
  container.name = 'character-model';
  const facing = new THREE.Group();
  facing.rotation.y = entry.rotationY ?? 0;
  facing.add(model);
  container.add(facing);

  // Stand the model on the floor at the figure's height.
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const height = bounds.max.y - bounds.min.y;
  if (!(height > 0)) return null;
  const scale = (entry.height ?? FIGURE_HEIGHT) / height;
  model.scale.multiplyScalar(scale);
  model.position.y -= bounds.min.y * scale;

  const bones = new Map<string, THREE.Bone>();
  model.traverse((child) => {
    if ((child as THREE.Bone).isBone && !bones.has(normalizeBoneName(child.name))) bones.set(normalizeBoneName(child.name), child as THREE.Bone);
  });
  const find = (role: Role): THREE.Bone[] => BONE_NAMES[role].map((name) => bones.get(name)).filter((bone): bone is THREE.Bone => bone !== undefined);
  const head = find('head')[0];
  const pairs = (['upperArm', 'forearm', 'hand', 'thigh', 'shin', 'foot'] as const).map((role) => find(role).slice(0, 2));
  if (!head || pairs.some((pair) => pair.length < 2)) {
    console.warn(`Character model for ${character.root.name} lacks a recognised humanoid skeleton`);
    return null;
  }

  // Until it is attached the container is the world, so world positions are
  // in the figure's body frame. The figure's "left" pivots sit at negative x;
  // model bones are matched by side.
  container.updateMatrixWorld(true);
  const sideOf = (bone: THREE.Bone): number => Math.sign(bone.getWorldPosition(new THREE.Vector3()).x);
  const bySide = (pair: THREE.Bone[]): { neg: THREE.Bone; pos: THREE.Bone } => {
    const [a, b] = pair;
    return sideOf(a) < 0 || sideOf(b) > 0 ? { neg: a, pos: b } : { neg: b, pos: a };
  };
  const [upperArm, forearm, hand, thigh, shin, foot] = pairs.map(bySide);

  // Lower T- or A-posed limbs so the rest pose matches the figure's: limbs straight down.
  const down = new THREE.Vector3(0, -1, 0);
  for (const side of ['neg', 'pos'] as const) {
    for (const [bone, next] of [[upperArm[side], forearm[side]], [forearm[side], hand[side]], [thigh[side], shin[side]], [shin[side], foot[side]]]) {
      alignBone(container, bone, next, down);
    }
  }

  const drives: Drive[] = [];
  const add = (pivot: THREE.Object3D, bone: THREE.Bone): void => {
    drives.push({ pivot, bone, rest: frameQuaternion(bone, container) });
  };
  // Parents before children, so each bone is set after its parent. The body
  // pivot moves the container, so the hips need no drive of their own.
  add(character.head, head);
  add(character.leftArm, upperArm.neg);
  add(character.rightArm, upperArm.pos);
  add(character.leftForearm, forearm.neg);
  add(character.rightForearm, forearm.pos);
  add(character.leftHand, hand.neg);
  add(character.rightHand, hand.pos);
  add(character.leftLeg, thigh.neg);
  add(character.rightLeg, thigh.pos);
  add(character.leftShin, shin.neg);
  add(character.rightShin, shin.pos);

  // Each copy gets its own materials, so a gag or fade on one person leaves the rest alone.
  const skin: ModelRig['skin'] = [];
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    const cloneMaterial = (material: THREE.Material): THREE.Material => {
      const copy = material.clone();
      const standard = copy as THREE.MeshStandardMaterial;
      if (standard.isMeshStandardMaterial && /skin|body/i.test(material.name)) skin.push({ material: standard, base: standard.color.clone() });
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
  });

  character.root.add(container);
  setFigureVisible(character, false);
  const rig: ModelRig = {
    container, drives, skin,
    hands: [{ pivot: character.leftHand, bone: hand.neg }, { pivot: character.rightHand, bone: hand.pos }],
    figureSkin: new THREE.Color(figureSkin),
  };
  driveModel(character, rig);
  return rig;
}

/** Copies `source` with its own skeleton (SkeletonUtils.clone, kept here to avoid another import). */
function cloneSkinned(source: THREE.Object3D): THREE.Object3D {
  const sourceLookup = new Map<THREE.Object3D, THREE.Object3D>();
  const cloneLookup = new Map<THREE.Object3D, THREE.Object3D>();
  const clone = source.clone();
  const pair = (a: THREE.Object3D, b: THREE.Object3D): void => {
    sourceLookup.set(b, a);
    cloneLookup.set(a, b);
    for (let i = 0; i < a.children.length; i += 1) pair(a.children[i], b.children[i]);
  };
  pair(source, clone);
  clone.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const original = sourceLookup.get(node) as THREE.SkinnedMesh;
    mesh.skeleton = original.skeleton.clone();
    mesh.bindMatrix.copy(original.bindMatrix);
    mesh.skeleton.bones = original.skeleton.bones.map((bone) => cloneLookup.get(bone) as THREE.Bone);
    mesh.bind(mesh.skeleton, mesh.bindMatrix);
  });
  return clone;
}

/**
 * The object's rotation within `frame` (excluding the frame's own rotation),
 * from local rotations, so it is valid before world matrices update.
 */
function frameQuaternion(object: THREE.Object3D, frame: THREE.Object3D, target = new THREE.Quaternion()): THREE.Quaternion {
  target.identity();
  for (let node: THREE.Object3D | null = object; node && node !== frame; node = node.parent) target.premultiply(node.quaternion);
  return target;
}

/** Rotates `bone` so the direction to `next` points along `direction` (in the unattached container's frame). */
function alignBone(container: THREE.Object3D, bone: THREE.Bone, next: THREE.Bone, direction: THREE.Vector3): void {
  container.updateMatrixWorld(true);
  const from = bone.getWorldPosition(new THREE.Vector3());
  const current = next.getWorldPosition(new THREE.Vector3()).sub(from);
  if (current.lengthSq() < 1e-10) return;
  const turn = new THREE.Quaternion().setFromUnitVectors(current.normalize(), direction);
  const parentFrame = bone.parent ? frameQuaternion(bone.parent, container) : new THREE.Quaternion();
  const target = turn.multiply(frameQuaternion(bone, container));
  bone.quaternion.copy(parentFrame.invert().multiply(target));
}

const pivotFrame = new THREE.Quaternion();
const parentFrame = new THREE.Quaternion();
const handWorld = new THREE.Vector3();

/** Poses the model from the figure's pivots. */
function driveModel(character: Character, rig: ModelRig): void {
  const { body } = character;
  rig.container.visible = body.visible;
  // The body pivot's bob, crouch, lean and seat height move the whole model.
  rig.container.position.copy(body.position);
  rig.container.quaternion.copy(body.quaternion);
  rig.container.scale.copy(body.scale);
  for (const { pivot, bone, rest } of rig.drives) {
    // The pivot's rotation away from its rest (no rotation at all) within the body...
    frameQuaternion(pivot, body, pivotFrame);
    // ...applied to the bone's rest rotation, then expressed in its parent's frame.
    frameQuaternion(bone.parent ?? rig.container, rig.container, parentFrame).invert();
    bone.quaternion.copy(parentFrame.multiply(pivotFrame.multiply(rest)));
  }
  // Held props ride on the figure's hands; put those hands at the model's wrists.
  character.root.updateMatrixWorld(true);
  for (const { pivot, bone } of rig.hands) {
    if (!pivot.parent) continue;
    bone.getWorldPosition(handWorld);
    pivot.position.copy(pivot.parent.worldToLocal(handWorld));
    pivot.updateMatrixWorld(true);
  }
  // Skin reddening (Shan) carries over as a tint relative to the figure's normal skin.
  if (rig.skin.length) {
    const tint = character.skinMaterial.color;
    for (const { material, base } of rig.skin) {
      material.color.setRGB(
        base.r * tint.r / Math.max(1e-3, rig.figureSkin.r),
        base.g * tint.g / Math.max(1e-3, rig.figureSkin.g),
        base.b * tint.b / Math.max(1e-3, rig.figureSkin.b),
      );
    }
  }
}
