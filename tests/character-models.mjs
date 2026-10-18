import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { syncCharacterModels, trackCharacter, useCharacterModels } from '../src/three/characterModels.ts';
import { glbDataUrl, syntheticHumanoid, syntheticProp, toGlb } from './fixtures/humanoid.mjs';

// The figure's pivot layout from characters.ts (BODY), without its meshes or
// canvas labels, which need a browser. "Left" pivots sit at negative x.
function figure(name) {
  const root = new THREE.Group();
  root.name = name;
  const body = new THREE.Group();
  root.add(body);
  const pivot = (parent, x, y) => {
    const group = new THREE.Group();
    group.position.set(x, y, 0);
    parent.add(group);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshStandardMaterial());
    mesh.userData.figure = true;
    group.add(mesh);
    return group;
  };
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.2), new THREE.MeshStandardMaterial());
  torso.userData.figure = true;
  body.add(torso);
  const head = pivot(body, 0, 1.5);
  const leftArm = pivot(body, -0.205, 1.385);
  const rightArm = pivot(body, 0.205, 1.385);
  const leftForearm = pivot(leftArm, 0, -0.29);
  const rightForearm = pivot(rightArm, 0, -0.29);
  const leftHand = pivot(leftForearm, 0, -0.25);
  const rightHand = pivot(rightForearm, 0, -0.25);
  const leftLeg = pivot(body, -0.092, 0.9);
  const rightLeg = pivot(body, 0.092, 0.9);
  const leftShin = pivot(leftLeg, 0, -0.44);
  const rightShin = pivot(rightLeg, 0, -0.44);
  const skin = 0xe2b088;
  const character = {
    root, body, head, leftArm, rightArm, leftForearm, rightForearm, leftHand, rightHand,
    leftLeg, rightLeg, leftShin, rightShin,
    skinMaterial: new THREE.MeshStandardMaterial({ color: skin }), nameTag: new THREE.Sprite(), headHeight: 1.85, walkPhase: 0,
  };
  trackCharacter(character, { name, skin, shirt: 0, pants: 0, hair: 0, hairStyle: 'short' });
  return character;
}

const humanoidUrl = glbDataUrl(await toGlb(syntheticHumanoid()));
const bone = (character, name) => character.root.getObjectByName(`mixamorig${name}`);
const at = (object) => object.getWorldPosition(new THREE.Vector3());
const direction = (from, to) => at(to).sub(at(from)).normalize();
const figureDirection = (pivot) => new THREE.Vector3(0, -1, 0).applyQuaternion(pivot.getWorldQuaternion(new THREE.Quaternion()));
const figureHidden = (character) => {
  const shown = [];
  character.body.traverse((child) => { if (child.userData.figure && child.visible) shown.push(child); });
  return shown.length === 0;
};

function sync(scene) {
  syncCharacterModels(scene);
  scene.updateMatrixWorld(true);
}

test('a listed humanoid model replaces the figure and stands at its height', async () => {
  const scene = new THREE.Scene();
  const worker = figure('FIXTURE WORKER');
  scene.add(worker.root);
  sync(scene);
  assert.equal(worker.root.getObjectByName('character-model'), undefined, 'nothing loads without a listed model');
  await useCharacterModels([{ names: ['FIXTURE WORKER'], url: humanoidUrl }]);
  sync(scene);
  const model = worker.root.getObjectByName('character-model');
  assert.ok(model, 'the model is attached once loaded');
  assert.ok(figureHidden(worker), 'the procedural figure is hidden');
  let skinned = 0;
  model.traverse((child) => { if (child.isSkinnedMesh) skinned += 1; });
  assert.equal(skinned, 1);
  const bounds = new THREE.Box3().setFromObject(model);
  assert.ok(Math.abs(bounds.min.y) < 0.02, `the model stands on the floor (min y ${bounds.min.y})`);
  assert.ok(Math.abs(at(bone(worker, 'HeadTop_End')).y - 1.78) < 0.02, 'the model is scaled to the figure height');
});

test('figure poses drive the matching model bones on each side', async () => {
  await useCharacterModels([{ names: ['POSED'], url: humanoidUrl }]);
  const scene = new THREE.Scene();
  const worker = figure('POSED');
  scene.add(worker.root);
  sync(scene);
  // The T-pose is lowered to the figure's rest: limbs straight down.
  for (const [from, to] of [['RightArm', 'RightForeArm'], ['LeftForeArm', 'LeftHand'], ['LeftUpLeg', 'LeftLeg'], ['RightLeg', 'RightFoot']]) {
    assert.ok(direction(bone(worker, from), bone(worker, to)).y < -0.999, `${from} hangs straight down at rest`);
  }
  // The figure's left (negative x) arm raises forward and bends; its right leg steps.
  worker.leftArm.rotation.set(-0.9, 0, -0.2);
  worker.leftForearm.rotation.x = -1.1;
  worker.rightLeg.rotation.x = 0.5;
  worker.rightShin.rotation.x = 0.7;
  worker.head.rotation.y = 0.6;
  worker.root.rotation.y = 1.2;
  sync(scene);
  const close = (a, b, label) => assert.ok(a.dot(b) > 0.999, `${label}: model ${a.toArray()} vs figure ${b.toArray()}`);
  assert.ok(at(bone(worker, 'RightArm')).applyMatrix4(worker.root.matrixWorld.clone().invert()).x < 0, 'Mixamo "Right" sits on the figure\'s negative-x side');
  close(direction(bone(worker, 'RightArm'), bone(worker, 'RightForeArm')), figureDirection(worker.leftArm), 'upper arm');
  close(direction(bone(worker, 'RightForeArm'), bone(worker, 'RightHand')), figureDirection(worker.leftForearm), 'forearm');
  close(direction(bone(worker, 'LeftUpLeg'), bone(worker, 'LeftLeg')), figureDirection(worker.rightLeg), 'thigh');
  close(direction(bone(worker, 'LeftLeg'), bone(worker, 'LeftFoot')), figureDirection(worker.rightShin), 'shin');
  assert.ok(direction(bone(worker, 'LeftArm'), bone(worker, 'LeftForeArm')).y < -0.99, 'the other arm stays down');
  const facing = (object) => new THREE.Vector3(0, 0, 1).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
  close(facing(bone(worker, 'Head')), facing(worker.head), 'head turn');
});

test('the body pivot moves the whole model, and held props follow the model hands', async () => {
  await useCharacterModels([{ names: ['LYING'], url: humanoidUrl }]);
  const scene = new THREE.Scene();
  const worker = figure('LYING');
  scene.add(worker.root);
  const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), new THREE.MeshStandardMaterial());
  worker.rightHand.add(parcel);
  sync(scene);
  assert.ok(parcel.visible, 'held props stay visible');
  assert.ok(at(parcel).distanceTo(at(bone(worker, 'LeftHand'))) < 1e-4, 'a prop in the figure\'s right (positive-x) hand sits at the model\'s +x wrist');
  worker.body.rotation.x = -Math.PI / 2;
  worker.body.position.y = 0.12;
  sync(scene);
  const head = at(bone(worker, 'Head'));
  assert.ok(head.y < 0.25 && Math.abs(head.z) > 1.4, `lying down lays the model flat (head at ${head.toArray()})`);
  assert.ok(at(parcel).distanceTo(at(bone(worker, 'LeftHand'))) < 1e-4, 'the prop still follows the wrist');
});

test('skin reddening carries over, and each copy owns its materials', async () => {
  await useCharacterModels([{ names: ['SHAN', 'COPY'], url: humanoidUrl }]);
  const scene = new THREE.Scene();
  const shan = figure('SHAN');
  const copy = figure('COPY');
  scene.add(shan.root, copy.root);
  sync(scene);
  const skinOf = (character) => {
    let material;
    character.root.getObjectByName('character-model').traverse((child) => { if (child.isSkinnedMesh) material = child.material; });
    return material;
  };
  assert.notEqual(skinOf(shan), skinOf(copy));
  const calm = skinOf(shan).color.clone();
  shan.skinMaterial.color.set(0xff3020);
  sync(scene);
  assert.ok(skinOf(shan).color.g < calm.g * 0.5, 'the model skin reddens with the figure');
  assert.ok(skinOf(copy).color.equals(calm), 'other copies are untouched');
});

test('a skin-material pattern limits reddening to matching materials', async () => {
  const headUrl = glbDataUrl(await toGlb(syntheticHumanoid({ skinName: 'm018_head' })));
  await useCharacterModels([{ names: ['HEAD ONLY'], url: headUrl, skinMaterial: /head/i }, { names: ['NO MATCH'], url: humanoidUrl, skinMaterial: /head/i }]);
  const scene = new THREE.Scene();
  const head = figure('HEAD ONLY');
  const body = figure('NO MATCH');
  scene.add(head.root, body.root);
  sync(scene);
  const material = (character) => {
    let found;
    character.root.getObjectByName('character-model').traverse((child) => { if (child.isSkinnedMesh) found = child.material; });
    return found;
  };
  const calm = [material(head).color.clone(), material(body).color.clone()];
  for (const character of [head, body]) character.skinMaterial.color.set(0xff3020);
  sync(scene);
  assert.ok(material(head).color.g < calm[0].g * 0.5, 'the head material reddens');
  assert.ok(material(body).color.equals(calm[1]), 'a material outside the pattern keeps its colour');
});

test('unusable models leave the procedural figure in place', async () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const propUrl = glbDataUrl(await toGlb(syntheticProp()));
    await useCharacterModels([{ names: ['NO SKELETON'], url: propUrl }, { names: ['MISSING'], url: 'data:model/gltf-binary;base64,AAAA' }]);
    const scene = new THREE.Scene();
    const plain = figure('NO SKELETON');
    const missing = figure('MISSING');
    scene.add(plain.root, missing.root);
    sync(scene);
    for (const character of [plain, missing]) {
      assert.equal(character.root.getObjectByName('character-model'), undefined);
      character.body.traverse((child) => { if (child.userData.figure) assert.ok(child.visible); });
    }
    assert.ok(warnings.some((line) => line.includes('humanoid skeleton')));
    assert.ok(warnings.some((line) => line.includes('could not be loaded')));
  } finally {
    console.warn = warn;
  }
});

test('removing a model from the list brings the figure back', async () => {
  await useCharacterModels([{ names: ['SWAP'], url: humanoidUrl }]);
  const scene = new THREE.Scene();
  const worker = figure('SWAP');
  scene.add(worker.root);
  sync(scene);
  assert.ok(worker.root.getObjectByName('character-model'));
  await useCharacterModels([{ names: ['SOMEONE ELSE'], url: humanoidUrl }]);
  sync(scene);
  assert.equal(worker.root.getObjectByName('character-model'), undefined);
  worker.body.traverse((child) => { if (child.userData.figure) assert.ok(child.visible); });
});
