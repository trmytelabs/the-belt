import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BLOOM_GUARD, guardBloom } from '../src/three/bloomGuard.ts';

// One invalid pixel must not black out the frame through the bloom's blur.

test("the bloom's input filter zeroes not-a-number and infinite texels, once", () => {
  const bloom = new UnrealBloomPass(new THREE.Vector2(64, 64), 0.55, 0.5, 0.96);
  const before = bloom.materialHighPassFilter.fragmentShader;
  guardBloom(bloom);
  const after = bloom.materialHighPassFilter.fragmentShader;
  assert.ok(after.includes(BLOOM_GUARD), 'the guard is in the high-pass shader');
  assert.ok(after.indexOf(BLOOM_GUARD) > after.indexOf('vec4 texel = texture2D( tDiffuse, vUv );'), 'right after the texel is fetched');
  assert.ok(after.indexOf(BLOOM_GUARD) < after.indexOf('luminance( texel.xyz )'), 'before anything reads it');
  assert.equal(after.length, before.length + BLOOM_GUARD.length + 4, 'nothing else changes');
  guardBloom(bloom);
  assert.equal(bloom.materialHighPassFilter.fragmentShader, after, 'guarding twice changes nothing');
  bloom.dispose();
});
