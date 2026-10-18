import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve('public/models/driving');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

test('driving models retain their recorded sources, licence and original file hashes', () => {
  assert.equal(manifest.license, 'CC0-1.0');
  assert.equal(Object.keys(manifest.files).filter(p => p.endsWith('.glb')).length, 7);
  for (const kit of ['city', 'roads', 'cars']) {
    assert.match(manifest.sources[kit], /^https:\/\/kenney.nl\/assets\//);
    assert.match(readFileSync(resolve(root, kit, 'LICENSE.txt'), 'utf8'), /Creative Commons Zero, CC0/);
  }
  for (const [path, record] of Object.entries(manifest.files)) {
    const data = readFileSync(resolve(root, path));
    assert.equal(data.length, record.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), record.sha256);
    assert.ok(data.length < 300_000, 'compact local assets');
  }
});

test('every driving GLB has valid geometry and resolves its palette locally', () => {
  for (const path of Object.keys(manifest.files).filter(p => p.endsWith('.glb'))) {
    const data = readFileSync(resolve(root, path));
    assert.equal(data.toString('utf8', 0, 4), 'glTF');
    assert.equal(data.readUInt32LE(4), 2);
    assert.equal(data.readUInt32LE(8), data.length);
    const json = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
    assert.ok(json.meshes.length > 0 && json.nodes.length > 0);
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      const position = json.accessors[primitive.attributes.POSITION];
      assert.ok(position.count > 0 && position.min.every(Number.isFinite) && position.max.every(Number.isFinite));
    }
    for (const image of json.images) {
      assert.equal(image.uri, 'Textures/colormap.png');
      assert.ok(existsSync(resolve(root, dirname(path), image.uri)));
    }
    assert.ok(json.buffers.every(buffer => !buffer.uri), 'geometry stays inside the local GLB');
  }
});
