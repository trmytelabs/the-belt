import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { CHARACTER_MODELS } from '../src/three/characterModels.ts';
import { ROCKETBOX_CAST } from '../src/three/rocketboxCast.ts';

// The committed crew models: every listed file exists, stays small enough for
// phones, carries a humanoid skeleton the game recognises, and is listed for
// names the game really uses.
const folder = 'public/models/characters';
// Colour, normal and roughness maps: the largest, Skanky, is about 1.8 MB.
const MAX_BYTES = 2 * 1024 * 1024;

/** The JSON chunk of a GLB file. */
function glbJson(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${path} is a GLB`);
  const length = bytes.readUInt32LE(12);
  assert.equal(bytes.toString('ascii', 16, 20), 'JSON');
  return JSON.parse(bytes.toString('utf8', 20, 20 + length));
}

const sourceText = readdirSync('src', { recursive: true })
  .filter((file) => file.endsWith('.ts'))
  .map((file) => readFileSync(join('src', file), 'utf8'))
  .join('\n');

test('every cast member has one small converted model and real character names', () => {
  const files = new Set();
  const names = new Set();
  for (const casting of ROCKETBOX_CAST) {
    assert.ok(!files.has(casting.file), `${casting.file} is listed once`);
    files.add(casting.file);
    const path = join(folder, `${casting.file}.glb`);
    const size = statSync(path).size;
    assert.ok(size <= MAX_BYTES, `${casting.file}.glb is ${size} bytes`);
    for (const name of casting.names) {
      assert.ok(!names.has(name), `${name} has one model`);
      names.add(name);
      const quoted = [`'${name}'`, `"${name}"`].some((literal) => sourceText.includes(literal));
      assert.ok(quoted, `${name} is a character name used in src/`);
    }
  }
  const committed = readdirSync(folder).filter((file) => file.endsWith('.glb')).map((file) => file.replace(/\.glb$/, ''));
  assert.deepEqual(committed.sort(), [...files].sort(), 'no unlisted models are committed');
  assert.deepEqual(CHARACTER_MODELS.map((entry) => entry.url), ROCKETBOX_CAST.map(({ file }) => `/models/characters/${file}.glb`));
});

test('each model has one skinned mesh, a recognised skeleton and compressed textures', () => {
  const bones = ['bip01head', 'bip01lupperarm', 'bip01rforearm', 'bip01lhand', 'bip01rthigh', 'bip01lcalf', 'bip01rfoot'];
  for (const { file } of ROCKETBOX_CAST) {
    const json = glbJson(join(folder, `${file}.glb`));
    assert.equal(json.skins?.length, 1, `${file} has one skin`);
    const names = new Set(json.nodes.map((node) => (node.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')));
    for (const bone of bones) assert.ok(names.has(bone), `${file} has ${bone}`);
    assert.ok(json.materials.some((material) => /head/i.test(material.name)), `${file} has a head material for Shan's reddening`);
    for (const image of json.images ?? []) assert.ok(['image/jpeg', 'image/png'].includes(image.mimeType), `${file} image ${image.mimeType}`);
    assert.ok(json.images.some((image) => image.mimeType === 'image/jpeg'), `${file} uses JPEG for opaque textures`);
    assert.equal(json.animations, undefined, `${file} carries no animation clips`);
  }
});
