// A synthetic rigged humanoid for the imported-model checks: a T-posed
// skeleton with Mixamo bone names and one box per bone, built in code so no
// third-party model is committed. Faces +Z like any glTF character.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// Three.js's file loader reports progress with the browser's ProgressEvent, which Node lacks.
globalThis.ProgressEvent ??= class extends Event {
  constructor(type, init = {}) {
    super(type);
    Object.assign(this, init);
  }
};

// [name, parent, world position] in metres; "Left" is the character's own left (+x).
const JOINTS = [
  ['Hips', null, [0, 0.95, 0]],
  ['Spine', 'Hips', [0, 1.1, 0]],
  ['Spine1', 'Spine', [0, 1.28, 0]],
  ['Neck', 'Spine1', [0, 1.48, 0]],
  ['Head', 'Neck', [0, 1.58, 0]],
  ['HeadTop_End', 'Head', [0, 1.78, 0]],
];
for (const [side, x] of [['Left', 1], ['Right', -1]]) {
  JOINTS.push(
    [`${side}Shoulder`, 'Spine1', [x * 0.08, 1.4, 0]],
    [`${side}Arm`, `${side}Shoulder`, [x * 0.19, 1.4, 0]],
    [`${side}ForeArm`, `${side}Arm`, [x * 0.47, 1.4, 0]],
    [`${side}Hand`, `${side}ForeArm`, [x * 0.72, 1.4, 0]],
    [`${side}HandMiddle4`, `${side}Hand`, [x * 0.9, 1.4, 0]],
    [`${side}UpLeg`, 'Hips', [x * 0.1, 0.92, 0]],
    [`${side}Leg`, `${side}UpLeg`, [x * 0.1, 0.5, 0]],
    [`${side}Foot`, `${side}Leg`, [x * 0.1, 0.08, 0]],
    [`${side}ToeBase`, `${side}Foot`, [x * 0.1, 0.02, 0.14]],
  );
}

/** The rigged humanoid scene. `prefix` is the bone-name prefix (Mixamo's `mixamorig:`). */
export function syntheticHumanoid({ prefix = 'mixamorig:', skinName = 'Skin' } = {}) {
  const bones = new Map();
  const world = new Map();
  for (const [name, parent, position] of JOINTS) {
    const bone = new THREE.Bone();
    bone.name = `${prefix}${name}`;
    const at = new THREE.Vector3(...position);
    world.set(name, at);
    if (parent) {
      bone.position.copy(at).sub(world.get(parent));
      bones.get(parent).add(bone);
    } else bone.position.copy(at);
    bones.set(name, bone);
  }
  const list = [...bones.values()];
  // One box from each joint to its child, skinned wholly to that joint.
  const parts = [];
  for (const [name, parent] of JOINTS) {
    if (!parent || name.endsWith('_End') || name.endsWith('Middle4') || name.endsWith('ToeBase')) continue;
    const from = world.get(parent);
    const to = world.get(name);
    const length = from.distanceTo(to);
    if (length < 1e-3) continue;
    const box = new THREE.BoxGeometry(0.08, length, 0.08).toNonIndexed();
    box.translate(0, length / 2, 0);
    box.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
    box.translate(from.x, from.y, from.z);
    const index = list.indexOf(bones.get(parent));
    const count = box.attributes.position.count;
    box.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0).map((_, i) => (i % 4 === 0 ? index : 0)), 4));
    box.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(count * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    parts.push(box);
  }
  // Feet and a head block reach the floor and the top of the head.
  for (const [name, from, to] of [['Head', world.get('Head'), world.get('HeadTop_End')], ['LeftFoot', world.get('LeftFoot'), new THREE.Vector3(0.1, 0, 0.14)], ['RightFoot', world.get('RightFoot'), new THREE.Vector3(-0.1, 0, 0.14)]]) {
    const box = new THREE.BoxGeometry(0.12, from.distanceTo(to), 0.12).toNonIndexed();
    box.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    const index = list.indexOf(bones.get(name));
    const count = box.attributes.position.count;
    box.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0).map((_, i) => (i % 4 === 0 ? index : 0)), 4));
    box.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(count * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    parts.push(box);
  }
  const geometry = mergeAll(parts);
  const material = new THREE.MeshStandardMaterial({ color: 0xc89a78, name: skinName, roughness: 0.7 });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'Body';
  const scene = new THREE.Group();
  scene.name = 'Armature';
  scene.add(bones.get('Hips'), mesh);
  scene.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  return scene;
}

/** A model without a humanoid skeleton. */
export function syntheticProp() {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  return scene;
}

function mergeAll(parts) {
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
    const first = parts[0].attributes[name];
    const array = new first.array.constructor(parts.reduce((sum, part) => sum + part.attributes[name].array.length, 0));
    let offset = 0;
    for (const part of parts) {
      array.set(part.attributes[name].array, offset);
      offset += part.attributes[name].array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, first.itemSize));
  }
  return merged;
}

/** The scene as GLB bytes, through Three.js's own exporter. */
export async function toGlb(scene) {
  // The exporter reads its output Blob with FileReader, which Node lacks.
  globalThis.FileReader ??= class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(result).toString('base64')}`;
        this.onloadend?.();
      });
    }
  };
  const result = await new GLTFExporter().parseAsync(scene, { binary: true });
  return Buffer.from(result);
}

export const glbDataUrl = (bytes) => `data:model/gltf-binary;base64,${bytes.toString('base64')}`;
