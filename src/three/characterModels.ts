import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { Character, CharacterSpec } from './characters';
import { ROCKETBOX_CAST } from './rocketboxCast.ts';
import { CLIP_SPANS, CLIP_SPEEDS, CREW_CLIPS_URL, ROCKETBOX_CLIPS, clipName, type ClipRole } from './rocketboxClips.ts';

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
  /** Materials that redden with the figure's skin (Shan); `skin` or `body` by default. */
  skinMaterial?: RegExp;
  /** Which set of Rocketbox clips (rocketboxClips.ts) moves this model; without one, the figure's poses always do. */
  clips?: 'male' | 'female';
}

/**
 * Models the game uses; the files live in public/models/characters/. The
 * crew are Rocketbox people, whose head material holds the face and whose
 * body material includes the clothes, so only the head reddens.
 */
export const CHARACTER_MODELS: CharacterModelEntry[] = ROCKETBOX_CAST.map(({ file, names, source }) => ({
  names, url: `/models/characters/${file}.glb`, skinMaterial: /head/i, clips: /Female/.test(source) ? 'female' : 'male',
}));

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
  /** An arm bone, which follows the figure while carrying even when clips move the rest of the body. */
  arm: boolean;
  /** A leg bone, which follows the figure on a stair flight even when clips move the rest of the body. */
  leg: boolean;
}

interface ModelRig {
  container: THREE.Group;
  /** The model itself (the glTF scene copy), under the container's facing turn. */
  model: THREE.Object3D;
  drives: Drive[];
  hands: { pivot: THREE.Object3D; bone: THREE.Bone }[];
  skin: { material: THREE.MeshStandardMaterial; base: THREE.Color }[];
  figureSkin: THREE.Color;
  /** The clip set the entry names, or none. */
  clipSet: 'male' | 'female' | null;
  /** Built once the clip library has loaded; null while it has not, or when the model cannot play it. */
  clips: ClipRig | null;
  /** True once a clip rig was tried, so a model that cannot play the clips is not retried every frame. */
  clipsTried: boolean;
}

/**
 * Animation clips playing on one model (the Rocketbox crew). The clips move
 * every bone; the figure's pose is blended over them by `figure`, so poses
 * without a clip (and a reduced-motion player) keep today's look exactly.
 */
interface ClipRig {
  mixer: THREE.AnimationMixer;
  female: boolean;
  actions: Map<string, THREE.AnimationAction>;
  role: ClipRole | null;
  /** How much the figure's pose overrides the clips: 1 is the figure entirely, as before clips. */
  figure: number;
  /** The same for the arms alone, raised for carrying and hand-held props. */
  arms: number;
  /** The same for the legs alone, raised on a stair flight where the figure plants its feet on the treads. */
  legs: number;
  /** The lift or put-down the crouch clips are playing, by the figure action's start time. */
  lift: { start: number } | null;
  /** Every bone the figure does not drive, with its rest rotation, to blend toward the figure's (unposed) look. */
  free: { bone: THREE.Object3D; rest: THREE.Quaternion }[];
  /** `Bip01`: a bone on most avatars, a plain node on a few (it is not always a skin joint). */
  root: THREE.Object3D;
  rootRest: THREE.Vector3;
  /** The game time the mixer last advanced to. */
  time: number | null;
  /** Smoothed ground speed in metres per second, measured from the character's own movement. */
  speed: number;
  last: THREE.Vector3 | null;
  /** 0-1 per character, so the crew do not breathe, idle and cheer in step. */
  phase: number;
}

/** Poses an imported model plays as a clip; every other pose (and seated, lying, squatting) stays the figure's. */
const POSE_CLIPS: Partial<Record<string, ClipRole>> = {
  cheer: 'cheer', cough: 'cough', phone: 'phone', dance: 'dance', sip: 'sip', shrug: 'shrug', announce: 'announce', crouch: 'crouch',
};
/** Seconds a lift or put-down takes on a model: down on the crouch-in clip, up on the crouch-out. */
export const LIFT_SECONDS = 0.84;
// Two long, lively standing idles; Rocketbox's "breathe" clips are nearly still and read as a statue.
const IDLE_ROLES: ClipRole[] = ['idle', 'idleAlt'];
const LOOPING = new Set(ROCKETBOX_CLIPS.filter((source) => source.loop).map((source) => source.role));
/** Seconds to cross-fade between clips, and the rate (per second) the figure's weight eases. */
const CROSS_FADE = 0.25;
const BLEND_RATE = 10;
const ROOT_BONE = 'Bip01';

let clipsWanted = false;
let clipLoad: Promise<void> | null = null;
let clipLibrary: Map<string, THREE.AnimationClip> | null = null;

/**
 * Turns the crew's animation clips on or off. On (GPU renderers), the clip
 * library downloads once and every Rocketbox model plays clips from then on;
 * off, every model follows its figure's joints as before. Models whose entry
 * names no clip set always follow their figures.
 */
export function useCharacterClips(enabled: boolean): Promise<void> {
  clipsWanted = enabled;
  if (!enabled) return Promise.resolve();
  clipLoad ??= (async () => {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(CREW_CLIPS_URL);
    clipLibrary = new Map(gltf.animations.map((clip) => [clip.name, clip]));
  })().catch((error: unknown) => {
    // Every model keeps following its figure.
    console.warn('Crew animation clips could not be loaded', error);
  });
  return clipLoad;
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
    if (item.rig && !item.rig.clips && !item.rig.clipsTried && clipsWanted && clipLibrary && item.rig.clipSet) {
      item.rig.clipsTried = true;
      item.rig.clips = buildClipRig(item.rig, item.spec.name);
    }
    if (item.rig) driveModel(item.character, item.rig);
  });
}

function detach(item: Tracked): void {
  if (item.rig?.clips) {
    item.rig.clips.mixer.stopAllAction();
    item.rig.clips.mixer.uncacheRoot(item.rig.model);
  }
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
export function attachModel(character: Character, source: THREE.Object3D, entry: Pick<CharacterModelEntry, 'rotationY' | 'height' | 'skinMaterial' | 'clips'>, figureSkin: number): ModelRig | null {
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
  const add = (pivot: THREE.Object3D, bone: THREE.Bone, arm = false, leg = false): void => {
    drives.push({ pivot, bone, rest: frameQuaternion(bone, container), arm, leg });
  };
  // Parents before children, so each bone is set after its parent. The body
  // pivot moves the container, so the hips need no drive of their own.
  add(character.head, head);
  add(character.leftArm, upperArm.neg, true);
  add(character.rightArm, upperArm.pos, true);
  add(character.leftForearm, forearm.neg, true);
  add(character.rightForearm, forearm.pos, true);
  add(character.leftHand, hand.neg, true);
  add(character.rightHand, hand.pos, true);
  add(character.leftLeg, thigh.neg, false, true);
  add(character.rightLeg, thigh.pos, false, true);
  add(character.leftShin, shin.neg, false, true);
  add(character.rightShin, shin.pos, false, true);

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
      if (standard.isMeshStandardMaterial && (entry.skinMaterial ?? /skin|body/i).test(material.name)) skin.push({ material: standard, base: standard.color.clone() });
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
  });

  character.root.add(container);
  setFigureVisible(character, false);
  const rig: ModelRig = {
    container, model, drives, skin,
    hands: [{ pivot: character.leftHand, bone: hand.neg }, { pivot: character.rightHand, bone: hand.pos }],
    figureSkin: new THREE.Color(figureSkin),
    clipSet: entry.clips ?? null,
    clips: null,
    clipsTried: false,
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
const boneFrame = new THREE.Quaternion();
const lookTurn = new THREE.Quaternion();
const handWorld = new THREE.Vector3();
const IDENTITY = new THREE.Quaternion();

/** A stable 0-1 value from a name, so each person idles a little out of step with the rest. */
function phaseOf(name: string): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i += 1) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

/**
 * Builds the clip player for a model once the library has loaded, if its
 * skeleton carries the clips' bones (the Rocketbox Biped); otherwise null, and
 * the model keeps following its figure.
 */
function buildClipRig(rig: ModelRig, name: string): ClipRig | null {
  if (!clipLibrary || !rig.clipSet) return null;
  const female = rig.clipSet === 'female';
  const sample = clipLibrary.get(clipName('idle', female));
  if (!sample) return null;
  // The mixer binds tracks to nodes by name, bone or not.
  const nodes = new Map<string, THREE.Object3D>();
  rig.model.traverse((object) => { if (object.name && !(object as THREE.Mesh).isMesh) nodes.set(object.name, object); });
  const targets = sample.tracks.map((track) => track.name.slice(0, track.name.lastIndexOf('.')));
  const found = targets.filter((target) => nodes.has(target)).length;
  const root = nodes.get(ROOT_BONE);
  if (!root || found < targets.length * 0.95) {
    console.warn(`Character model for ${name} lacks the clips' skeleton (${found}/${targets.length} bones); it follows its figure`);
    return null;
  }
  const driven = new Set<THREE.Object3D>(rig.drives.map((drive) => drive.bone));
  const animated = new Set(targets);
  const bones = [...nodes.values()].filter((node) => animated.has(node.name));
  return {
    mixer: new THREE.AnimationMixer(rig.model),
    female,
    actions: new Map(),
    role: null,
    // Starts as the figure and eases into the clips, so nobody snaps on arrival.
    figure: 1,
    arms: 1,
    legs: 1,
    lift: null,
    free: bones.filter((bone) => !driven.has(bone)).map((bone) => ({ bone, rest: bone.quaternion.clone() })),
    root,
    rootRest: root.position.clone(),
    time: null,
    speed: 0,
    last: null,
    phase: phaseOf(name),
  };
}

/**
 * Picks and advances the clip for what the character is doing, and eases how
 * much the figure's pose overrides it. Time is the game's: a paused game, or
 * a check that poses without advancing time, holds the clips still.
 */
function advanceClips(character: Character, rig: ModelRig, clips: ClipRig): void {
  const motion = character.motion;
  const now = motion?.time ?? clips.time ?? 0;
  const dt = clips.time === null ? 0 : THREE.MathUtils.clamp(now - clips.time, 0, 0.1);
  clips.time = now;
  const position = character.root.position;
  if (dt > 0) {
    if (clips.last) clips.speed += (Math.hypot(position.x - clips.last.x, position.z - clips.last.z) / dt - clips.speed) * Math.min(1, dt * 8);
    clips.last = (clips.last ?? new THREE.Vector3()).copy(position);
  }
  // A lift or put-down starts the crouch clips on their own clock: down for the first half, back up for
  // the second, a little longer than the figure's quick dip so the mocap reads. A throw keeps the figure's swing.
  const action = character.action;
  if (action && action.kind !== 'throw' && action.start !== clips.lift?.start && clipLibrary?.has(clipName('crouchIn', clips.female))) clips.lift = { start: action.start };
  const lift = clips.lift && now - clips.lift.start < LIFT_SECONDS && now >= clips.lift.start ? clips.lift : null;
  if (!lift) clips.lift = null;
  // The figure's pose wins whenever a clip would be wrong: reduced motion, a seat, a throw, a pose without a clip.
  let role: ClipRole | null = null;
  let figure = 0;
  if (!clipsWanted || !motion || motion.reduced || motion.seated || (action && !lift)) figure = 1;
  else if (lift) role = now - lift.start < LIFT_SECONDS / 2 ? 'crouchIn' : 'crouchOut';
  else if (motion.pose !== 'none') {
    role = POSE_CLIPS[motion.pose] ?? null;
    if (!role) figure = 1;
  }
  // The arms reach for the parcel from the figure while carrying, holding or lifting; the legs follow the
  // figure's steps (and their planted feet) on a stair flight.
  const arms = motion && (motion.carrying || motion.holding || lift) ? 1 : 0;
  const legs = motion?.stairs ? 1 : 0;
  // Underneath, the walk or idle keeps playing, so a pose ends back in motion.
  role ??= motion?.moving
    ? clips.speed > 2.4 ? 'run' : clips.speed < 0.9 ? 'walkSlow' : 'walk'
    : IDLE_ROLES[Math.floor(clips.phase * IDLE_ROLES.length)];
  const name = clipName(role, clips.female);
  const clip = clipLibrary?.get(name);
  if (clip && role !== clips.role) {
    let next = clips.actions.get(name);
    if (!next) {
      next = clips.mixer.clipAction(clip);
      next.setLoop(LOOPING.has(role) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = true;
      clips.actions.set(name, next);
    }
    next.reset();
    // A looping clip starts at this person's own point in it; a one-shot starts where its motion starts.
    next.time = LOOPING.has(role) ? (clips.phase * clip.duration) % clip.duration : CLIP_SPANS[name]?.[0] ?? 0;
    next.play();
    const current = clips.role ? clips.actions.get(clipName(clips.role, clips.female)) : undefined;
    if (current && current !== next) current.crossFadeTo(next, lift ? CROSS_FADE / 2 : CROSS_FADE, false);
    clips.role = role;
  }
  const playing = clip ? clips.actions.get(name) : undefined;
  const natural = CLIP_SPEEDS[name];
  if (playing && natural) {
    // World metres per clip unit: the model's fit to the figure's height and the character's own scale.
    const metres = natural * rig.model.scale.x * character.root.scale.x;
    playing.timeScale = THREE.MathUtils.clamp(clips.speed / metres, 0.5, 2);
  } else if (playing && clip && (role === 'crouchIn' || role === 'crouchOut')) {
    // Each half of the lift plays its clip's movement in half the lift's time.
    const span = CLIP_SPANS[name];
    playing.timeScale = (span ? span[1] - span[0] : clip.duration) / (LIFT_SECONDS / 2);
  } else if (playing) playing.timeScale = 1;
  clips.mixer.update(dt);
  const ease = clipsWanted ? Math.min(1, dt * BLEND_RATE) : 1;
  clips.figure += (figure - clips.figure) * ease;
  clips.arms += (arms - clips.arms) * ease;
  clips.legs += (legs - clips.legs) * ease;
}

/**
 * Poses the model: from its clips where it has them (the Rocketbox crew on
 * GPU renderers), with the figure's pose blended over them where a clip does
 * not fit; otherwise entirely from the figure's pivots, as before clips.
 */
function driveModel(character: Character, rig: ModelRig): void {
  const { body } = character;
  rig.container.visible = body.visible;
  const clips = rig.clips;
  if (clips) advanceClips(character, rig, clips);
  const figure = clips ? clips.figure : 1;
  const arms = clips ? Math.max(clips.figure, clips.arms) : 1;
  const legs = clips ? Math.max(clips.figure, clips.legs) : 1;
  // The body pivot's bob, crouch, lean and seat height move the whole model; a clip carries its own.
  rig.container.position.copy(body.position).multiplyScalar(figure);
  rig.container.quaternion.copy(IDENTITY).slerp(body.quaternion, figure);
  rig.container.scale.copy(body.scale);
  if (clips && figure > 0) {
    // Bones the figure has no pivot for (spine, clavicles, fingers) return toward rest as the figure takes over.
    for (const { bone, rest } of clips.free) bone.quaternion.slerp(rest, figure);
    clips.root.position.lerp(clips.rootRest, figure);
  }
  for (const { pivot, bone, rest, arm, leg } of rig.drives) {
    const weight = arm ? arms : leg ? legs : figure;
    if (weight <= 0) continue;
    // The pivot's rotation away from its rest (no rotation at all) within the body...
    frameQuaternion(pivot, body, pivotFrame);
    // ...applied to the bone's rest rotation, then expressed in its parent's frame.
    frameQuaternion(bone.parent ?? rig.container, rig.container, parentFrame).invert();
    parentFrame.multiply(pivotFrame.multiply(rest));
    if (weight >= 1) bone.quaternion.copy(parentFrame);
    else bone.quaternion.slerp(parentFrame, weight);
  }
  // With clips, the figure's head turn (Termite and Skanky look at their work) is added on top of the clip's head.
  if (clips && figure < 1 && !character.head.quaternion.equals(IDENTITY)) {
    const head = rig.drives[0].bone;
    lookTurn.copy(IDENTITY).slerp(character.head.quaternion, 1 - figure);
    frameQuaternion(head, rig.container, boneFrame).premultiply(lookTurn);
    frameQuaternion(head.parent ?? rig.container, rig.container, parentFrame).invert();
    head.quaternion.copy(parentFrame.multiply(boneFrame));
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
