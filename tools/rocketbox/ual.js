// Retargets Quaternius Universal Animation Library clips (CC0) onto the crew's
// Rocketbox Biped skeleton. The pack is not fetched from here: it is a manual
// download from quaternius.itch.io, and the dev server serves the two GLBs
// named by the UAL_GLB and UAL_RM_GLB environment variables at /__ual/*.
// Each clip is sampled at 30 fps; every mapped bone takes the source bone's
// world rotation away from the source's reference pose, re-expressed in the
// crew's frame, on top of the crew bone's own reference rotation. The hips
// follow the source's, scaled by leg length. See docs/character-models.md.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { UAL_CLIPS, clipName } from '../../src/three/rocketboxClips.ts';

const FPS = 30;
const ROOT = 'Bip01';

/** Source (UE-style) bone name -> crew (Biped) bone name. */
export const UAL_TO_BIPED = (() => {
  const map = { pelvis: 'Bip01_Pelvis', spine_01: 'Bip01_Spine', spine_02: 'Bip01_Spine1', spine_03: 'Bip01_Spine2', neck_01: 'Bip01_Neck', Head: 'Bip01_Head' };
  for (const [s, S] of [['l', 'L'], ['r', 'R']]) {
    Object.assign(map, {
      [`clavicle_${s}`]: `Bip01_${S}_Clavicle`, [`upperarm_${s}`]: `Bip01_${S}_UpperArm`, [`lowerarm_${s}`]: `Bip01_${S}_Forearm`, [`hand_${s}`]: `Bip01_${S}_Hand`,
      [`thigh_${s}`]: `Bip01_${S}_Thigh`, [`calf_${s}`]: `Bip01_${S}_Calf`, [`foot_${s}`]: `Bip01_${S}_Foot`, [`ball_${s}`]: `Bip01_${S}_Toe0`,
    });
    for (const [finger, n] of [['thumb', 0], ['index', 1], ['middle', 2], ['ring', 3], ['pinky', 4]]) {
      for (const k of [1, 2, 3]) map[`${finger}_0${k}_${s}`] = `Bip01_${S}_Finger${n}${k === 1 ? '' : k - 1}`;
    }
  }
  return map;
})();

const loadGltf = (url) => new GLTFLoader().loadAsync(url);

/** Bones (or plain nodes) by name. */
function bonesOf(root) {
  const bones = new Map();
  root.traverse((object) => { if (object.name && !bones.has(object.name)) bones.set(object.name, object); });
  return bones;
}

const worldQuaternion = (object) => object.getWorldQuaternion(new THREE.Quaternion());
const worldPosition = (object) => object.getWorldPosition(new THREE.Vector3());

/**
 * A skeleton's body frame from its reference pose: x across the shoulders (to the
 * character's left), y up the spine, z forward. Two skeletons' frames give the
 * rotation that carries one's world motion into the other's.
 */
function bodyFrame(bones, names) {
  const left = worldPosition(bones.get(names.leftArm)), right = worldPosition(bones.get(names.rightArm));
  const hips = worldPosition(bones.get(names.hips)), head = worldPosition(bones.get(names.head));
  const x = left.clone().sub(right).normalize();
  const up = head.clone().sub(hips);
  const z = new THREE.Vector3().crossVectors(x, up).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
const SOURCE_FRAME = { leftArm: 'upperarm_l', rightArm: 'upperarm_r', hips: 'pelvis', head: 'Head' };
const TARGET_FRAME = { leftArm: 'Bip01_L_UpperArm', rightArm: 'Bip01_R_UpperArm', hips: 'Bip01_Pelvis', head: 'Bip01_Head' };

/** The elevation of the left upper arm, in degrees above horizontal: about 0 for a T-pose, about -45 for an A-pose. */
function armElevation(bones, upper, lower) {
  const d = worldPosition(bones.get(lower)).sub(worldPosition(bones.get(upper))).normalize();
  return THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)));
}

/**
 * Poses a source scene at `time` in `clip` (or its bind pose with no clip). One mixer per scene stays
 * bound to the clip: stopping a mixer restores the bones' original state, which would undo the pose
 * before it is read. Clips play once and hold their last frame, so sampling a clip's end does not wrap
 * to its start.
 */
function poseSource(scene, clip, time) {
  const mixer = (scene.userData.mixer ??= new THREE.AnimationMixer(scene));
  if (scene.userData.clip !== clip) {
    mixer.stopAllAction();
    scene.userData.clip = clip;
    scene.traverse((object) => { if (object.userData.rest) { object.position.copy(object.userData.rest.p); object.quaternion.copy(object.userData.rest.q); object.scale.copy(object.userData.rest.s); } });
    if (clip) {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    }
  }
  if (clip) mixer.setTime(Math.min(time, clip.duration - 1e-4));
  scene.updateMatrixWorld(true);
}
function rememberRest(scene) {
  scene.traverse((object) => { object.userData.rest = { p: object.position.clone(), q: object.quaternion.clone(), s: object.scale.clone() }; });
}

/**
 * Raises the crew's arms from their A-pose bind (upper arms about 44 degrees down)
 * to the pack's T-pose: each upper arm, forearm and hand is turned to point straight
 * out to its side, so both skeletons' reference poses match. Returns nothing; the
 * caller restores the bones' local rotations afterwards.
 */
function tPose(bones, frame) {
  const left = new THREE.Vector3(1, 0, 0).applyQuaternion(frame);
  for (const [side, out] of [['L', left], ['R', left.clone().negate()]]) {
    for (const [bone, next] of [['UpperArm', 'Forearm'], ['Forearm', 'Hand'], ['Hand', 'Finger2']]) {
      const joint = bones.get(`Bip01_${side}_${bone}`), child = bones.get(`Bip01_${side}_${next}`);
      joint.parent.updateWorldMatrix(true, true);
      const direction = worldPosition(child).sub(worldPosition(joint)).normalize();
      const turn = new THREE.Quaternion().setFromUnitVectors(direction, out);
      const world = worldQuaternion(joint).premultiply(turn);
      const parent = worldQuaternion(joint.parent);
      joint.quaternion.copy(parent.invert().multiply(world)).normalize();
      joint.updateMatrixWorld(true);
    }
  }
}

/** Loads the pack and two crew skeletons and reports how their reference poses compare. */
window.inspectUal = async () => {
  const source = await loadGltf('/__ual/standard.glb');
  rememberRest(source.scene);
  const sourceBones = bonesOf(source.scene);
  const tpose = source.animations.find((clip) => clip.name === 'A_TPose');
  const report = { clips: source.animations.length };
  poseSource(source.scene, null, 0);
  report.sourceBind = armElevation(sourceBones, 'upperarm_l', 'lowerarm_l');
  for (const time of [0, tpose.duration * 0.5, tpose.duration]) {
    poseSource(source.scene, tpose, time);
    report[`sourceTPose@${time.toFixed(2)}`] = +armElevation(sourceBones, 'upperarm_l', 'lowerarm_l').toFixed(1);
  }
  for (const file of ['termite', 'doris']) {
    const crew = await loadGltf(`/models/characters/${file}.glb`);
    crew.scene.updateMatrixWorld(true);
    const bones = bonesOf(crew.scene);
    const missing = Object.values(UAL_TO_BIPED).filter((name) => !bones.has(name));
    const bindElevation = +armElevation(bones, 'Bip01_L_UpperArm', 'Bip01_L_Forearm').toFixed(1);
    tPose(bones, bodyFrame(bones, TARGET_FRAME));
    report[file] = { elevation: bindElevation, tPosed: +armElevation(bones, 'Bip01_L_UpperArm', 'Bip01_L_Forearm').toFixed(1), tPosedRight: +armElevation(bones, 'Bip01_R_UpperArm', 'Bip01_R_Forearm').toFixed(1), missing,
      legLength: +worldPosition(bones.get('Bip01_L_Thigh')).distanceTo(worldPosition(bones.get('Bip01_L_Foot'))).toFixed(3),
      hipHeight: +worldPosition(bones.get('Bip01_Pelvis')).y.toFixed(3), frame: bodyFrame(bones, TARGET_FRAME).toArray().map((v) => +v.toFixed(3)) };
  }
  poseSource(source.scene, null, 0);
  report.source = { legLength: +worldPosition(sourceBones.get('thigh_l')).distanceTo(worldPosition(sourceBones.get('foot_l'))).toFixed(3),
    hipHeight: +worldPosition(sourceBones.get('pelvis')).y.toFixed(3), frame: bodyFrame(sourceBones, SOURCE_FRAME).toArray().map((v) => +v.toFixed(3)),
    missing: Object.keys(UAL_TO_BIPED).filter((name) => !sourceBones.has(name)) };
  return report;
};

/**
 * Retargets one source clip onto the crew skeleton in `crew` (a loaded crew GLB
 * scene at its bind pose). `reference` is the source pose that matches the
 * crew's bind pose (the T-pose frame). Returns the clip with rotation tracks for
 * every mapped bone and a position track for the root, and the hips' ground
 * speed from the root-motion copy (`motion`), in the crew's clip units per second.
 */
function retarget(source, sourceClip, reference, crew, name, loop, motion) {
  const sourceBones = bonesOf(source.scene), crewBones = bonesOf(crew.scene);
  crew.scene.updateMatrixWorld(true);
  const pairs = Object.entries(UAL_TO_BIPED).filter(([from, to]) => sourceBones.has(from) && crewBones.has(to));
  const crewRoot = crewBones.get(ROOT), crewHips = crewBones.get('Bip01_Pelvis');
  // Every crew bone's bind rotation, to put back after sampling.
  const restLocal = new Map();
  crewRoot.traverse((object) => restLocal.set(object, object.quaternion.clone()));
  // The crew reference: its bind pose with the arms raised to the pack's T-pose, in world space, and its body frame.
  const crewFrame = bodyFrame(crewBones, TARGET_FRAME);
  tPose(crewBones, crewFrame);
  const crewRest = new Map(pairs.map(([, to]) => [to, worldQuaternion(crewBones.get(to))]));
  const crewHipsRest = worldPosition(crewHips);
  const crewLeg = worldPosition(crewBones.get('Bip01_L_Thigh')).distanceTo(worldPosition(crewBones.get('Bip01_L_Foot')));
  // The source reference pose (its T-pose frame) and the rotation carrying its frame onto the crew's.
  poseSource(source.scene, reference.clip, reference.time);
  const sourceRest = new Map(pairs.map(([from]) => [from, worldQuaternion(sourceBones.get(from))]));
  const align = crewFrame.clone().multiply(bodyFrame(sourceBones, SOURCE_FRAME).invert());
  const sourceHipsRest = worldPosition(sourceBones.get('pelvis'));
  const sourceLeg = worldPosition(sourceBones.get('thigh_l')).distanceTo(worldPosition(sourceBones.get('foot_l')));
  const legScale = crewLeg / sourceLeg;
  // Parents before children, so each local rotation is taken against its parent's new world rotation.
  const order = [];
  crewRoot.traverse((object) => { if (crewRest.has(object.name)) order.push(object); });
  const fromOf = new Map(pairs.map(([from, to]) => [to, from]));
  const frames = Math.max(2, Math.round(sourceClip.duration * FPS) + 1);
  const times = new Float32Array(frames);
  const rotations = new Map(order.map((bone) => [bone.name, new Float32Array(frames * 4)]));
  const rootPositions = new Float32Array(frames * 3);
  const alignInverse = align.clone().invert();
  const rootParentInverse = new THREE.Matrix4().copy(crewRoot.parent.matrixWorld).invert();
  const rootRestLocal = crewRoot.position.clone();
  const crewRootRestWorld = worldPosition(crewRoot);
  const delta = new THREE.Quaternion(), wanted = new THREE.Quaternion(), parentWorld = new THREE.Quaternion();
  for (let f = 0; f < frames; f += 1) {
    const time = Math.min(sourceClip.duration, f / FPS);
    times[f] = time;
    poseSource(source.scene, sourceClip, time);
    // The root: its rest place plus the source hips' displacement, scaled to the crew's legs and carried into its frame.
    const shift = worldPosition(sourceBones.get('pelvis')).sub(sourceHipsRest).multiplyScalar(legScale).applyQuaternion(align);
    const rootWorld = crewRootRestWorld.clone().add(shift);
    const rootLocal = rootWorld.applyMatrix4(rootParentInverse);
    crewRoot.position.copy(rootLocal);
    rootLocal.toArray(rootPositions, f * 3);
    for (const bone of order) {
      const from = fromOf.get(bone.name);
      // The source bone's rotation away from its reference, re-expressed in the crew's frame, then applied to the crew's rest.
      delta.copy(worldQuaternion(sourceBones.get(from))).multiply(sourceRest.get(from).clone().invert());
      delta.premultiply(align).multiply(alignInverse);
      wanted.copy(delta).multiply(crewRest.get(bone.name));
      bone.parent.updateWorldMatrix(true, false);
      parentWorld.setFromRotationMatrix(bone.parent.matrixWorld);
      bone.quaternion.copy(parentWorld.invert().multiply(wanted)).normalize();
      bone.updateMatrixWorld(false);
      bone.quaternion.toArray(rotations.get(bone.name), f * 4);
    }
  }
  // Leave the crew skeleton at rest for the next clip.
  crewRoot.position.copy(rootRestLocal);
  for (const [object, rest] of restLocal) object.quaternion.copy(rest);
  crew.scene.updateMatrixWorld(true);
  // Keep the quaternions continuous (q and -q are the same rotation; interpolation needs the near one).
  for (const values of rotations.values()) {
    for (let f = 1; f < frames; f += 1) {
      const dot = values[f * 4] * values[f * 4 - 4] + values[f * 4 + 1] * values[f * 4 - 3] + values[f * 4 + 2] * values[f * 4 - 2] + values[f * 4 + 3] * values[f * 4 - 1];
      if (dot < 0) for (let k = 0; k < 4; k += 1) values[f * 4 + k] *= -1;
    }
  }
  const tracks = [new THREE.VectorKeyframeTrack(`${ROOT}.position`, times, rootPositions)];
  for (const [bone, values] of rotations) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  const clip = new THREE.AnimationClip(name, sourceClip.duration, tracks);
  clip.userData = { loop };
  // Ground speed: the root-motion copy's travel per second, in crew units.
  let speed = 0;
  if (motion) {
    const moving = motion.animations.find((candidate) => candidate.name === sourceClip.name);
    // The root carries the walk in its parent frame (y up); a looping clip sampled at its end wraps to its start,
    // so the travel is read from the root track itself.
    const track = moving?.tracks.find((candidate) => candidate.name === 'root.position');
    if (track) {
      const v = track.values, n = v.length / 3;
      const travel = Math.hypot(v[n * 3 - 3] - v[0], v[n * 3 - 1] - v[2]);
      // In the root's own units (the crew clips' units), not the world's.
      speed = travel / moving.duration * legScale / crewRoot.parent.getWorldScale(new THREE.Vector3()).x;
    }
  }
  return { clip, speed };
}

/**
 * Converts every role in UAL_CLIPS, male and female, into one GLB of clips on
 * the crew's skeleton (no mesh), saved as public/models/animations/crew-clips-ual.glb.
 * Exposed for scripted runs.
 */
window.convertUalClips = async () => {
  const source = await loadGltf('/__ual/standard.glb');
  rememberRest(source.scene);
  const motion = await loadGltf('/__ual/rm.glb').catch(() => null);
  const tpose = source.animations.find((clip) => clip.name === 'A_TPose');
  // The T-pose frame: the one whose upper arms lie nearest the horizontal, as the crew's bind pose does.
  const sourceBones = bonesOf(source.scene);
  let reference = { clip: tpose, time: 0 }, best = Infinity;
  for (let t = 0; t <= tpose.duration + 1e-6; t += 1 / FPS) {
    poseSource(source.scene, tpose, t);
    const off = Math.abs(armElevation(sourceBones, 'upperarm_l', 'lowerarm_l'));
    if (off < best) { best = off; reference = { clip: tpose, time: t }; }
  }
  const clips = [];
  const results = [];
  let skeleton = null;
  for (const female of [false, true]) {
    const crew = await loadGltf(`/models/characters/${female ? 'doris' : 'termite'}.glb`);
    rememberRest(crew.scene);
    for (const entry of UAL_CLIPS) {
      const sourceClip = source.animations.find((clip) => clip.name === entry.clip);
      if (!sourceClip) throw new Error(`the pack has no clip ${entry.clip}`);
      const { clip, speed } = retarget(source, sourceClip, reference, crew, clipName(entry.role, female), entry.loop, entry.speed ? motion : null);
      clips.push(clip);
      results.push({ name: clip.name, from: entry.clip, duration: +clip.duration.toFixed(3), tracks: clip.tracks.length, speed: +speed.toFixed(3) });
    }
    // The tracks need their bones in the exported scene: the male crew skeleton, without its meshes, carries every name.
    if (!skeleton) {
      skeleton = crew.scene.getObjectByName(ROOT).clone(true);
      skeleton.traverse((object) => { object.children = object.children.filter((child) => !child.isMesh && !child.isSkinnedMesh); });
    }
  }
  const holder = new THREE.Group();
  holder.add(skeleton);
  const glb = await new GLTFExporter().parseAsync(holder, { binary: true, animations: clips });
  const response = await fetch('/__save-clips?file=crew-clips-ual', { method: 'POST', body: glb });
  if (!response.ok) throw new Error(await response.text());
  return { bytes: glb.byteLength, reference: { time: +reference.time.toFixed(3), elevation: +best.toFixed(1) }, clips: results };
};
