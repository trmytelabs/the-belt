import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

import { CHARACTER_MODELS } from '../src/three/characterModels.ts';
import { ROCKETBOX_CAST } from '../src/three/rocketboxCast.ts';
import { CLIP_SPEEDS, CREW_CLIPS_URL, ROCKETBOX_CLIPS, clipName } from '../src/three/rocketboxClips.ts';

// The crew's motion-captured clips: every role ships in both bodies, plays on
// the crew's own skeleton without retargeting, moves bones only by rotation
// (each avatar keeps its proportions) and stays in place on the floor.
const FILE = `public${CREW_CLIPS_URL}`;
// Forty-six clips for both bodies, the seated idles, fidgets and turns included.
const MAX_BYTES = 8 * 1024 * 1024;

/** The JSON chunk and binary chunk of a GLB file. */
function readGlb(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${path} is a GLB`);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binStart = 20 + jsonLength + 8;
  return { json, bin: bytes.subarray(binStart, binStart + bytes.readUInt32LE(20 + jsonLength)) };
}

/** A float accessor's values. */
function floats({ json, bin }, index) {
  const accessor = json.accessors[index];
  assert.equal(accessor.componentType, 5126, 'animation data is float');
  const view = json.bufferViews[accessor.bufferView];
  const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? width * 4;
  const out = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const row = [];
    for (let k = 0; k < width; k += 1) row.push(bin.readFloatLE(offset + i * stride + k * 4));
    out.push(row);
  }
  return out;
}

const clips = readGlb(FILE);
const animations = new Map(clips.json.animations.map((animation) => [animation.name, animation]));
const nodeName = (index) => clips.json.nodes[index].name;
/** The root's translation keys of an animation, in clip units (centimetres). */
const rootKeys = (animation) => {
  const channel = animation.channels.find((c) => c.target.path === 'translation');
  return floats(clips, animation.samplers[channel.sampler].output);
};

test('the clip library is one small GLB holding every role for both bodies', () => {
  const size = statSync(FILE).size;
  assert.ok(size < MAX_BYTES, `${FILE} is ${size} bytes`);
  assert.equal(clips.json.meshes, undefined, 'animation only: no meshes');
  const expected = ROCKETBOX_CLIPS.flatMap(({ role }) => [clipName(role, false), clipName(role, true)]).sort();
  assert.deepEqual([...animations.keys()].sort(), expected);
});

test('clips turn bones and lift the root only, so every avatar keeps its own proportions', () => {
  for (const [name, animation] of animations) {
    const translations = animation.channels.filter((c) => c.target.path === 'translation');
    assert.deepEqual(translations.map((c) => nodeName(c.target.node)), ['Bip01'], `${name} moves only the root's position`);
    assert.ok(animation.channels.every((c) => c.target.path === 'rotation' || c.target.path === 'translation'), `${name} has no scale tracks`);
    assert.ok(animation.channels.filter((c) => c.target.path === 'rotation').length >= 80, `${name} turns the whole skeleton, fingers included`);
    assert.ok(animation.channels.every((c) => !/Footsteps|MotionExtractionHelper/.test(nodeName(c.target.node))), `${name} carries no 3ds Max helpers`);
  }
});

test('every clip plays on every crew model without retargeting', () => {
  const targets = new Set(clips.json.animations.flatMap((animation) => animation.channels.map((c) => nodeName(c.target.node))));
  for (const { file } of ROCKETBOX_CAST) {
    const { json } = readGlb(`public/models/characters/${file}.glb`);
    const names = new Set(json.nodes.map((node) => node.name));
    const missing = [...targets].filter((target) => !names.has(target));
    assert.deepEqual(missing, [], `${file}.glb has every bone the clips turn`);
  }
});

test('each avatar stands at the hip height its body\'s clips were captured at', () => {
  const restHeight = (file) => {
    const { json } = readGlb(`public/models/characters/${file}.glb`);
    const root = json.nodes.find((node) => node.name === 'Bip01');
    return root.matrix ? root.matrix[13] : root.translation?.[1] ?? 0;
  };
  for (const { file, source } of ROCKETBOX_CAST) {
    const female = /Female/.test(source);
    const clipHeight = rootKeys(animations.get(clipName('idle', female)))[0][1];
    assert.ok(Math.abs(restHeight(file) - clipHeight) < 5, `${file}: rest ${restHeight(file)} cm, ${female ? 'female' : 'male'} idle ${clipHeight} cm`);
  }
  // The game picks the matching body for every cast member.
  for (const [index, entry] of CHARACTER_MODELS.entries()) {
    assert.equal(entry.clips, /Female/.test(ROCKETBOX_CAST[index].source) ? 'female' : 'male');
  }
});

test('clips play in place: the game moves the character, the clip keeps only sway and rise', () => {
  // Sway, a step's lean and a gesture's weight shift, never travel (the walk covered 150 cm a cycle before);
  // dancing moves about its spot the most. Bounds in centimetres either way across the floor.
  // Going down to the floor and standing back up shifts the hips the most after the dance.
  // The angry gesture paces about; a turn on the spot steps round its own footprint.
  const bound = (role) => (role === 'dance' ? 35 : role === 'angry' ? 50 : /^turn/.test(role) ? 40 : role === 'crouchIn' || role === 'crouchOut' ? 30 : ['walk', 'walkSlow', 'run', 'idle', 'idleAlt', 'cough', 'crouch', 'shrug'].includes(role) ? 15 : 20);
  for (const { role } of ROCKETBOX_CLIPS) {
    for (const female of [false, true]) {
      const name = clipName(role, female);
      const keys = rootKeys(animations.get(name));
      const range = (axis) => Math.max(...keys.map((key) => key[axis])) - Math.min(...keys.map((key) => key[axis]));
      assert.ok(range(0) < bound(role) && range(2) < bound(role), `${name} stays in place: x ${range(0).toFixed(1)} cm, z ${range(2).toFixed(1)} cm`);
    }
  }
  for (const role of ['walk', 'walkSlow', 'run']) {
    for (const female of [false, true]) {
      const speed = CLIP_SPEEDS[clipName(role, female)];
      assert.ok(speed > 50 && speed < 400, `${clipName(role, female)} records its natural ground speed (${speed} cm/s)`);
    }
  }
});
